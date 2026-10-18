import type { ClientKind, GoogleCallbackQuery } from '@improve-personal/contracts'
import { and, eq, gt, isNull, lt } from 'drizzle-orm'

import { oauthStates } from '../db/schema'
import { apiProblem } from '../utils/api-error'
import { codeChallengeFor, createCodeVerifier, createOAuthRandom, sha256Hex } from '../utils/crypto'
import { matchesOAuthStateBinding } from '../utils/oauth-state-cookie'
import { secondsToMs } from '../utils/uuid'
import type { ServiceContext } from './context'
import { loginDevice, type LoginResult } from './session'
import { consumeRateLimit } from './rate-limit'
import { findOrCreateUserByEmail } from './user'

/**
 * Google SSO: Authorization Code + PKCE (ARCHITECTURE.md §8, PRD F15).
 *
 * Yang dipegang di sini:
 * - `redirect_uri` TIDAK PERNAH datang dari client. Server memetakan `client` (`web`/`mobile`) ke
 *   redirect URI yang terdaftar di env. Kalau klien boleh mengirimnya, endpoint ini jadi open redirect
 *   sekaligus jalur pencurian authorization code.
 * - `state` disimpan sebagai hash dan dikonsumsi ATOMIK: sekali pakai, TTL <= 10 menit. `code_verifier`
 *   PKCE disimpan bersama state, jadi authorization code yang dicuri tidak bisa ditukar tanpa verifier.
 * - Client secret cuma ada di env server (`NUXT_GOOGLE_CLIENT_SECRET`).
 * - ID token divalidasi klaimnya (`aud`, `iss`, `exp`, `nonce`, `email_verified`). Tanda tangannya tidak
 *   diverifikasi ulang karena token diterima LANGSUNG dari token endpoint Google lewat TLS - itu
 *   jalur yang sama yang dipakai pustaka resmi. Kalau nanti token datang lewat jalur lain (mis.
 *   dari klien), verifikasi tanda tangan wajib ditambah (butuh `jose`, dependency baru - lihat laporan).
 */

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

/** TTL `oauth_states` (dbml: `<= 10 menit`). */
const OAUTH_STATE_TTL_SECONDS = 600

/** Scope minimum: identitas + email. Tidak minta akses apa pun ke data user. */
const OAUTH_SCOPE = 'openid email profile'

/** Issuer yang sah untuk ID token Google. */
const VALID_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

/** Batas waktu panggilan ke Google. Login yang menggantung lebih buruk daripada login yang gagal. */
const REQUEST_TIMEOUT_MS = 8_000

const TEXT_ALPHABET_PATTERN = /^[A-Za-z0-9_-]+$/

export type GoogleStartResult = {
  readonly authorizationUrl: string
  readonly expiresAt: Date
  /**
   * `state` mentah (256-bit acak). Dikembalikan supaya handler bisa memasang cookie binding ke browser
   * yang MEMULAI flow (temuan M2) - `state` mentah ini hanya dikirim ke Google, dan tidak pernah masuk
   * body respons (`googleStartResultSchema` sengaja tidak punya field ini; body `mobile` disusun
   * eksplisit dari dua field di atas).
   */
  readonly state: string
}

/**
 * Batas keluar ke Google, disuntik lewat parameter - bukan `fetch` global yang dipanggil langsung.
 *
 * Alasannya testabilitas: menukar authorization code dan memvalidasi ID token adalah dua hal yang
 * paling penting untuk diuji (klaim `iss`/`aud`/`exp`/`nonce`/`email_verified` harus benar-benar
 * menolak yang salah, dan `code_verifier` PKCE harus ikut terkirim), tapi keduanya mustahil diuji tanpa
 * seam ini: test harus benar-benar menembak `oauth2.googleapis.com` kalau implementasinya dipatok.
 * Test yang butuh jaringan bukan test - ia lulus atau gagal tergantung cuaca.
 *
 * Default tetap `globalThis.fetch`, jadi perilaku produksi tidak berubah sama sekali.
 */
export type GoogleFetchLike = (input: string, init?: RequestInit) => Promise<Response>

function redirectUriFor(ctx: ServiceContext, client: ClientKind): string {
  return client === 'web' ? ctx.env.googleRedirectUriWeb : ctx.env.googleRedirectUriMobile
}

