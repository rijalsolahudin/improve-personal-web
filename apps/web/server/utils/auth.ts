import { serviceContext } from '../services/context'
import { findSessionByToken, type AuthenticatedSession } from '../services/session'
import { apiProblem } from './api-error'
import { readSessionToken } from './session-cookie'

/**
 * Autentikasi request.
 *
 * Setiap handler yang tidak terdaftar publik memanggil ini di baris pertama:
 * `const auth = await requireSession(event)`. `user_id` SELALU dari sini - tidak pernah dari body,
 * query, atau param URL (ARCHITECTURE.md §8). Itu sebabnya tidak ada satu pun service yang menerima
 * `userId` yang berasal dari input client.
 *
 * Hasilnya sengaja hanya data yang dibutuhkan handler (id, email, perangkat, client) - bukan baris
 * sesi mentah. Yang tidak ada di sini tidak bisa bocor ke respons.
 */

export type { AuthenticatedSession }

/** Nama header penanda pemilik request untuk endpoint sync (huruf kecil; `getHeader` case-insensitive). */
export const EXPECTED_USER_ID_HEADER = 'x-expected-user-id'

export async function requireSession(event: H3Event): Promise<AuthenticatedSession> {
  const token = readSessionToken(event)
  // Tanpa token sama sekali tetap `UNAUTHENTICATED` (bukan `FORBIDDEN`): klien tidak perlu tahu
  // bedanya "tidak ada kredensial" dan "kredensial tidak berlaku".
  if (!token) throw apiProblem('UNAUTHENTICATED')

  const ctx = serviceContext(event)
  const session = await findSessionByToken(ctx, token)
  if (!session) throw apiProblem('UNAUTHENTICATED')

  return session
}

/**
 * Penanda request yang datang dari browser. Salah satu header ini ada = browser.
 *
 * Kenapa penanda ini yang dipakai, bukan mis. `User-Agent`:
 * - `Sec-Fetch-*` diset browser sendiri dan TIDAK bisa dipalsukan JavaScript situs lain; `Origin`
 *   juga diset browser untuk request lintas origin (dan oleh `fetch` same-origin modern). Ketiganya
 *   tidak dikirim klien native/CLI.
 * - Klien mobile memakai `Authorization: Bearer` tanpa cookie jar, jadi tidak punya kredensial
 *   ambient yang bisa "dipinjam" tab lain - ia memang tidak perlu header ini (lihat `requireExpectedUserId`).
 */
const BROWSER_REQUEST_HEADERS = ['origin', 'sec-fetch-site', 'sec-fetch-mode'] as const

function isBrowserRequest(event: H3Event): boolean {
  return BROWSER_REQUEST_HEADERS.some((name) => getHeader(event, name) !== undefined)
}

/**
 * Header penanda pemilik request - WAJIB untuk klien browser, opsional untuk klien native
 * (temuan H1 security review).
 *
 * Kenapa perlu: auth klien web berbasis cookie, dan cookie itu ambient - SATU cookie untuk semua tab
 * di origin ini. User yang logout di tab A lalu login sebagai akun lain di tab B membuat request dari
 * tab A otomatis membawa sesi akun B. Tanpa penanda, tab A (yang masih memegang data akun lama di
 * memori, dan belum sempat reload) akan menulis ke akun B lewat `push`, dan `pull`-nya menyerahkan
 * data akun B ke tab A - alias kebocoran lintas akun yang tidak terlihat sebagai error.
 *
 * Kontraknya:
 * - Request dari BROWSER (membawa `Origin`, `Sec-Fetch-Site`, atau `Sec-Fetch-Mode`) WAJIB membawa
 *   header ini dan nilainya harus sama dengan `auth.userId`. Tidak ada header = `FORBIDDEN`
 *   (fail-closed): tab basi yang belum reload memang tidak akan mengirim header ini, dan justru
 *   request itulah yang harus ditolak.
 * - Request TANPA penanda browser (native/mobile, CLI) boleh tanpa header - perilaku lama tetap
 *   berlaku, jadi klien yang belum mengirim header ini tidak mendadak mati.
 * - Header ADA dan sama dengan `auth.userId` = lanjut.
 * - Header ADA dan berbeda (termasuk kosong) = `FORBIDDEN` SEBELUM rate limit, parsing body, atau
 *   query DB apa pun: request yang jelas bukan untuk sesi ini tidak boleh menghabiskan jatah atau
 *   menyentuh data.
 *
 * Nilai header tidak pernah dicatat ke log dan tidak dipantulkan kembali ke klien.
 */
export function requireExpectedUserId(event: H3Event, auth: AuthenticatedSession): void {
  const expected = getHeader(event, EXPECTED_USER_ID_HEADER)

  if (expected === undefined) {
    // Fail-closed khusus browser: penanda browser membuktikan ada cookie ambient yang mungkin milik
    // sesi lain. Klien native tidak punya cookie jar, jadi tidak ada yang perlu dijaga di sini.
    if (isBrowserRequest(event)) throw apiProblem('FORBIDDEN')
    return
  }

  // `''` = header dikirim kosong, dan itu tidak mungkin id user yang sah - tidak cocok (fail-closed).
  if (expected === auth.userId) return

  throw apiProblem('FORBIDDEN')
}
