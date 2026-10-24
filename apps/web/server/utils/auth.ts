import { serviceContext } from '../services/context'
import { findSessionByToken, type AuthenticatedSession } from '../services/session'
import { apiProblem } from './api-error'
import { readSessionToken, SESSION_COOKIE_NAME } from './session-cookie'

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
 * Apakah request ini membawa kredensial ambient (cookie sesi)?
 *
 * Inilah satu-satunya penentu "request ini bisa berbagi sesi dengan tab lain". Cookie kosong
 * dianggap tidak ada - sama seperti middleware CSRF (`10-csrf.ts`) membaca cookie ini: `Set-Cookie`
 * pembersihan (`Max-Age=0`) tidak meninggalkan kredensial apa pun untuk dipinjam.
 */
function carriesSessionCookie(event: H3Event): boolean {
  return Boolean(getCookie(event, SESSION_COOKIE_NAME))
}

/**
 * Header penanda pemilik request - WAJIB bagi request yang membawa cookie sesi, opsional bagi klien
 * yang murni memakai `Authorization: Bearer` (temuan H1 + L1 security review).
 *
 * Kenapa perlu: auth klien web berbasis cookie, dan cookie itu ambient - SATU cookie untuk semua tab
 * di origin ini. User yang logout di tab A lalu login sebagai akun lain di tab B membuat request dari
 * tab A otomatis membawa sesi akun B. Tanpa penanda, tab A (yang masih memegang data akun lama di
 * memori, dan belum sempat reload) akan menulis ke akun B lewat `push`, dan `pull`-nya menyerahkan
 * data akun B ke tab A - alias kebocoran lintas akun yang tidak terlihat sebagai error.
 *
 * Kenapa penentunya KEBERADAAN COOKIE SESI, bukan `Origin`/`Sec-Fetch-*` (L1): Fetch Metadata tidak
 * dikirim semua browser - Safari < 16.4 dan WebView turunannya tidak mengirim `Origin` pada `GET`
 * same-origin. Heuristik header membuat browser seperti itu diklasifikasikan "klien native" sehingga
 * justru lolos dari kewajiban ini, padahal cookie ambient-nya tetap ikut terkirim: kontrolnya bolong
 * tepat di klien yang paling membutuhkannya. Cookie sesi tidak bisa "tidak ada" pada klien yang
 * memang memakai cookie - ia terlihat langsung di request, tanpa bergantung pada metadata browser.
 * `auth.client` juga tidak dipakai: yang berbahaya adalah TRANSPORT-nya (cookie ikut terkirim ke
 * setiap request tab ini), bukan kanal tempat token itu dulu diterbitkan.
 *
 * Kenapa klien native tidak perlu: mobile/native memakai `Authorization: Bearer` tanpa cookie jar,
 * jadi tidak ada kredensial ambient yang bisa dipinjam tab lain - tidak ada yang perlu dijaga di sini
 * dan klien yang belum mengirim header ini tidak mendadak mati.
 *
 * Kontraknya:
 * - Ada cookie sesi + header sama dengan `auth.userId` = lanjut.
 * - Ada cookie sesi + header TIDAK ADA = `FORBIDDEN` (fail-closed): tab basi yang belum reload memang
 *   tidak akan mengirim header ini, dan justru request itulah yang harus ditolak.
 * - Ada cookie sesi + header ADA tapi berbeda (termasuk kosong) = `FORBIDDEN`.
 * - TIDAK ada cookie sesi (jalur bearer) = header opsional, perilaku lama tetap berlaku.
 * - Semua penolakan terjadi SEBELUM rate limit, parsing body/query, dan query DB apa pun: request
 *   yang jelas bukan untuk sesi ini tidak boleh menghabiskan jatah atau menyentuh data.
 *
 * Nilai header tidak pernah dicatat ke log dan tidak dipantulkan kembali ke klien.
 */
export function requireExpectedUserId(event: H3Event, auth: AuthenticatedSession): void {
  const expected = getHeader(event, EXPECTED_USER_ID_HEADER)

  // `''` = header dikirim kosong, dan itu tidak mungkin id user yang sah - tidak cocok (fail-closed).
  if (expected === auth.userId) return

  // Tanpa cookie sesi tidak ada kredensial ambient: hanya klien bearer yang boleh melewati header.
  if (expected === undefined && !carriesSessionCookie(event)) return

  throw apiProblem('FORBIDDEN')
}
