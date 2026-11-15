import { deviceRevokeParamsSchema } from '@improve-personal/contracts'

import { serviceContext } from '../../../../services/context'
import { deleteRevokedDevice } from '../../../../services/device'
import { consumeRateLimit } from '../../../../services/rate-limit'
import { sendApiNoContent } from '../../../../utils/api-response'

/**
 * `DELETE /v1/devices/:id/revoked` - hapus jejak perangkat yang SUDAH dicabut dari daftar (PRD F15).
 *
 * Hanya baris `revoked_at IS NOT NULL` milik user di sesi yang bisa dihapus; perangkat aktif tetap
 * harus dicabut dulu lewat `DELETE /v1/devices/:id`. Perangkat aktif, milik user lain, dan yang tidak
 * ada sama-sama `NOT_FOUND` (bukan oracle). Memakai jatah `devices:revoke` yang sama karena sama-sama
 * menulis DB per user.
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)
  const params = await getValidatedRouterParams(event, (value) =>
    deviceRevokeParamsSchema.parse(value),
  )
  const ctx = serviceContext(event)

  await consumeRateLimit(ctx, 'devices:revoke', auth.userId)

  await deleteRevokedDevice(ctx, auth.userId, params.id)

  sendApiNoContent(event)
  return null
})
