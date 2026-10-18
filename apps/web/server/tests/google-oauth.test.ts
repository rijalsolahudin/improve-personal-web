// @vitest-environment node
//
// Login Google (OAuth 2.0 + PKCE) - level SERVICE terhadap Postgres nyata, tanpa menyentuh jaringan.
//
// Yang dibuktikan di sini adalah temuan M2 audit keamanan: `state` harus TERIKAT ke browser yang
// memulai flow. Sebelum perbaikan, siapa pun yang menguasai URL callback (code + state miliknya
// sendiri) bisa membuat browser korban berakhir dengan sesi akun penyerang.
//
// Batas keluar ke Google diganti `fetchImpl` (seam yang memang disediakan service), jadi test ini
// tidak bergantung pada jaringan: yang diuji klaim ID token + aturan binding, bukan ketersediaan
// Google.
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { googleStartResultSchema } from '@improve-personal/contracts'

import { completeGoogleLogin, startGoogleLogin, type GoogleFetchLike } from '../services/google'
import { oauthStates } from '../db/schema'
import { sha256Hex } from '../utils/crypto'
import { matchesOAuthStateBinding, OAUTH_STATE_COOKIE_NAME } from '../utils/oauth-state-cookie'
import { closeTestDb, testDb, type Fixture } from './helpers/harness'
import { captureProblem, testScope } from './helpers/scope'

const scope = testScope()

afterEach(async () => {
  await scope.dispose()
})

afterAll(async () => {
  await closeTestDb()
})

/** `state` + baris `oauth_states`-nya, dibuat lewat jalur produksi (`startGoogleLogin`). */
async function startedState(fixture: Fixture, client: 'web' | 'mobile') {
  const start = await startGoogleLogin(fixture.ctx(), { client })
  const state = new URL(start.authorizationUrl).searchParams.get('state') ?? ''
  const rows = await testDb()
    .select()
    .from(oauthStates)
    .where(eq(oauthStates.stateHash, sha256Hex(state)))
  const row = rows.at(0)

  if (!row) throw new Error('baris oauth_states tidak dibuat oleh startGoogleLogin')

  return { start, state, row }
}

/** ID token "dari Google": klaim lengkap, tanda tangan tidak (jalur TLS token endpoint). */
function idToken(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')

  return `${header}.${payload}.tanda-tangan-tidak-diverifikasi`
}

