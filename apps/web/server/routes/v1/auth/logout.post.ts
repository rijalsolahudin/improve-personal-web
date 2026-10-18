import { revokeSession } from '../../../services/session'
import { serviceContext } from '../../../services/context'
import { clearSessionCookie } from '../../../utils/session-cookie'
import { sendApiNoContent } from '../../../utils/api-response'

/**
 * `POST /v1/auth/logout` - batalkan sesi PERANGKAT INI.
 *
 * Butuh sesi (auth di baris pertama). Yang dibatalkan cuma baris sesi milik request ini: sesi
 * perangkat lain tetap hidup, jadi logout di laptop tidak mematikan HP. Logout jarak jauh untuk
 * perangkat lain jalurnya `DELETE /v1/devices/:id`.
 *
 * Token opaque di DB (bukan JWT) yang membuat ini benar-benar instan: satu `UPDATE`, dan token yang
 * masih dipegang perangkat itu langsung tidak lolos autentikasi - tidak ada yang perlu ditunggu
 * sampai `exp`.
 *
 * Cookie ikut dibersihkan supaya browser berhenti mengirim token yang sudah mati (sesi di DB sudah
 * tidak ada; cookie yang tertinggal cuma bikin request berikutnya gagal 401 tanpa alasan jelas).
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)
  const ctx = serviceContext(event)

  await revokeSession(ctx, auth.userId, auth.sessionId)
  clearSessionCookie(event, ctx.env)

  sendApiNoContent(event)
  return null
})
