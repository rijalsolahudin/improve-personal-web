import { otpVerifyInputSchema } from '@improve-personal/contracts'

import { serviceContext } from '../../../../services/context'
import { verifyOtp } from '../../../../services/otp'
import { loginDevice } from '../../../../services/session'
import { setSessionCookie } from '../../../../utils/session-cookie'

/**
 * `POST /v1/auth/otp/verify` - tukar kode jadi sesi untuk perangkat ini.
 *
 * Publik (sesi belum ada). Dua jalur perangkat yang berbeda, sesuai kontrak `sessionDtoSchema`:
 * - `client: 'web'` -> token masuk cookie `HttpOnly; Secure; SameSite=Lax`, dan TIDAK ada di body.
 *   Token di body web adalah token yang bisa dibaca JavaScript, jadi justru yang dihindari.
 * - `client: 'mobile'` -> token di body (native menyimpannya di SecureStore; tidak ada cookie jar).
 *
 * Perangkat dibuat di sini, bukan saat meminta kode: kode yang terbukti benar dulu, baru baris
 * `devices` lahir - sehingga permintaan kode tidak bisa dipakai mengisi tabel perangkat.
 */
export default defineApiHandler(async (event) => {
  const body = await readValidatedBody(event, (value) => otpVerifyInputSchema.parse(value))
  const ctx = serviceContext(event)

  const verified = await verifyOtp(ctx, { email: body.email, code: body.code, purpose: 'login' })

  const login = await loginDevice(ctx, {
    userId: verified.userId,
    // Email sudah dinormalkan `emailSchema` dan `verifyOtp` cuma bisa sukses untuk email itu,
    // jadi tidak perlu query user tambahan hanya demi mengisi DTO.
    email: body.email,
    client: body.client,
    device: body.device,
  })

  if (login.dto.client === 'web') {
    setSessionCookie(event, ctx.env, login.token, {
      expiresAt: new Date(login.dto.expiresAt),
      now: ctx.now,
    })
  }

  // DTO dari service (union atas `client`); untuk web memang tidak punya field `token`.
  return login.dto
})
