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
 * Header opsional yang menyatakan "request ini MILIK user X" - dipakai endpoint sync (temuan H1
 * security review).
 *
 * Kenapa perlu: auth klien web berbasis cookie, dan cookie itu ambient - SATU cookie untuk semua tab
 * di origin ini. User yang logout di tab A lalu login sebagai akun lain di tab B membuat request dari
 * tab A otomatis membawa sesi akun B. Tanpa penanda, tab A (yang masih memegang data akun lama di
 * memori) akan menulis ke akun B lewat `push`, dan `pull`-nya menyerahkan data akun B ke tab A - alias
 * kebocoran lintas akun yang tidak terlihat sebagai error.
 *
 * Kontraknya:
 * - Header TIDAK ADA = request diproses seperti biasa. Ini yang menjaga build web/mobile lama tetap
 *   jalan (klien versi lama tidak mengirim header ini, dan tidak boleh langsung mati).
 * - Header ADA dan sama dengan `auth.userId` = lanjut.
 * - Header ADA dan berbeda = `FORBIDDEN` SEBELUM rate limit, parsing body, atau query DB apa pun:
 *   request yang jelas bukan untuk sesi ini tidak boleh menghabiskan jatah atau menyentuh data.
 *
 * Nilai header tidak pernah dicatat ke log dan tidak dipantulkan kembali ke klien.
 */
export function requireExpectedUserId(event: H3Event, auth: AuthenticatedSession): void {
  const expected = getHeader(event, EXPECTED_USER_ID_HEADER)

  // `undefined` = klien lama yang belum mengirim header; `''` = header dikirim kosong, dan itu tidak
  // mungkin id user yang sah - perlakukan sebagai tidak cocok (fail-closed).
  if (expected === undefined) return
  if (expected === auth.userId) return

  throw apiProblem('FORBIDDEN')
}
