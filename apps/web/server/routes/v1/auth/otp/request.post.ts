import { otpRequestInputSchema } from '@improve-personal/contracts'

import { serviceContext } from '../../../../services/context'
import { createOtpMailer } from '../../../../services/mailer'
import { requestOtp } from '../../../../services/otp'
import { sendApiNoContent } from '../../../../utils/api-response'

/**
 * `POST /v1/auth/otp/request` - minta kode OTP dikirim ke email.
 *
 * Publik (tidak butuh sesi): ini langkah pertama login.
 *
 * Responsnya SELALU `204` tanpa body, untuk email terdaftar maupun tidak (PRD F15 "Pesan Error"):
 * bentuk jawaban yang berbeda - status, pesan, atau field apa pun - langsung jadi oracle untuk
 * menghitung email mana yang punya akun. Cooldown kirim ulang (30 detik) juga tidak diumumkan;
 * email berikutnya saja yang tidak datang.
 *
 * `purpose` ditentukan ENDPOINT (`login`), tidak pernah dari body: kalau klien bisa memilih
 * `delete_account`, ia bisa meminta kode untuk aksi destruktif tanpa lewat jalur login.
 */
export default defineApiHandler(async (event) => {
  const body = await readValidatedBody(event, (value) => otpRequestInputSchema.parse(value))
  const ctx = serviceContext(event)

  await requestOtp(ctx, {
    email: body.email,
    purpose: 'login',
    // Mailer production hanya dibuat di production; non-production tidak pernah menyentuh jaringan.
    mailer: createOtpMailer(ctx.env),
  })

  sendApiNoContent(event)
  return null
})
