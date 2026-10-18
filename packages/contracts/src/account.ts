import { z } from 'zod'

import { emailSchema, otpCodeSchema } from './auth.ts'

/**
 * Hapus akun permanen (PRD F15 "Hapus Akun Permanen", task T19).
 *
 * Alur yang diharapkan:
 * 1. `POST /v1/auth/otp/request` + `POST /v1/auth/otp/verify` biasa untuk dapat sesi.
 * 2. `POST /v1/account/deletion-otp` - server mengirim OTP baru ber-`purpose` `delete_account`.
 * 3. `DELETE /v1/account` dengan email + kode itu.
 *
 * Server menghapus seluruh baris turunan user dalam SATU transaksi (`server.dbml` `users`): devices,
 * sessions, otp_challenges, oauth_states, key_envelopes, key_transfers, records, sync_watermarks.
 * Tidak ada kolom `deleted_at` - ini hard delete (PRD F15). Envelope recovery tidak ikut terhapus
 * karena memang tidak pernah ada di server (ADR 11), jadi berkas backup user tetap bisa membuka salinan
 * yang dia miliki sendiri.
 *
 * `email` dikirim ulang supaya user menegaskan akun mana yang dihapus (satu browser bisa saja dipakai
 * lebih dari satu akun). Yang menentukan akun mana yang terhapus tetap sesi + kode OTP - bukan field ini.
 */

export const OTP_PURPOSES = ['login', 'delete_account'] as const

export type OtpPurpose = (typeof OTP_PURPOSES)[number]

/**
 * Tujuan challenge OTP (`server.dbml` enum `otp_purpose`).
 *
 * `purpose` TIDAK PERNAH datang dari body client: endpoint yang menentukan. Kalau client bisa memilih
 * `delete_account` dari endpoint login, dia bisa meminta kode untuk aksi destruktif tanpa lewat jalur
 * login - jadi pemisahan ini bagian dari authz, bukan sekadar label di DB.
 */
export const otpPurposeSchema = z.enum(OTP_PURPOSES)

/**
 * `DELETE /v1/account`
 *
 * Tidak ada field `confirm`/`force`: konfirmasi sengaja lewat kode OTP (bukti kepemilikan email) dan
 * bukan lewat string yang bisa ditulis siapa saja dari console. Respons endpoint ini 204 tanpa body.
 */
export const deleteAccountInputSchema = z
  .object({
    email: emailSchema,
    code: otpCodeSchema,
  })
  .strict()

export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>
