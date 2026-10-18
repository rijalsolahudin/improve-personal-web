import { eq } from 'drizzle-orm'

import {
  devices,
  keyEnvelopes,
  keyTransfers,
  otpChallenges,
  records,
  sessions,
  syncWatermarks,
  users,
} from '../db/schema'
import { apiProblem } from '../utils/api-error'
import { hmacSha256 } from '../utils/crypto'
import type { ServiceContext } from './context'
import type { OtpMailer } from './mailer'
import { requestOtp, verifyOtp } from './otp'
import { consumeRateLimit } from './rate-limit'

/**
 * Hapus akun permanen (PRD F15 "Hapus Akun Permanen", T19).
 *
 * Konfirmasi lewat kode OTP ber-`purpose` `delete_account`, bukan lewat string `confirm=true`: yang
 * perlu dibuktikan adalah kepemilikan email, dan string konfirmasi bisa ditulis siapa saja dari
 * console browser.
 *
 * Tidak ada kolom `deleted_at` (dbml `users`): ini HARD delete, semua baris turunan hilang dalam satu
 * transaksi. Envelope recovery tidak ikut terhapus karena tidak pernah ada di server (ADR 11) -
 * berkas backup milik user tetap bisa membuka salinan yang dia pegang sendiri.
 */

/**
 * `purpose` TIDAK PERNAH datang dari body client - endpoint yang menentukan (kontrak `account.ts`).
 * Kalau klien bisa memilih purpose, ia bisa meminta kode untuk aksi destruktif dari endpoint login.
 */
export const ACCOUNT_DELETION_PURPOSE = 'delete_account' as const

/**
 * Kirim kode konfirmasi hapus akun ke email user yang sedang login.
 *
 * Email diambil dari SESI, bukan dari body request: endpoint ini hanya boleh mengirim kode ke pemilik
 * akun, dan menerima email dari body akan membuatnya jadi alat spam ke alamat sembarang.
 *
 * Rate limit-nya per USER (`input.userId`), BUKAN identifier konstan. Sebelumnya di sini tertulis
 * literal `'delete-otp'`, dan itu membuat bucket-nya GLOBAL: `HMAC('delete-otp', pepper)` adalah satu
 * penghitung untuk seluruh sistem, sehingga 6 permintaan dari SATU orang memblokir permintaan hapus
 * akun SEMUA user selama satu jam (temuan M1 audit keamanan) - hak subjek data yang bisa dilumpuhkan
 * siapa pun yang punya akun. Yang di-HMAC-pepper tetap identifier-nya: tabel `rate_limits` tidak
 * pernah menyimpan email/id user polos.
 *
 * Jalur destruktifnya (`DELETE /v1/account`) memakai scope yang sama dengan identifier `userId` juga,
 * jadi tebakan kode 6 digit terhadap aksi hapus akun terbatas pada jatah akun itu sendiri.
 */
export async function requestAccountDeletionOtp(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly email: string; readonly mailer: OtpMailer },
): Promise<void> {
  await consumeRateLimit(ctx, 'account:delete', input.userId)
  await requestOtp(ctx, {
    email: input.email,
    purpose: ACCOUNT_DELETION_PURPOSE,
    mailer: input.mailer,
  })
}

/**
 * Hapus akun + seluruh baris turunannya.
 *
 * `email` di body adalah penegasan akun mana yang dihapus (satu browser bisa dipakai lebih dari satu
 * akun), sedangkan yang menentukan tetap sesi + kode. Email yang tidak cocok dengan sesi ditolak lebih
 * dulu dengan pesan generik yang sama seperti kode salah.
 */
export async function deleteAccount(
  ctx: ServiceContext,
  input: {
    readonly userId: string
    readonly sessionEmail: string
    readonly email: string
    readonly code: string
  },
): Promise<void> {
  if (input.email !== input.sessionEmail) throw apiProblem('OTP_INVALID')

  const verified = await verifyOtp(ctx, {
    email: input.email,
    code: input.code,
    purpose: ACCOUNT_DELETION_PURPOSE,
  })

  // Kode yang valid tapi milik akun lain tidak boleh menghapus apa pun.
  if (verified.userId !== input.userId) throw apiProblem('OTP_INVALID')

  await ctx.db.transaction(async (tx) => {
    // Urutan mengikuti arah foreign key (anak dulu, `users` terakhir). Cascade di skema adalah jaring
    // pengaman, bukan alasan melewatkan langkah ini: kalau ada tabel yang lupa punya FK, cascade tidak
    // menolong dan barisnya jadi yatim.
    await tx.delete(keyTransfers).where(eq(keyTransfers.userId, input.userId))
    await tx.delete(keyEnvelopes).where(eq(keyEnvelopes.userId, input.userId))
    await tx.delete(records).where(eq(records.userId, input.userId))
    await tx.delete(syncWatermarks).where(eq(syncWatermarks.userId, input.userId))
    await tx.delete(sessions).where(eq(sessions.userId, input.userId))
    await tx.delete(devices).where(eq(devices.userId, input.userId))

    // `otp_challenges` tidak punya `user_id` (memang: challenge dibuat sebelum akun ada), jadi
    // jejaknya dihapus lewat hash email - satu-satunya bentuk yang disimpan tabel itu.
    await tx
      .delete(otpChallenges)
      .where(eq(otpChallenges.emailHash, hmacSha256(input.email, ctx.env.otpPepper)))

    await tx.delete(users).where(eq(users.id, input.userId))
  })
}
