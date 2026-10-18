import { apiProblem, sendApiProblem } from '../utils/api-error'
import { isApiRequest } from '../utils/api-path'
import { SESSION_COOKIE_NAME } from '../utils/session-cookie'

/**
 * CSRF: cek Origin / Fetch Metadata di middleware, BUKAN `security.csrf` (nuxt-csurf).
 *
 * Alasan pemilihannya (security.md §8 memberi dua opsi, satu harus dipilih):
 * - nuxt-csurf memakai token double-submit yang harus diambil klien dari endpoint token lalu dikirim
 *   di header tiap request mutasi. Itu menambah alur di web (wilayah `app/`) DAN di mobile, padahal
 *   mobile tidak butuh perlindungan CSRF sama sekali: ia tidak punya cookie jar, jadi tidak ada
 *   kredensial "ambient" yang bisa dipakai situs lain. Menyalakannya hanya membuat klien native
 *   gagal tanpa menambah keamanan nyata.
 * - Cek `Origin`/`Sec-Fetch-Site` di server menutup serangan yang sama untuk jalur yang memang
 *   memakai cookie, tanpa token, tanpa endpoint baru, dan tanpa perubahan kontrak.
 *
 * Urutan pertahanannya (cookie sesi sudah `HttpOnly; Secure; SameSite=Lax` - lapisan pertama):
 * 1. Hanya method yang mengubah state (`POST`/`PUT`/`PATCH`/`DELETE`) di `/v1` yang diperiksa
 *    (security.md §8: tidak ada perubahan data lewat GET).
 * 2. Kalau TIDAK ada cookie sesi, tidak ada kredensial ambient yang bisa disalahgunakan situs lain -
 *    jalur ini (mobile bearer, `otp/request`, `google/start`) diteruskan. Cookie `SameSite=Lax` juga
 *    berarti cookie itu memang tidak ikut pada request lintas situs.
 * 3. Kalau ada cookie sesi, request harus terbukti berasal dari origin kita: `Sec-Fetch-Site`
 *    (`same-origin`/`none`) atau, untuk klien yang tidak mengirim Fetch Metadata, `Origin` yang
 *    persis sama dengan origin request ini. Tidak ada header bukti = ditolak (fail-closed).
 *
 * Yang sengaja TIDAK dipakai: allowlist `corsAllowedOrigins`. Origin yang lolos CSRF tapi tidak
 * mendapat header CORS tetap tidak bisa membaca respons, jadi mengizinkannya hanya menambah
 * permukaan serangan tanpa manfaat. Kalau nanti ada portal lain yang memang perlu memanggil API ini
 * lintas origin, itu kerjaan layer CORS tersendiri (env `NUXT_CORS_ALLOWED_ORIGINS` sudah disiapkan).
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Nilai `Sec-Fetch-Site` yang menandakan request bukan lintas situs. */
const SAFE_FETCH_SITES = new Set(['same-origin', 'none'])

function requestOrigin(event: H3Event): string | null {
  try {
    return getRequestURL(event).origin
  } catch {
    return null
  }
}

function isSameOriginRequest(event: H3Event): boolean {
  // `Sec-Fetch-Site` diset browser dan tidak bisa dipalsukan JavaScript situs lain; kalau ada,
  // nilainya yang menentukan.
  const fetchSite = getHeader(event, 'sec-fetch-site')
  if (fetchSite) return SAFE_FETCH_SITES.has(fetchSite.trim().toLowerCase())

  const origin = getHeader(event, 'origin')
  if (!origin) return false

  return origin === requestOrigin(event)
}

export default defineEventHandler((event) => {
  if (!MUTATING_METHODS.has(getMethod(event))) return
  if (!isApiRequest(event)) return

  // Tanpa cookie sesi tidak ada kredensial yang bisa "dipinjam" situs lain.
  if (!getCookie(event, SESSION_COOKIE_NAME)) return

  if (isSameOriginRequest(event)) return

  // Pesan generik yang sama seperti authz gagal: penyerang tidak perlu tahu lapisan mana yang
  // menolaknya (dan klien sah tidak butuh bedanya - sesinya tidak dipakai).
  return sendApiProblem(event, apiProblem('FORBIDDEN'))
})
