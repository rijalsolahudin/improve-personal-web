import { keyTransferClaimParamsSchema } from '@improve-personal/contracts'

import { serviceContext } from '../../../../services/context'
import { claimKeyTransfer } from '../../../../services/keys'
import { consumeRateLimit } from '../../../../services/rate-limit'

/**
 * `POST /v1/keys/transfer/:id` - perangkat BARU klaim envelope-nya (sekali pakai).
 *
 * Method-nya POST, bukan GET: klaim ini mengubah state (`claimed_at` diisi) dan hanya boleh berhasil
 * SEKALI, sedangkan GET harus aman & idempoten - browser, proxy, dan prefetch boleh mengulang GET
 * kapan saja, dan itu akan "memakan" transfer atau membocorkan blob ke cache perantara. Daftar
 * endpoint di `packages/contracts/src/protocol.ts` sudah menulis POST untuk endpoint ini, dan
 * kesamaannya dijaga `server/tests/contract-routes.test.ts`.
 *
 * `id` perangkat diambil dari SESI, dan semua sebab kegagalan (id tak dikenal, kedaluwarsa, sudah
 * diklaim, bukan perangkat target, perangkat sudah di-revoke) menghasilkan `NOT_FOUND` yang sama -
 * tanpa itu endpoint ini jadi oracle untuk menebak id transfer, dan menebak id berarti menerima
 * envelope kunci utama orang lain.
 *
 * Rate limit `keys:transfer-claim` (per USER dari sesi) menutup satu sisa celah volume (temuan M4
 * audit keamanan): menebak id 128-bit tidak praktis, tapi tanpa limiter endpoint ini gratis untuk
 * menghantam DB berulang kali - dan setiap tebakan tetap satu query.
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)
  const params = await getValidatedRouterParams(event, (value) =>
    keyTransferClaimParamsSchema.parse(value),
  )
  const ctx = serviceContext(event)

  await consumeRateLimit(ctx, 'keys:transfer-claim', auth.userId)

  return claimKeyTransfer(ctx, { userId: auth.userId, deviceId: auth.deviceId, id: params.id })
})