/** Fetch palsu untuk token endpoint; `calls` dipakai membuktikan panggilan TIDAK terjadi. */
function tokenEndpoint(
  nonce: string,
  email: string,
  overrides: Record<string, unknown> = {},
): { fetchImpl: GoogleFetchLike; calls: () => number } {
  let calls = 0

  const fetchImpl: GoogleFetchLike = async () => {
    calls += 1

    return new Response(
      JSON.stringify({
        id_token: idToken({
          sub: 'google-sub-qa',
          email,
          email_verified: true,
          aud: 'qa-google-client-id',
          iss: 'https://accounts.google.com',
          // Jauh di masa depan supaya tetap valid walau ctx memakai `FIXED_NOW`.
          exp: 4_000_000_000,
          nonce,
          ...overrides,
        }),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  return { fetchImpl, calls: () => calls }
}

describe('binding `state` OAuth ke browser yang memulai flow (M2)', () => {
  it('`/start` web mengembalikan `state` untuk dipasang sebagai cookie binding', async () => {
    const fixture = scope.fixture({ prefix: 'google-start-web' })
    const { start } = await startedState(fixture, 'web')

    // `state` mentah memang keluar dari service (handler memakainya untuk cookie), dan NILAI ITU
    // tidak boleh bisa ikut ke body respons - body `mobile` disusun eksplisit dari dua field, dan
    // schema-nya `.strict()` sehingga field `state` akan ditolak kalau suatu saat diselundupkan.
    expect(start.state).toHaveLength(43)
    expect(start.authorizationUrl).toContain(`state=${start.state}`)
    expect(
      googleStartResultSchema.safeParse({
        authorizationUrl: start.authorizationUrl,
        expiresAt: start.expiresAt.toISOString(),
      }).success,
    ).toBe(true)
    expect(
      googleStartResultSchema.safeParse({
        authorizationUrl: start.authorizationUrl,
        expiresAt: start.expiresAt.toISOString(),
        state: start.state,
      }).success,
    ).toBe(false)
    expect(OAUTH_STATE_COOKIE_NAME).toBe('ip_oauth_state')
  })

  it('callback web TANPA cookie binding ditolak, dan tidak ada panggilan keluar ke Google', async () => {
    const fixture = scope.fixture({ prefix: 'google-binding-missing' })
    const { state, row } = await startedState(fixture, 'web')
    const google = tokenEndpoint(row.nonce, fixture.email)

    const problem = await captureProblem(
      completeGoogleLogin(
        fixture.ctx(),
        { code: 'kode-dari-google', state },
        { fetchImpl: google.fetchImpl },
      ),
    )

    expect(problem).toEqual({ code: 'OAUTH_INVALID', statusCode: 400 })
    expect(google.calls(), 'code sempat ditukar walau binding-nya tidak ada').toBe(0)
  })

  it('callback web dengan cookie binding yang tidak cocok ditolak', async () => {
    const fixture = scope.fixture({ prefix: 'google-binding-wrong' })
    const { state, row } = await startedState(fixture, 'web')
    const google = tokenEndpoint(row.nonce, fixture.email)

    const otherState = (await startedState(fixture, 'web')).state
    const problem = await captureProblem(
      completeGoogleLogin(
        fixture.ctx(),
        { code: 'kode', state },
        { fetchImpl: google.fetchImpl, stateBinding: sha256Hex(otherState) },
      ),
    )

    expect(problem?.code).toBe('OAUTH_INVALID')
    expect(google.calls()).toBe(0)

    // `matchesOAuthStateBinding` sendiri: nilai rusak/kosong tidak membuatnya melempar.
    expect(matchesOAuthStateBinding(sha256Hex(state), state)).toBe(true)
    expect(matchesOAuthStateBinding(null, state)).toBe(false)
    expect(matchesOAuthStateBinding('bukan-hex', state)).toBe(false)
  })

  it('callback web dengan cookie binding yang cocok berhasil, dan `state`-nya sekali pakai', async () => {
    const fixture = scope.fixture({ prefix: 'google-binding-ok' })
    const { state, row } = await startedState(fixture, 'web')
    const google = tokenEndpoint(row.nonce, fixture.email)
    const stateBinding = sha256Hex(state)

    const result = await completeGoogleLogin(
      fixture.ctx(),
      { code: 'kode-dari-google', state },
      { fetchImpl: google.fetchImpl, stateBinding },
    )

    expect(result.client).toBe('web')
    expect(result.login.token.length).toBeGreaterThanOrEqual(32)
    expect(google.calls()).toBe(1)

    // `state` sudah dikonsumsi: callback kedua dengan `code` BARU sekalipun tetap gagal - jadi
    // cookie binding yang masih ada di browser tidak bisa dipakai mendaur ulang state itu.
    const replay = await captureProblem(
      completeGoogleLogin(
        fixture.ctx(),
        { code: 'kode-dari-google', state },
        { fetchImpl: google.fetchImpl, stateBinding },
      ),
    )
    expect(replay?.code).toBe('OAUTH_INVALID')
    expect(google.calls(), 'code ditukar lagi setelah state dikonsumsi').toBe(1)
  })

  it('klien mobile tidak butuh cookie binding, dan itu ditentukan BARIS state (bukan klien)', async () => {
    const fixture = scope.fixture({ prefix: 'google-binding-mobile' })
    const { state, row } = await startedState(fixture, 'mobile')
    const google = tokenEndpoint(row.nonce, fixture.email)

    const result = await completeGoogleLogin(
      fixture.ctx(),
      { code: 'kode-dari-google', state },
      { fetchImpl: google.fetchImpl, stateBinding: null },
    )

    expect(result.client).toBe('mobile')
    expect(google.calls()).toBe(1)

    // Arah sebaliknya: state web tetap WAJIB memakai binding walau pemanggil mengaku-ngaku. Yang
    // menentukan `state.client` dari DB, jadi penyerang tidak bisa memilih jalur yang lebih lemah.
    const webFixture = scope.fixture({ prefix: 'google-binding-web-forced' })
    const web = await startedState(webFixture, 'web')
    const webGoogle = tokenEndpoint(web.row.nonce, webFixture.email)
    const forced = await captureProblem(
      completeGoogleLogin(
        webFixture.ctx(),
        { code: 'kode', state: web.state },
        { fetchImpl: webGoogle.fetchImpl, stateBinding: null },
      ),
    )
    expect(forced?.code).toBe('OAUTH_INVALID')
    expect(webGoogle.calls()).toBe(0)
  })

  it('validasi klaim ID token tetap berlaku setelah perubahan binding', async () => {
    // Setiap kasus butuh `state` BARU (konsumsi bersifat sekali pakai), jadi tiap kasus memakai
    // fixture sendiri - email + IP unik, dan dibersihkan `scope.dispose`.
    const cases: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ['nonce berbeda', { nonce: 'nonce-lain' }],
      ['audience aplikasi lain', { aud: 'client-id-aplikasi-lain' }],
      ['issuer tidak dikenal', { iss: 'https://evil.test' }],
      ['sudah kedaluwarsa', { exp: 1 }],
      ['email belum diverifikasi', { email_verified: false }],
      ['email bukan string', { email: 42 }],
    ]

    for (const [label, overrides] of cases) {
      const fixture = scope.fixture({ prefix: 'google-claims' })
      const { state, row } = await startedState(fixture, 'web')
      const google = tokenEndpoint(row.nonce, fixture.email, overrides)

      const problem = await captureProblem(
        completeGoogleLogin(
          fixture.ctx(),
          { code: 'kode', state },
          { fetchImpl: google.fetchImpl, stateBinding: sha256Hex(state) },
        ),
      )

      expect(problem?.code, label).toBe('OAUTH_INVALID')
      // Binding-nya benar, jadi code MEMANG ditukar - yang menolak adalah validasi klaim.
      expect(google.calls(), label).toBe(1)
    }
  })
})
