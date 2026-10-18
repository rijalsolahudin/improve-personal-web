import { keyEnvelopePutInputSchema } from '@improve-personal/contracts'

import { serviceContext } from '../../../services/context'
import { putEnvelope } from '../../../services/keys'
import { consumeRateLimit } from '../../../services/rate-limit'

/**
 * `PUT /v1/keys/envelopes` - upsert envelope kunci (unique `(user_id, slot)`).
 *
 * Idempoten by design (PUT): memanggil ulang dengan envelope yang sama menghasilkan baris yang sama,
 * bukan duplikat. Batas ukuran `wrappedKey` (4 KB) dan `kdfParams` (1 KB) ditegakkan schema kontrak
 * SEBELUM handler ini jalan, jadi tidak ada decode blob raksasa di jalur ini.
 *
 * Rate limit dihitung di HANDLER, bukan di service: `putEnvelope` tidak memanggil
 * `consumeRateLimit`, dan menambahkannya di service akan mengubah signature-nya (wilayah agent lain).
 * Scopenya per USER (`isUserScopedScope`), bukan per IP - jatahnya milik akun, dan satu akun tidak
 * bisa melampaui batas hanya dengan berpindah jaringan.
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)
  const body = await readValidatedBody(event, (value) => keyEnvelopePutInputSchema.parse(value))
  const ctx = serviceContext(event)

  await consumeRateLimit(ctx, 'keys:envelope', auth.userId)

  return putEnvelope(ctx, auth.userId, body)
})
