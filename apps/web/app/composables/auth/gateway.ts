import type { CurrentSessionResult, ErrorCode, WebSessionDto } from '@improve-personal/contracts'

/**
 * Kontrak login (ARCHITECTURE §8–9: `POST /v1/auth/otp/request|verify`, `GET /v1/auth/session`,
 * `POST /v1/auth/logout`, `GET /v1/auth/google/start`). Login ≠ unlock: gateway ini cuma soal sesi
 * API, tidak menyentuh kunci enkripsi.
 *
 * Sesi HANYA lewat cookie `HttpOnly` yang dipasang server - tidak ada token di JS, `localStorage`,
 * atau Pinia (security.md §7). Karena itu `verifyEmailOtp` mengembalikan DTO web yang memang tanpa
 * `token`, dan `webSessionDtoSchema` (`.strict()`) MENOLAK respons yang memuat token: satu token yang
 * salah dikirim server tidak akan pernah masuk ke state client.
 *
 * Implementasi nyatanya di `./http-gateway`.
 */
export interface AuthGateway {
  /** Respons selalu generik - tidak membocorkan apakah email terdaftar. */
  requestEmailOtp(email: string): Promise<void>
  /** Sukses = sesi terbit (cookie sudah dipasang server) + DTO sesi untuk state client. */
  verifyEmailOtp(email: string, code: string): Promise<CurrentSessionResult | WebSessionDto>
  /** Navigasi penuh: server yang me-redirect ke Google, browser yang jadi agen alur OAuth. */
  startGoogleLogin(): Promise<void>
  /** Sesi yang sedang berlaku, atau `null` kalau memang belum ada (401 bukan kegagalan). */
  currentSession(): Promise<CurrentSessionResult | null>
  /** Cabut sesi perangkat ini di server (cookie ikut dibersihkan server). */
  signOut(): Promise<void>
}

/**
 * Kegagalan request auth, selalu membawa `code` kontrak.
 *
 * Pesan SERVER sengaja tidak pernah dibawa ke sini: teks yang dilihat user datang dari i18n, jadi
 * satu pesan server yang bocor (atau disusupi) tidak bisa jadi teks UI (security.md §3).
 */
export class AuthRequestError extends Error {
  readonly code: ErrorCode
  /**
   * `true` = permintaan tidak pernah dapat respons HTTP (offline, DNS, diblokir). Dibedakan dari
   * `INTERNAL` supaya UI bisa bilang "server tidak terjangkau", bukan menyalahkan kode user.
   */
  readonly isNetworkError: boolean

  constructor(code: ErrorCode, options: { isNetworkError?: boolean } = {}) {
    super(`Request auth gagal (${code})`)
    this.name = 'AuthRequestError'
    this.code = code
    this.isNetworkError = options.isNetworkError ?? false
  }
}
