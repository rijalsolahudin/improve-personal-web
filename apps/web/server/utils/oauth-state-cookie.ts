import { safeEqualHex, sha256Hex } from './crypto'
import type { ServerEnv } from './env'

/**
 * Cookie binding untuk login Google (temuan M2 audit keamanan: login CSRF / session fixation).
 *
 * Masalahnya: `state` OAuth di query callback tidak terikat ke SIAPA pun. Penyerang bisa memulai flow
 * dengan akun Google MILIKNYA sendiri, memblokir request callback (yang berisi `code` + `state`), lalu
 * mengirim URL itu ke korban. Server menerbitkan sesi akun penyerang di browser korban: korban tidak
 * sadar sudah login ke akun orang lain, dan semua yang dia tulis setelah itu masuk ke akun penyerang.
 * Pemeriksaan `state` sekali pakai tidak menolong sama sekali di sini - `state` itu memang sah, cuma
 * bukan milik browser yang menyelesaikannya.
 *
 * Perbaikannya: saat `/auth/google/start`, browser yang memulai flow diberi cookie HttpOnly berisi
 * `sha256(state)`. Callback WAJIB membawa cookie yang cocok; kalau tidak, alurnya ditolak. Yang
 * disimpan cuma hash - `state` mentah tidak pernah ditulis ke cookie, jadi cookie itu tidak bisa
 * dipakai ulang untuk mengarang callback (dan nilainya tidak berguna kalau bocor).
 *
 * Kenapa `sha256` dan bukan HMAC dengan pepper: `state` sudah 256-bit acak dari CSPRNG, jadi tidak
 * ada yang bisa ditebak dari hash-nya. Yang perlu dijaga bukan kerahasiaan nilai ini, tapi
 * KETERIKATAN-nya ke browser - itu yang dilakukan cookie.
 *
 * Klien `mobile` (bearer, tanpa cookie jar) TIDAK memakai binding ini, dan itu aman karena alasan yang
 * berbeda: binding ini melindungi dari "cookie sesi diterbitkan untuk browser korban", sedangkan jalur
 * mobile tidak pernah memasang cookie apa pun - responsnya JSON yang tidak bisa dibaca situs lain
 * (tanpa header CORS, browser memblokir pembacaan lintas origin). Aturan itu ditegakkan di service
 * (`completeGoogleLogin`): binding hanya diwajibkan untuk `state` yang client-nya `web`, dan `client`
 * datang dari BARIS `oauth_states` - bukan dari klien.
 */

/** Nama cookie binding. Bukan cookie sesi, jadi tidak pernah dibaca sebagai kredensial. */
export const OAUTH_STATE_COOKIE_NAME = 'ip_oauth_state'

const MS_PER_SECOND = 1_000

/**
 * `secure` mengikuti aturan cookie sesi (`session-cookie.ts`) supaya perilakunya satu: `Secure` mati
 * HANYA di `development` (dev jalan di http://localhost, dan cookie `Secure` di http tidak pernah
 * dikirim balik). Hardening L6 audit (`Secure` dari fakta HTTPS + prefix `__Host-`) berlaku untuk
 * kedua cookie sekaligus dan dikerjakan terpisah.
 */
function cookieAttributes(env: ServerEnv, maxAge: number) {
  return {
    httpOnly: true,
    secure: env.appEnv !== 'development',
    sameSite: 'lax',
    path: '/',
    maxAge,
  } as const
}

export type OAuthStateCookieOptions = {
  /** Kedaluwarsa `state` di DB - binding tidak boleh hidup lebih lama daripada state-nya. */
  readonly expiresAt: Date
  readonly now: Date
}

export function setOAuthStateCookie(
  event: H3Event,
  env: ServerEnv,
  state: string,
  options: OAuthStateCookieOptions,
): void {
  const remainingSeconds = Math.max(
    0,
    Math.floor((options.expiresAt.getTime() - options.now.getTime()) / MS_PER_SECOND),
  )

  setCookie(
    event,
    OAUTH_STATE_COOKIE_NAME,
    sha256Hex(state),
    cookieAttributes(env, remainingSeconds),
  )
}

/** Buang cookie binding. Dipanggil di akhir callback: sekali pakai, apa pun hasilnya. */
export function clearOAuthStateCookie(event: H3Event, env: ServerEnv): void {
  setCookie(event, OAUTH_STATE_COOKIE_NAME, '', cookieAttributes(env, 0))
}

/** Nilai cookie binding dari request ini, atau `null` kalau tidak ada. */
export function readOAuthStateBinding(event: H3Event): string | null {
  const value = getCookie(event, OAUTH_STATE_COOKIE_NAME)
  return value && value.length > 0 ? value : null
}

/**
 * Apakah cookie ini milik `state` yang sedang diselesaikan.
 *
 * Perbandingannya lewat `safeEqualHex` (`timingSafeEqual`, panjang dicek dulu): nilai yang panjangnya
 * bukan 64 hex langsung dianggap tidak cocok, jadi cookie rusak/karangan tidak bisa membuat jalur ini
 * melempar.
 */
export function matchesOAuthStateBinding(binding: string | null, state: string): boolean {
  if (binding === null) return false

  return safeEqualHex(binding, sha256Hex(state))
}
