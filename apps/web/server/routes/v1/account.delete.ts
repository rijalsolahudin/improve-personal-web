import { deleteAccountInputSchema } from '@improve-personal/contracts'

import { deleteAccount } from '../../services/account'
import { serviceContext } from '../../services/context'
import { consumeRateLimit } from '../../services/rate-limit'
import { clearSessionCookie } from '../../utils/session-cookie'
import { sendApiNoContent } from '../../utils/api-response'

/**
 * `DELETE /v1/account` - hapus akun permanen (PRD F15 "Hapus Akun Permanen", T19).
 *
 * Dua bukti yang diperlukan, dan keduanya harus benar:
 * 1. Sesi yang valid (auth di baris pertama) - menentukan akun mana yang dilihat.
 * 2. Kode OTP ber-`purpose` `delete_account` yang dikirim lewat `POST /v1/account/deletion-otp`.
 *
 * `email` di body bukan penentu akun; ia cuma penegasan user ("ya, akun ini"). Yang menentukan tetap
 * sesi + kode, dan service menolak kalau email body tidak sama dengan email sesi. Tidak ada field
 * `confirm`/`force`: konfirmasi lewat string yang bisa ditulis siapa saja dari console bukan bukti
 * kepemilikan.
 *
 * Hard delete dalam satu transaksi (service): tidak ada kolom `deleted_at`. Cookie dibersihkan supaya
 * browser berhenti mengirim token yang barisnya sudah tidak ada.
 *
 * Rate limit scope `account:delete` dikonsumsi DI SINI, bukan cuma di jalur pengiriman kode. Sebelumnya
 * hanya `POST /v1/account/deletion-otp` yang menghitung (identifiers `delete-otp`), sehingga endpoint
 * ini - satu-satunya tempat kode 6 digit ditebak terhadap aksi destruktif - bisa dipanggil tanpa batas:
 * celah brute-force `OTP_CODE_LENGTH` = 6 digit, dan lolosnya berarti akun orang lain terhapus.
 *
 * Identifier-nya `userId` dari SESI (bukan email body, yang gampang diputar-putar penyerang, dan bukan
 * `sessionId`, yang bisa diperbanyak dengan login berulang): jatah hapus akun memang milik akun.
 * Konsumsi sebelum validasi body disengaja: percobaan ber-body rusak tetap memakai jatah, jadi membanjiri
 * endpoint dengan payload cacat tidak jadi cara memutar ulang tebakan kode.
 */
export default defineApiHandler(async (event) => {
  const auth = await requireSession(event)
  const ctx = serviceContext(event)

  await consumeRateLimit(ctx, 'account:delete', auth.userId)

  const body = await readValidatedBody(event, (value) => deleteAccountInputSchema.parse(value))

  await deleteAccount(ctx, {
    userId: auth.userId,
    sessionEmail: auth.email,
    email: body.email,
    code: body.code,
  })

  clearSessionCookie(event, ctx.env)

  sendApiNoContent(event)
  return null
})
