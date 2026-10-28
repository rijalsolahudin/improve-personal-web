import { OTP_CODE_LENGTH, OTP_TTL_SECONDS, type OtpPurpose } from '@improve-personal/contracts'

import { BRAND, MAIL_SUBJECTS } from '#shared/brand'

import { EMAIL_FONTS, EMAIL_PALETTE, escapeHtml, renderEmailLayout } from './email-layout'

/**
 * Template email OTP (PRD F15, T19) untuk kedua purpose: `login` dan `delete_account`.
 *
 * Kenapa template ini fungsi murni: supaya perilakunya bisa diuji tanpa transport dan tanpa jaringan.
 * Yang mengirim tetap `mailer.ts`; berkas ini cuma menyusun subjek, HTML, dan teks cadangan.
 *
 * Yang dijaga dari source UI (`source-ui-2/Email OTP.html`): struktur kartu, band kuning, kotak kode
 * bergaris putus-putus, note keamanan merah muda, dan footer. Teks Inggris di source ("Halo, Friend!")
 * sengaja diganti copy Indonesia - layout email tidak boleh punya sisa copy yang tidak bisa dipakai
 * user berbahasa Indonesia.
 *
 * Isi teks `code` di-escape walau kode OTP selalu 6 digit: template ini juga dipakai kalau format kode
 * berubah, dan satu jalur escape lebih murah daripada mengaudit ulang tiap percabangan.
 */

