import type { OtpPurpose } from '@improve-personal/contracts'

import type { ServerEnv } from '../utils/env'

/**
 * Pengiriman email OTP.
 *
 * Aturan yang dipegang (PRD F15 "OTP per Environment", T19):
 * - Di production: kode dikirim lewat service email (Resend). Di non-production email TIDAK PERNAH
 *   dikirim - bukan "dikirim lalu diabaikan", tapi fungsinya memang tidak dipanggil. Karena itu
 *   implementasi non-production di bawah tidak menyentuh jaringan sama sekali.
 * - Fungsi ini TIDAK PERNAH mencatat kode. `no-console` saja tidak cukup: kode yang bocor ke log
 *   sama saja dengan kode yang bocor ke inbox orang lain.
 * - Port-nya berbentuk interface supaya test bisa memastikan "tidak ada email terkirim" tanpa
 *   memalsukan modul internal.
 */

export type OtpMail = {
  readonly to: string
  readonly code: string
  readonly purpose: OtpPurpose
}

export type OtpMailer = {
  sendOtp(mail: OtpMail): Promise<void>
}

/** Endpoint Resend. Host dikunci di kode (bukan dari input) - tidak ada jalur SSRF di sini. */
const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/** Batas waktu panggilan keluar. Email yang lambat tidak boleh menahan request login. */
const REQUEST_TIMEOUT_MS = 5_000

const SUBJECT_BY_PURPOSE: Record<OtpPurpose, string> = {
  login: 'Kode masuk Improve Personal',
  delete_account: 'Kode konfirmasi hapus akun Improve Personal',
}

const TEXT_BY_PURPOSE: Record<OtpPurpose, (code: string) => string> = {
  login: (code) => `Kode masuk kamu: ${code}\n\nBerlaku sebentar dan hanya bisa dipakai sekali.`,
  delete_account: (code) =>
    `Kode konfirmasi hapus akun: ${code}\n\nBerlaku sebentar dan hanya bisa dipakai sekali.`,
}

/**
 * Mailer non-production.
 *
 * `sendOtp` sengaja tetap `async` dan tidak melempar: flow login non-production harus identik dengan
 * production (rate limit & expiry tetap jalan), yang berbeda cuma generate + kirim kode.
 */
export const noopOtpMailer: OtpMailer = {
  async sendOtp(): Promise<void> {
    // Tidak ada email, tidak ada kode di log, tidak ada panggilan jaringan.
  },
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

/**
 * Mailer production (Resend).
 *
 * `fetchImpl` bisa disuntik supaya test bisa memeriksa bentuk request tanpa jaringan keluar.
 */
export function createResendOtpMailer(env: ServerEnv, fetchImpl: FetchLike): OtpMailer {
  return {
    async sendOtp(mail: OtpMail): Promise<void> {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      try {
        await fetchImpl(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${env.resendApiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: env.mailFrom,
            to: mail.to,
            subject: SUBJECT_BY_PURPOSE[mail.purpose],
            text: TEXT_BY_PURPOSE[mail.purpose](mail.code),
          }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}

/**
 * Mailer sesuai environment.
 *
 * `env.isProduction` sudah fail-closed: env kosong/typo dianggap production, jadi jalur ini tidak
 * pernah diam-diam jatuh ke no-op saat deploy production lupa mengisi APP_ENV.
 */
export function createOtpMailer(
  env: ServerEnv,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
): OtpMailer {
  return env.isProduction ? createResendOtpMailer(env, fetchImpl) : noopOtpMailer
}
