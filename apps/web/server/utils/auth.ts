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
