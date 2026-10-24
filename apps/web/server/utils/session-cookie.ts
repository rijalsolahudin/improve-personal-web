import { SESSION_TOKEN_MIN_LENGTH } from '@improve-personal/contracts'

import type { ServerEnv } from './env'

/**
 * Cookie sesi untuk client `web`, dan bearer token untuk client `mobile`.
 *
 * Web memakai cookie karena token mentah tidak boleh menyentuh JavaScript: cookie `HttpOnly` tidak
 * bisa dibaca XSS, sedangkan token di `localStorage` bisa (security.md §7). Mobile tidak punya
 * cookie jar dan memang menyimpan token di SecureStore, jadi jalurnya `Authorization: Bearer`.
 *
 * `SameSite=Lax` + `Secure` + `Path=/`:
 * - `Lax` (bukan `None`) memblokir cookie pada POST lintas situs, jadi CSRF dari situs lain tidak
 *   mendapat sesi sama sekali. Ini lapisan pertama; lapisan kedua ada di middleware.
 * - `Secure` selalu menyala kecuali di `development` (dev berjalan di http://localhost, dan cookie
 *   `Secure` di http tidak akan pernah dikirim balik).
 */

export const SESSION_COOKIE_NAME = 'ip_session'

/** Default max-age cookie: 1 hari. Nilai sesungguhnya ditentukan `expiresAt` dari sesi di DB. */
const MS_PER_SECOND = 1_000

const BEARER_PREFIX = 'bearer '

export type SessionCookieOptions = {
  readonly expiresAt: Date
  readonly now: Date
}

function cookieMaxAge(options: SessionCookieOptions): number {
  const remainingSeconds = Math.floor(
    (options.expiresAt.getTime() - options.now.getTime()) / MS_PER_SECOND,
  )
  return Math.max(0, remainingSeconds)
}

export function setSessionCookie(
  event: H3Event,
  env: ServerEnv,
  token: string,
  options: SessionCookieOptions,
): void {
  setCookie(event, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.appEnv !== 'development',
    sameSite: 'lax',
    path: '/',
    maxAge: cookieMaxAge(options),
  })
}

export function clearSessionCookie(event: H3Event, env: ServerEnv): void {
  setCookie(event, SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: env.appEnv !== 'development',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

/** Kanal yang BENAR-BENAR dipakai request ini untuk membawa token sesi. */
export type SessionTokenSource = 'cookie' | 'bearer'

export type RequestSessionToken = {
  readonly token: string
  readonly source: SessionTokenSource
}

/**
 * Token dari request ini beserta asalnya, atau `null`.
 *
 * Cookie diprioritaskan; kalau tidak ada (atau isinya tidak mungkin token sah karena lebih pendek
 * dari `SESSION_TOKEN_MIN_LENGTH`), header `Authorization: Bearer` dipakai (mobile). Header dengan
 * skema lain (mis. `Basic`) diabaikan - bukan galat, tapi juga tidak pernah diperlakukan sebagai
 * token.
 *
 * `source` adalah kanal yang token itu benar-benar diambil darinya, BUKAN "apakah ada cookie di
 * request ini". Bedanya penting: klien bearer yang sah bisa kebetulan mengirim cookie `ip_session`
 * pendek/asing (sisa domain lain, cookie rusak). Token yang dipakai request itu tetap bearer, jadi
 * tidak ada kredensial ambient yang perlu dijaga di sana.
 */
export function readSessionToken(event: H3Event): RequestSessionToken | null {
  const fromCookie = getCookie(event, SESSION_COOKIE_NAME)
  if (fromCookie && fromCookie.length >= SESSION_TOKEN_MIN_LENGTH) {
    return { token: fromCookie, source: 'cookie' }
  }

  const header = getHeader(event, 'authorization')
  if (!header) return null

  if (header.toLowerCase().startsWith(BEARER_PREFIX)) {
    const token = header.slice(BEARER_PREFIX.length).trim()
    if (token.length >= SESSION_TOKEN_MIN_LENGTH) return { token, source: 'bearer' }
  }

  return null
}