/** Durasi berlaku dalam bahasa yang dibaca user: `600` -> `10 menit`. */
function formatOtpLifetime(seconds: number): string {
  // Menit dipakai kalau pas, supaya "10 menit" tidak jadi "600 detik". Sisa detik tetap jujur
  // ditampilkan sebagai detik - angka yang salah lebih buruk daripada formatnya kurang rapi.
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} menit`
  return `${seconds} detik`
}

type OtpEmailCopy = {
  readonly bandLabel: string
  readonly heading: string
  readonly instruction: string
  readonly preheaderLead: string
  readonly help: string
  readonly footerReason: string
}

const COPY_BY_PURPOSE: Record<OtpPurpose, OtpEmailCopy> = {
  login: {
    bandLabel: 'KODE MASUK · SEKALI PAKAI',
    heading: 'Halo! Ini kode masukmu.',
    instruction: `Masukkan kode ${OTP_CODE_LENGTH} digit ini di halaman masuk buat lanjut ke ${BRAND.name}.`,
    preheaderLead: 'Kode masuk kamu',
    help: 'Nggak merasa minta kode? Abaikan aja email ini, akunmu tetap aman.',
    footerReason: `ada permintaan masuk ke akun ${BRAND.name}`,
  },
  delete_account: {
    bandLabel: 'KONFIRMASI HAPUS AKUN · SEKALI PAKAI',
    heading: 'Halo! Konfirmasi hapus akun.',
    instruction: `Masukkan kode ${OTP_CODE_LENGTH} digit ini buat mengonfirmasi hapus akun ${BRAND.name} kamu. Kalau dikonfirmasi, datamu tidak bisa dikembalikan.`,
    preheaderLead: 'Kode konfirmasi hapus akun kamu',
    help: 'Nggak merasa minta hapus akun? Abaikan aja email ini, akunmu tetap aman.',
    footerReason: `ada permintaan hapus akun ${BRAND.name}`,
  },
}

/** Teks polos tetap dikirim: klien yang memblokir HTML, atau notifikasi jam tangan, hanya baca ini. */
const TEXT_BY_PURPOSE: Record<OtpPurpose, (code: string, lifetime: string) => string> = {
  login: (code, lifetime) =>
    `Kode masuk kamu: ${code}\n\nMasukkan kode ini di halaman masuk. Berlaku ${lifetime} dan hanya bisa dipakai sekali.`,
  delete_account: (code, lifetime) =>
    `Kode konfirmasi hapus akun: ${code}\n\nBerlaku ${lifetime} dan hanya bisa dipakai sekali.`,
}

/**
 * Isi kartu (di bawah band kuning): instruksi, kotak kode, hint, note keamanan, divider, bantuan.
 *
 * Padding kiri-kanan memakai class `px` supaya media query 620px bisa mempersempitnya tanpa
 * menimpa inline style (email client mengabaikan style yang lebih lemah, bukan yang lebih kuat).
 */
function renderOtpBody(copy: OtpEmailCopy, code: string, lifetime: string): string {
  const safeCode = escapeHtml(code)

  return `      <!-- Instruksi -->
      <tr><td class="px" style="padding:30px 40px 8px 40px;">
        <p class="ink" style="margin:0;font-family:${EMAIL_FONTS.body};font-size:16px;font-weight:bold;mso-line-height-rule:exactly;line-height:24px;color:${EMAIL_PALETTE.ink};">${escapeHtml(copy.instruction)}</p>
      </td></tr>

      <!-- Kode: user-select: all supaya satu ketuk lama langsung memilih 6 digit utuh -->
      <tr><td class="px" align="center" style="padding:22px 40px 10px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
          <tr><td class="codebox" align="center" bgcolor="${EMAIL_PALETTE.codeBox}" style="background-color:${EMAIL_PALETTE.codeBox};border:3px dashed ${EMAIL_PALETTE.codeBorder};border-radius:20px;padding:22px 12px;">
            <div class="code codetxt" style="-webkit-user-select:all;user-select:all;font-family:${EMAIL_FONTS.mono};font-size:44px;font-weight:bold;letter-spacing:12px;mso-line-height-rule:exactly;line-height:52px;color:${EMAIL_PALETTE.ink};">${safeCode}</div>
          </td></tr>
        </table>
      </td></tr>
      <tr><td class="px" align="center" style="padding:0 40px 26px 40px;">
        <p class="mute" style="margin:0;font-family:${EMAIL_FONTS.body};font-size:13px;font-weight:bold;mso-line-height-rule:exactly;line-height:20px;color:${EMAIL_PALETTE.muted};">Ketuk lama kode buat salin · Berlaku <span style="color:${EMAIL_PALETTE.accent};">${escapeHtml(lifetime)}</span></p>
      </td></tr>

      <!-- Note keamanan -->
      <tr><td class="px" style="padding:0 40px 32px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
          <tr><td class="note" bgcolor="${EMAIL_PALETTE.note}" style="background-color:${EMAIL_PALETTE.note};border-radius:18px 18px 18px 6px;padding:16px 18px;">
            <p style="margin:0;font-family:${EMAIL_FONTS.body};font-size:14px;font-weight:bold;mso-line-height-rule:exactly;line-height:21px;color:${EMAIL_PALETTE.noteInk};">Jangan bagikan kode ini ke siapa pun — tim ${escapeHtml(BRAND.name)} nggak akan pernah minta kode ini.</p>
          </td></tr>
        </table>
      </td></tr>

      <!-- Divider -->
      <tr><td class="px" style="padding:0 40px;"><div style="border-top:2px dashed ${EMAIL_PALETTE.divider};font-size:0;line-height:0;">&nbsp;</div></td></tr>

      <tr><td class="px" style="padding:22px 40px 30px 40px;">
        <p class="mute" style="margin:0;font-family:${EMAIL_FONTS.body};font-size:14px;font-weight:bold;mso-line-height-rule:exactly;line-height:21px;color:${EMAIL_PALETTE.bodyMuted};">${escapeHtml(copy.help)} Masih ada masalah? Balas email ini atau hubungi <a href="mailto:halo@improvepersonal.app" style="color:${EMAIL_PALETTE.accent};font-weight:bold;text-decoration:underline;">halo@improvepersonal.app</a>.</p>
      </td></tr>`
}

export type OtpEmailInput = {
  readonly code: string
  readonly purpose: OtpPurpose
  /**
   * Masa berlaku dalam detik. Default `OTP_TTL_SECONDS` supaya email tidak pernah menjanjikan durasi
   * yang berbeda dari yang ditegakkan `verifyOtp`; parameter ini ada untuk test yang membuktikan
   * durasinya memang dihitung.
   */
  readonly ttlSeconds?: number
}

export type RenderedOtpEmail = {
  readonly subject: string
  readonly html: string
  readonly text: string
}

/** Subjek + HTML + teks polos untuk satu email OTP. Tanpa I/O, jadi aman dipanggil di jalur panas. */
export function renderOtpEmail(input: OtpEmailInput): RenderedOtpEmail {
  const copy = COPY_BY_PURPOSE[input.purpose]
  const lifetime = formatOtpLifetime(input.ttlSeconds ?? OTP_TTL_SECONDS)
  const subject = MAIL_SUBJECTS[input.purpose]

  return {
    subject,
    html: renderEmailLayout({
      title: `${subject}: ${input.code}`,
      // Preheader ikut menyebut kode & durasi: di inbox, ini satu-satunya baris yang terbaca sebelum
      // user membuka email - kalau kosong, klien menampilkan potongan HTML yang tidak berarti.
      preheader: `${copy.preheaderLead} ${input.code} — berlaku ${lifetime}. Jangan bagikan ke siapa pun ya.`,
      bandLabel: copy.bandLabel,
      heading: copy.heading,
      bodyHtml: renderOtpBody(copy, input.code, lifetime),
      footerReason: copy.footerReason,
    }),
    text: TEXT_BY_PURPOSE[input.purpose](input.code, lifetime),
  }
}
