import { serviceContext } from '../../../services/context'
import { listEnvelopes } from '../../../services/keys'

/**
 * `GET /v1/keys/envelopes` - envelope kunci milik user.
 *
 * Selalu ter-scope sesi. Slot yang sah cuma `passkey` (ADR 10 & 11): `otp` dihapus karena OTP dibuat
 * server, `recovery` tidak pernah ada di server. Envelope-nya blob opak - server tidak punya jalur
 * kode untuk membukanya (`server/**` bahkan dilarang mengimpor `packages/crypto`, lihat eslint).
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)
  const ctx = serviceContext(event)

  return listEnvelopes(ctx, auth.userId)
})