/**
 * Mulai login: simpan state + PKCE verifier, lalu kembalikan URL otorisasi Google.
 *
 * Pemetaan `client` -> redirect URI dilakukan di sini satu kali; nilai yang sama dipakai lagi saat
 * menukar code, jadi Google selalu menerima `redirect_uri` yang identik antara dua langkah itu.
 */
export async function startGoogleLogin(
  ctx: ServiceContext,
  input: { readonly client: ClientKind },
): Promise<GoogleStartResult> {
  if (ctx.clientIp) await consumeRateLimit(ctx, 'google:start:ip', `ip:${ctx.clientIp}`)

  const state = createOAuthRandom()
  const codeVerifier = createCodeVerifier()
  const nonce = createOAuthRandom()
  const redirectUri = redirectUriFor(ctx, input.client)
  const expiresAt = new Date(ctx.now.getTime() + secondsToMs(OAUTH_STATE_TTL_SECONDS))

  await ctx.db.insert(oauthStates).values({
    stateHash: sha256Hex(state),
    codeVerifier,
    nonce,
    client: input.client,
    redirectUri,
    createdAt: ctx.now,
    expiresAt,
  })

  const url = new URL(AUTHORIZATION_ENDPOINT)
  url.searchParams.set('client_id', ctx.env.googleClientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', OAUTH_SCOPE)
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  url.searchParams.set('code_challenge', codeChallengeFor(codeVerifier))
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('prompt', 'select_account')

  return { authorizationUrl: url.toString(), expiresAt, state }
}

type GoogleTokenResponse = {
  readonly id_token?: unknown
}

type GoogleIdTokenClaims = {
  readonly sub?: unknown
  readonly email?: unknown
  readonly email_verified?: unknown
  readonly aud?: unknown
  readonly iss?: unknown
  readonly exp?: unknown
  readonly nonce?: unknown
}

function decodeIdTokenClaims(idToken: string): GoogleIdTokenClaims {
  const parts = idToken.split('.')
  const payload = parts[1]
  if (parts.length !== 3 || !payload) throw apiProblem('OAUTH_INVALID')

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as GoogleIdTokenClaims
  } catch {
    throw apiProblem('OAUTH_INVALID')
  }
}

/**
 * Validasi klaim ID token. Setiap kegagalan jadi `OAUTH_INVALID` yang sama - klien tidak perlu tahu
 * klaim mana yang gagal, dan membedakannya hanya membantu penyerang menyetel ulang serangannya.
 */
function assertIdTokenClaims(
  ctx: ServiceContext,
  claims: GoogleIdTokenClaims,
  expectedNonce: string,
): string {
  const audience = claims.aud
  const issuer = claims.iss
  const expiresAt = claims.exp
  const nonce = claims.nonce
  const emailVerified = claims.email_verified
  const email = claims.email

  if (audience !== ctx.env.googleClientId) throw apiProblem('OAUTH_INVALID')
  if (typeof issuer !== 'string' || !VALID_ISSUERS.includes(issuer))
    throw apiProblem('OAUTH_INVALID')
  if (typeof expiresAt !== 'number' || expiresAt * 1000 <= ctx.now.getTime()) {
    throw apiProblem('OAUTH_INVALID')
  }
  if (nonce !== expectedNonce) throw apiProblem('OAUTH_INVALID')
  // Email belum diverifikasi berarti siapa pun bisa mendaftarkan alamat itu di Google - login harus
  // ditolak, bukan "diterima dengan catatan".
  if (emailVerified !== true) throw apiProblem('OAUTH_INVALID')
  if (typeof email !== 'string' || email.length === 0) throw apiProblem('OAUTH_INVALID')

  return email
}

export type GoogleCallbackResult = {
  readonly login: LoginResult
  readonly client: ClientKind
}

export type GoogleCallbackOptions = {
  /**
   * Batas keluar jaringan. Satu-satunya jalur keluar di sini (lihat `GoogleFetchLike`), jadi test bisa
   * membuktikan penukaran code + validasi klaim tanpa menyentuh Google. Default produksi tidak berubah:
   * `globalThis.fetch`.
   */
  readonly fetchImpl?: GoogleFetchLike
  /**
   * Cookie binding dari browser (hash `state`), atau `null` kalau tidak ada / klien mobile (temuan M2).
   * Handler yang membacanya dari request; service sengaja tidak menyentuh cookie.
   */
  readonly stateBinding?: string | null
}

