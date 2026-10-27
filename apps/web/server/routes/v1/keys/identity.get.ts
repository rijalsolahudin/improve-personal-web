import { serviceContext } from '../../../services/context'
import { getActiveKeyIdentity } from '../../../services/keys'

/**
 * `GET /v1/keys/identity` - KID akun, atau `kid: null` kalau belum pernah diklaim.
 *
 * Perangkat baru membaca ini SEBELUM membuat master key: kalau KID sudah ada, ia harus mengambil kunci
 * yang ada (transfer/recovery), bukan membuat kunci kedua. Selalu ter-scope sesi.
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)

  return getActiveKeyIdentity(serviceContext(event), auth.userId)
})
