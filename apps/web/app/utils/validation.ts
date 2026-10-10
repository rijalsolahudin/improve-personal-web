import { APP_HOME_PATH } from './features'

/** RFC 5321: panjang maksimal alamat email. */
export const EMAIL_MAX_LENGTH = 254
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Validasi format saja (UX). Validasi sebenarnya tetap di server. */
export function isValidEmail(value: string): boolean {
  const email = value.trim()
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(email)
}

const INTERNAL_ORIGIN = 'http://internal.invalid'

/**
 * Redirect setelah login hanya ke path relatif di dalam app (security.md §5: cegah open redirect).
 * Menolak URL absolut, protocol-relative (`//`), backslash, dan path di luar `/app`.
 */
export function safeRedirectPath(input: unknown, fallback: string = APP_HOME_PATH): string {
  if (typeof input !== 'string' || !input.startsWith('/') || /^\/[/\\]/.test(input)) return fallback
  if (input.includes('\\')) return fallback

  let url: URL
  try {
    url = new URL(input, INTERNAL_ORIGIN)
  } catch {
    return fallback
  }
  if (url.origin !== INTERNAL_ORIGIN) return fallback

  const isInsideApp = url.pathname === APP_HOME_PATH || url.pathname.startsWith(`${APP_HOME_PATH}/`)
  return isInsideApp ? `${url.pathname}${url.search}${url.hash}` : fallback
}
