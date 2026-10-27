import { keyIdentityClaimInputSchema } from '@improve-personal/contracts'

import { serviceContext } from '../../../services/context'
import { claimKeyIdentity } from '../../../services/keys'
import { consumeRateLimit } from '../../../services/rate-limit'
import { setApiResponseStatus } from '../../../utils/api-response'

/**
 * `PUT /v1/keys/identity` - klaim KID untuk akun (pemenang pertama menang).
 *
 * 201 klaim baru, 200 klaim ulang dengan KID yang sama, 409 `KEY_IDENTITY_CONFLICT` kalau KID lain
 * sudah terklaim. Rate limit memakai scope `keys:envelope` (per user): klaim sama langkanya dengan
 * upsert envelope, jadi tidak perlu scope tersendiri.
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)
  const body = await readValidatedBody(event, (value) => keyIdentityClaimInputSchema.parse(value))
  const ctx = serviceContext(event)

  await consumeRateLimit(ctx, 'keys:envelope', auth.userId)

  const { identity, created } = await claimKeyIdentity(ctx, auth.userId, body, auth.deviceName)
  if (created) setApiResponseStatus(event, 201)

  return identity
})
