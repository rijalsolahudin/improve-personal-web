import { createTransport } from 'nodemailer'

import type { OtpPurpose } from '@improve-personal/contracts'

import type { ServerEnv } from '../utils/env'
import { renderOtpEmail } from './otp-email'

/**
 * Pengiriman email OTP.
 *
 * Aturan yang dipegang (PRD F15 "OTP per Environment", T19):
 * - Transport dipilih dari KONFIGURASI, dan transport yang ada selalu menang atas kode fix:
 *   `NUXT_SMTP_URL` terisi -> SMTP (nodemailer; Mailpit lokal, atau SMTP provider di staging);
 *   sisanya production -> Resend; non-production tanpa transport -> no-op, dan di situlah mode OTP fix
 *   `777777` hidup (`isFixedOtpEnabled` di `../utils/env`). Jadi "email tidak dikirim" hanya mungkin
 *   kalau memang tidak ada transport - bukan "dikirim lalu diabaikan".
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

/**
 * Mailer non-production TANPA transport email.
 *
 * `sendOtp` sengaja tetap `async` dan tidak melempar: flow login non-production harus identik dengan
 * production (rate limit & expiry tetap jalan), yang berbeda cuma generate + kirim kode. Di env ini
 * kode yang dipakai adalah kode fix (`FIXED_OTP_CODE`) - lihat `isFixedOtpEnabled`.
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
      const email = renderOtpEmail({ code: mail.code, purpose: mail.purpose })
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
            subject: email.subject,
            // `text` tetap dikirim sebagai fallback klien yang memblokir HTML.
            text: email.text,
            html: email.html,
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
 * Pesan yang dikirim lewat SMTP.
 *
 * Bentuknya sendiri (bukan tipe nodemailer) supaya test bisa memeriksa isi pesan tanpa instance
 * transport apa pun - dan supaya perubahan tipe nodemailer tidak merambat ke test.
 */
export type SmtpMessage = {
  readonly from: string
  readonly to: string
  readonly subject: string
  /** Teks polos: fallback klien yang memblokir HTML. */
  readonly text: string
  /**
   * HTML lengkap. Wajib (bukan opsional): email OTP yang jatuh ke teks polos doang adalah regresi
   * tampilan yang harus ketahuan saat compile/test, bukan saat user membuka inbox.
   */
  readonly html: string
}

/** Batas keluar SMTP yang disuntik - satu-satunya seam yang dibutuhkan test. */
export type SmtpSend = (message: SmtpMessage) => Promise<unknown>

/**
 * Mailer SMTP (nodemailer).
 *
 * Dipakai kalau `NUXT_SMTP_URL` terisi: Mailpit di mesin lokal (`smtp://127.0.0.1:1025`), atau SMTP
 * provider di staging.
 */
export function createSmtpOtpMailer(env: ServerEnv, send: SmtpSend): OtpMailer {
  return {
    async sendOtp(mail: OtpMail): Promise<void> {
      const email = renderOtpEmail({ code: mail.code, purpose: mail.purpose })

      await send({
        // `mailFrom` dijamin non-kosong saat `smtpUrl` diisi (dicek `resolveServerEnv`), jadi tidak ada
        // cabang "pengirim kosong" yang bisa lolos ke SMTP dan baru ketahuan saat user pertama login.
        from: env.mailFrom,
        to: mail.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      })
    },
  }
}

/** Transport SMTP yang sudah jadi, per URL. Lihat `smtpSendFor` untuk alasan cache-nya. */
const smtpSendsByUrl = new Map<string, SmtpSend>()

/**
 * `SmtpSend` untuk URL ini, dibuat SEKALI per proses.
 *
 * Kenapa di-cache: `createTransport` mem-parsing URL dan menyusun opsi koneksi, sementara
 * `createOtpMailer` dipanggil di setiap permintaan OTP (login maupun kode hapus akun). Tanpa cache,
 * parsing itu ikut masuk jalur panas login demi sesuatu yang tidak berubah selama proses hidup.
 *
 * `pool` TIDAK dinyalakan: volume OTP sudah dibatasi rate limit (satu email per login per jendela),
 * jadi pool koneksi yang menganggur hanya menahan socket ke Mailpit/provider tanpa manfaat.
 */
export function smtpSendFor(smtpUrl: string): SmtpSend {
  const cached = smtpSendsByUrl.get(smtpUrl)
  if (cached) return cached

  // `url` ditaruh di DALAM objek opsi, bukan sebagai argumen pertama, karena argumen kedua
  // `createTransport` (kalau bentuknya `(url, options)`) adalah default PESAN (`MailDefaults`) di
  // nodemailer 10 - bukan opsi transport. Menaruh timeout di sana ditolak tipe, dan yang lebih
  // penting: timeout-nya tidak akan berlaku, jadi koneksi menggantung bisa kembali ke default 2 menit.
  const transport = createTransport({
    url: smtpUrl,
    // Batas waktu eksplisit: email yang menggantung lebih buruk daripada email yang gagal - user
    // menunggu di layar login. Angka yang sama dipakai jalur Resend.
    connectionTimeout: REQUEST_TIMEOUT_MS,
    greetingTimeout: REQUEST_TIMEOUT_MS,
    socketTimeout: REQUEST_TIMEOUT_MS,
  })

  const send: SmtpSend = async (message) => transport.sendMail(message)
  smtpSendsByUrl.set(smtpUrl, send)
  return send
}

export type OtpMailerDeps = {
  /** Batas keluar Resend (production), disuntik supaya test tidak menyentuh jaringan. */
  readonly fetchImpl?: FetchLike
  /** Batas keluar SMTP (`NUXT_SMTP_URL`), disuntik dengan alasan yang sama. */
  readonly smtpSend?: SmtpSend
}

/**
 * Mailer sesuai konfigurasi transport, bukan cuma sesuai environment.
 *
 * Urutannya sengaja: transport eksplisit DULU, baru Resend, baru no-op. Dengan begitu `NUXT_SMTP_URL`
 * yang terisi tidak pernah kalah dari default mana pun - konsisten dengan
 * `isFixedOtpEnabled`: ada transport = email benar-benar dikirim, dan kode fix mati.
 *
 * `env.isProduction` tetap fail-closed: env kosong/typo dianggap production, jadi jalur ini tidak
 * pernah diam-diam jatuh ke no-op saat deploy production lupa mengisi `APP_ENV`. Cabang SMTP sendiri
 * tidak pernah terpakai di production: `NUXT_SMTP_URL` yang terisi di sana sudah menolak start
 * (`resolveServerEnv`).
 */
export function createOtpMailer(env: ServerEnv, deps: OtpMailerDeps = {}): OtpMailer {
  if (env.smtpUrl !== '') {
    return createSmtpOtpMailer(env, deps.smtpSend ?? smtpSendFor(env.smtpUrl))
  }

  if (env.isProduction) {
    return createResendOtpMailer(env, deps.fetchImpl ?? globalThis.fetch.bind(globalThis))
  }

  return noopOtpMailer
}
