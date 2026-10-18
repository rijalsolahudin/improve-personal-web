import { deviceRevokeParamsSchema } from '@improve-personal/contracts'

import { serviceContext } from '../../../services/context'
import { revokeDevice } from '../../../services/device'
import { consumeRateLimit } from '../../../services/rate-limit'
import { sendApiNoContent } from '../../../utils/api-response'

/**
 * `DELETE /v1/devices/:id` - logout jarak jauh (PRD F15, T19 AC).
 *
 * `id` dari URL TIDAK PERNAH cukup untuk menentukan kepemilikan: service mencari pasangan
 * (`devices.id`, `user_id` dari sesi), dan itulah yang membuat IDOR perangkat tidak mungkin.
 * Perangkat milik user lain dan perangkat yang tidak ada sama-sama `NOT_FOUND` - membedakannya
 * akan mengonfirmasi bahwa id tertentu memang ada.
 *
 * Efeknya dua-duanya dalam satu transaksi di service: perangkat di-soft-revoke DAN sesi perangkat
 * itu ditutup, jadi token yang masih dipegang perangkat tersebut langsung tidak berlaku.
 *
 * Rate limit `devices:revoke` per USER (temuan M4 audit keamanan): tanpa itu endpoint ini gratis untuk
 * diulang tanpa batas, dan tiap panggilan menulis DB (soft-revoke + tutup sesi). Identifier-nya
 * `userId` dari sesi, bukan id perangkat dari URL - yang punya jatah adalah akunnya.
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)
  const params = await getValidatedRouterParams(event, (value) =>
    deviceRevokeParamsSchema.parse(value),
  )
  const ctx = serviceContext(event)

  await consumeRateLimit(ctx, 'devices:revoke', auth.userId)

  await revokeDevice(ctx, auth.userId, params.id)

  sendApiNoContent(event)
  return null
})
