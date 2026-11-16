import { consumeRateLimit } from '../../../services/rate-limit'
import { issueLicenseToken } from '../../../services/license'
import { serviceContext } from '../../../services/context'

/**
 * `POST /v1/license/token` - tukar sesi login jadi token lisensi untuk perangkat ini (ADR 15).
 *
 * Tanpa body: email dan perangkat diambil dari SESI, tidak pernah dari input klien. Respons
 * `{ data: { token } }`; app menyimpan token itu dan memverifikasinya offline setiap start.
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)
  const ctx = serviceContext(event)

  await consumeRateLimit(ctx, 'license:token', auth.userId)

  setHeader(event, 'cache-control', 'no-store')

  return { token: await issueLicenseToken(ctx, { email: auth.email, deviceId: auth.deviceId }) }
})
