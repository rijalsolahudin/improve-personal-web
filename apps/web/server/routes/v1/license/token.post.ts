import { licenseTokenRequestSchema } from '@improve-personal/contracts'

import { consumeRateLimit } from '../../../services/rate-limit'
import { issueLicenseToken } from '../../../services/license'
import { serviceContext } from '../../../services/context'

/**
 * `POST /v1/license/token` - tukar sesi login jadi token lisensi untuk perangkat ini (ADR 15).
 *
 * Email dan perangkat diambil dari SESI, tidak pernah dari input klien. Body OPSIONAL
 * (`{ deviceSignPk }`, ADR 17): public key Ed25519 perangkat untuk auth relay sync; client lama
 * mengirim tanpa body dan tetap dilayani. Respons `{ data: { token } }`; app menyimpan token itu dan
 * memverifikasinya offline setiap start.
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)
  const body = await readValidatedBody(event, (value) =>
    licenseTokenRequestSchema.optional().parse(value),
  )
  const ctx = serviceContext(event)

  await consumeRateLimit(ctx, 'license:token', auth.userId)

  setHeader(event, 'cache-control', 'no-store')

  return {
    token: await issueLicenseToken(ctx, {
      email: auth.email,
      deviceId: auth.deviceId,
      ...(body?.deviceSignPk === undefined ? {} : { deviceSignPk: body.deviceSignPk }),
    }),
  }
})
