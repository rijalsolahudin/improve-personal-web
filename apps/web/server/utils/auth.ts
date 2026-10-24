import { serviceContext } from '../services/context'
import { findSessionByToken, type AuthenticatedSession } from '../services/session'
import { apiProblem } from './api-error'
import { readSessionToken, type SessionTokenSource } from './session-cookie'

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

/**
 * Sesi yang lolos autentikasi + kanal yang benar-benar membawa tokennya.
 *
 * `source` ditempel di hasil `requireSession` (bukan dibaca ulang dari cookie di helper lain):
 * nilainya sudah diketahui saat token dibaca, jadi tidak ada pembacaan cookie kedua yang bisa
 * berbeda dari token yang sungguh dipakai. Tipe dasarnya tetap `AuthenticatedSession`, jadi pemanggil
 * lama tidak perlu berubah - ini penambahan field, bukan penggantian bentuk.
 */
export type AuthenticatedSessionWithSource = AuthenticatedSession & {
  readonly source: SessionTokenSource
}

/** Nama header penanda pemilik request untuk endpoint sync (huruf kecil; `getHeader` case-insensitive). */
export const EXPECTED_USER_ID_HEADER = 'x-expected-user-id'

export async function requireSession(event: H3Event): Promise<AuthenticatedSessionWithSource> {
  const candidate = readSessionToken(event)
  // Tanpa token sama sekali tetap `UNAUTHENTICATED` (bukan `FORBIDDEN`): klien tidak perlu tahu
  // bedanya "tidak ada kredensial" dan "kredensial tidak berlaku".
  if (!candidate) throw apiProblem('UNAUTHENTICATED')

  const ctx = serviceContext(event)
  const session = await findSessionByToken(ctx, candidate.token)
  if (!session) throw apiProblem('UNAUTHENTICATED')

  return { ...session, source: candidate.source }
}

/**
 * Header penanda pemilik request - WAJIB hanya bagi request yang tokennya diambil dari COOKIE,
 * opsional bagi klien yang tokennya datang dari `Authorization: Bearer` (temuan H1 + L1 + A2).
 *
 * Kenapa perlu: auth klien web berbasis cookie, dan cookie itu ambient - SATU cookie untuk semua tab
 * di origin ini. User yang logout di tab A lalu login sebagai akun lain di tab B membuat request dari
 * tab A otomatis membawa sesi akun B. Tanpa penanda, tab A (yang masih memegang data akun lama di
 * memori, dan belum sempat reload) akan menulis ke akun B lewat `push`, dan `pull`-nya menyerahkan
 * data akun B ke tab A - alias kebocoran lintas akun yang tidak terlihat sebagai error.
 *
 * Kenapa penentunya SUMBER TOKEN yang benar-benar dipakai (`auth.source`), bukan keberadaan cookie
 * (A2): klien bearer yang sah bisa kebetulan mengirim cookie `ip_session` pendek/asing - sisa domain
 * lain, cookie rusak, atau cookie yang sudah dibersihkan. Token request itu tetap dari header, jadi
 * tidak ada kredensial ambient yang dipinjam dan tidak ada yang perlu dijaga; mewajibkan header di
 * sana hanya menolak klien yang benar dengan alasan yang tidak berlaku untuknya. Sebaliknya, begitu
 * cookie yang panjangnya VALID ada, `readSessionToken` memprioritaskannya - token request itu memang
 * cookie, dan aturan header berlaku meski klien juga mengirim bearer.
 *
 * Kenapa bukan `Origin`/`Sec-Fetch-*` (L1): Fetch Metadata tidak dikirim semua browser - Safari
 * < 16.4 dan WebView turunannya tidak mengirim `Origin` pada `GET` same-origin. Heuristik header
 * membuat browser seperti itu diklasifikasikan "klien native" sehingga justru lolos dari kewajiban
 * ini, padahal cookie ambient-nya tetap ikut terkirim: kontrolnya bolong tepat di klien yang paling
 * membutuhkannya. Cookie sesi tidak bisa "tidak ada" pada klien yang memang memakai cookie - ia
 * terlihat langsung di request, tanpa bergantung pada metadata browser. `auth.client` juga tidak
 * dipakai: yang berbahaya adalah TRANSPORT-nya (cookie ikut terkirim ke setiap request tab ini),
 * bukan kanal tempat token itu dulu diterbitkan.
 *
 * Kenapa klien native tidak perlu: mobile/native memakai `Authorization: Bearer` tanpa cookie jar,
 * jadi tidak ada kredensial ambient yang bisa dipinjam tab lain - tidak ada yang perlu dijaga di sini
 * dan klien yang belum mengirim header ini tidak mendadak mati.
 *
 * Kontraknya:
 * - `source: 'cookie'` + header sama dengan `auth.userId` = lanjut.
 * - `source: 'cookie'` + header TIDAK ADA = `FORBIDDEN` (fail-closed): tab basi yang belum reload
 *   memang tidak akan mengirim header ini, dan justru request itulah yang harus ditolak.
 * - `source: 'cookie'` + header ADA tapi berbeda (termasuk kosong) = `FORBIDDEN`.
 * - `source: 'bearer'` = header opsional; kalau dikirim dan berbeda dari `auth.userId` tetap
 *   `FORBIDDEN`.
 * - Semua penolakan terjadi SEBELUM rate limit, parsing body/query, dan query DB apa pun: request
 *   yang jelas bukan untuk sesi ini tidak boleh menghabiskan jatah atau menyentuh data.
 *
 * Nilai header tidak pernah dicatat ke log dan tidak dipantulkan kembali ke klien.
 */
export function requireExpectedUserId(event: H3Event, auth: AuthenticatedSessionWithSource): void {
  const expected = getHeader(event, EXPECTED_USER_ID_HEADER)

  // `''` = header dikirim kosong, dan itu tidak mungkin id user yang sah - tidak cocok (fail-closed).
  if (expected === auth.userId) return

  // Hanya token dari cookie yang merupakan kredensial ambient: klien bearer boleh melewati header.
  if (expected === undefined && auth.source === 'bearer') return

  throw apiProblem('FORBIDDEN')
}
