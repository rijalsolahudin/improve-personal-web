/**
 * Path request untuk jalur yang harus mengenali rute API SEBELUM handler jalan.
 *
 * Dipakai middleware CSRF dan plugin error global: keduanya memutuskan sesuatu berdasarkan "ini
 * request `/v1` atau bukan", dan keputusan itu tidak boleh bergantung pada string mentah dari klien.
 *
 * `event.path` masih memuat query string (`/v1/sync/pull?cursor=0`), jadi path-nya diambil dari
 * `getRequestURL` - sumber yang sama dengan log server. Kalau URL-nya tidak bisa dibangun (header
 * `Host` hilang/rusak) yang dipakai path mentah tanpa query; tidak ada tebakan host di sini.
 */

const API_PATH_PREFIX = '/v1'

/** Endpoint publik di luar `/v1`. */
const HEALTH_PATH = '/health'

export function requestPath(event: H3Event): string {
  try {
    return getRequestURL(event).pathname
  } catch {
    // Tanpa `Host` yang valid, `getRequestURL` melempar. Path mentah tetap aman dipakai karena
    // tidak ada keputusan yang bergantung pada host di sini.
    const fallback = event.path?.split('?')[0]
    return fallback ?? ''
  }
}

/**
 * `true` untuk `/v1`, `/v1/**`, dan `/health` - satu-satunya path yang dilayani `server/routes`.
 *
 * Prefix dibandingkan sebagai segmen (`/v1/...`), bukan `startsWith('/v1')`, supaya `/v1abc`
 * tidak ikut dianggap rute API.
 */
export function isApiRequest(event: H3Event): boolean {
  const path = requestPath(event)
  return path === API_PATH_PREFIX || path.startsWith(`${API_PATH_PREFIX}/`) || path === HEALTH_PATH
}
