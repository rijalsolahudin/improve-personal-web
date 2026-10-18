import { requestAccountDeletionOtp } from '../../../services/account'
import { serviceContext } from '../../../services/context'
import { createOtpMailer } from '../../../services/mailer'
import { sendApiNoContent } from '../../../utils/api-response'

/**
 * `POST /v1/account/deletion-otp` - kirim kode konfirmasi hapus akun ke email SESI.
 *
 * Langkah pertama alur hapus akun (PRD F15): `contracts/src/account.ts` mensyaratkan "server mengirim
 * OTP baru ber-`purpose` `delete_account`", dan permintaan kode itu butuh jalur HTTP sendiri - tanpa
 * endpoint ini `requestAccountDeletionOtp` tidak bisa dipanggil sama sekali. Karena itu ia sekarang
 * juga tercatat di daftar endpoint `contracts/src/protocol.ts` (dijaga
 * `server/tests/contract-routes.test.ts`), bukan cuma hidup sebagai route.
 *
 * Tidak ada body: email diambil dari SESI, bukan dari request. Kalau email boleh dikirim klien,
 * endpoint ini jadi alat spam ke alamat sembarang (dan sekaligus cara memastikan email mana yang
 * punya akun). `purpose` juga ditentukan server, tidak pernah dari klien.
 *
 * `userId` dari SESI diteruskan ke service karena rate limit scope `account:delete` per AKUN (temuan
 * M1 audit keamanan) - sebelumnya identifier-nya konstan, jadi jatah satu akun memblokir akun lain.
 *
 * Respons `204` tanpa body, sama prinsipnya dengan `POST /v1/auth/otp/request`: bentuk jawaban tidak
 * boleh membedakan apa pun.
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)
  const ctx = serviceContext(event)

  await requestAccountDeletionOtp(ctx, {
    userId: auth.userId,
    email: auth.email,
    mailer: createOtpMailer(ctx.env),
  })

  sendApiNoContent(event)
  return null
})