/**
 * Selesaikan login: tukar code (PKCE), validasi ID token, terbitkan sesi.
 *
 * State dikonsumsi PALING AWAL supaya code tidak bisa ditukar dua kali walau ada dua callback paralel
 * dengan state yang sama.
 *
 * Setelah state dikonsumsi, login web diperiksa terhadap cookie binding (`stateBinding`): `state` yang
 * sah tapi TIDAK terikat ke browser ini ditolak. Tanpa pemeriksaan itu, penyerang bisa menyelesaikan
 * flow akun Google miliknya lalu mengirim URL callback-nya ke korban, dan browser korban berakhir
 * dengan sesi akun penyerang (temuan M2 audit keamanan). Yang menentukan apakah binding diwajibkan
 * adalah `state.client` dari BARIS `oauth_states` - bukan apa pun yang dikirim klien - jadi penyerang
 * tidak bisa memilih jalur yang lebih lemah.
 *
 * Rate limit `google:callback:ip` dikonsumsi di sini, sebelum apa pun menyentuh DB: `/v1/auth/google/
 * callback` publik, dan tiap panggilan yang lolos binding memicu satu request keluar ke Google
 * (temuan M4).
 */
export async function completeGoogleLogin(
  ctx: ServiceContext,
  query: GoogleCallbackQuery,
  options: GoogleCallbackOptions = {},
): Promise<GoogleCallbackResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const stateBinding = options.stateBinding ?? null

  if (ctx.clientIp) await consumeRateLimit(ctx, 'google:callback:ip', `ip:${ctx.clientIp}`)

  if (!TEXT_ALPHABET_PATTERN.test(query.state)) throw apiProblem('OAUTH_INVALID')

  const consumed = await ctx.db
    .update(oauthStates)
    .set({ consumedAt: ctx.now })
    .where(
      and(
        eq(oauthStates.stateHash, sha256Hex(query.state)),
        isNull(oauthStates.consumedAt),
        gt(oauthStates.expiresAt, ctx.now),
      ),
    )
    .returning({
      codeVerifier: oauthStates.codeVerifier,
      nonce: oauthStates.nonce,
      client: oauthStates.client,
      redirectUri: oauthStates.redirectUri,
    })

  const state = consumed[0]
  if (!state) throw apiProblem('OAUTH_INVALID')

  // Binding (temuan M2): hanya jalur web yang menerbitkan cookie sesi, jadi hanya jalur itu yang
  // butuh bukti "browser ini yang memulai flow". Kegagalannya memakai `OAUTH_INVALID` yang sama
  // dengan semua sebab lain - penyerang tidak perlu tahu lapisan mana yang menolaknya.
  if (state.client === 'web' && !matchesOAuthStateBinding(stateBinding, query.state))
    throw apiProblem('OAUTH_INVALID')

  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: query.code,
      client_id: ctx.env.googleClientId,
      client_secret: ctx.env.googleClientSecret,
      redirect_uri: state.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: state.codeVerifier,
    }).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) throw apiProblem('OAUTH_INVALID')

  const payload = (await response.json()) as GoogleTokenResponse
  if (typeof payload.id_token !== 'string') throw apiProblem('OAUTH_INVALID')

  const email = assertIdTokenClaims(ctx, decodeIdTokenClaims(payload.id_token), state.nonce)

  const user = await findOrCreateUserByEmail(ctx, email.toLowerCase())
  const login = await loginDevice(ctx, {
    userId: user.id,
    email: user.email,
    client: state.client,
    // Nama perangkat untuk login lewat Google: klien tidak mengirim `device` di query callback
    // (kontrak `googleCallbackQuerySchema` strict), jadi perangkat dicatat dengan label platform.
    device: {
      name: `Google ${state.client}`,
      platform: state.client === 'web' ? 'web' : 'android',
    },
  })

  return { login, client: state.client }
}

/**
 * Buang state yang tidak jadi dipakai.
 *
 * Dipakai task `cleanup-ephemeral`. `oauth_states` tidak punya kolom user, jadi retensinya berbasis
 * TTL, bukan per akun.
 */
export async function deleteExpiredOauthStates(ctx: ServiceContext): Promise<number> {
  const deleted = await ctx.db
    .delete(oauthStates)
    .where(and(lt(oauthStates.expiresAt, ctx.now), isNull(oauthStates.consumedAt)))
    .returning({ stateHash: oauthStates.stateHash })

  return deleted.length
}
