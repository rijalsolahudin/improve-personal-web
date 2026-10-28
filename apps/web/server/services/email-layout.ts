import { BRAND } from '#shared/brand'

/**
 * Layout email transaksional yang dipakai bersama semua email produk.
 *
 * Kenapa layout dipisah dari template: email HTML itu tabel bertingkat + fallback MSO + dark mode,
 * dan bagian itu sama untuk semua email. Yang berbeda antar email cuma isinya. Kalau layout ditempel
 * di tiap template, satu perbaikan kompatibilitas (mis. klien Outlook) harus diulang di semua email -
 * dan yang paling mudah lupa diperbaiki adalah email yang jarang dikirim.
 *
 * Kontrak escaping: semua nilai yang masuk lewat parameter di-escape di sini, KECUALI `bodyHtml` -
 * slot itu HTML utuh dari template pemanggil, jadi template yang bertanggung jawab meng-escape nilai
 * dinamisnya sendiri (lihat `otp-email.ts`).
 *
 * Warna & ukuran mengikuti `source-ui-2/Email OTP.html`: krem di luar, card putih border tebal dengan
 * bayangan bawah, band kuning, dan aksen cokelat-oranye. Nilainya sengaja ditulis literal seperti
 * source (bukan token): email client tidak membaca CSS variable.
 */
export const EMAIL_PALETTE = {
  ink: '#2F2A24',
  paper: '#F6EBDA',
  card: '#FFFBF4',
  band: '#F3CB86',
  accent: '#B4670C',
  codeBox: '#FBF3E6',
  codeBorder: '#D9C4A2',
  divider: '#E3CFAF',
  muted: '#8A7B68',
  bodyMuted: '#7A6B58',
  note: '#FFE1DA',
  noteInk: '#9A2E14',
  bandInk: '#6E4A12',
} as const

const FONT_SANS = "'Trebuchet MS',Arial,sans-serif"
const FONT_BODY = 'Arial,sans-serif'
const FONT_MONO = "'Courier New',Courier,monospace"

/** Urutan penting: `&` lebih dulu supaya entitas hasil escape tidak di-escape ulang. */
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Escape nilai dinamis sebelum masuk HTML email.
 *
 * Email HTML tidak punya CSP atau sanitizer di sisi klien: satu `<` yang lolos bisa merusak seluruh
 * struktur tabel - dan kalau nilainya berasal dari input, itu XSS di inbox user.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)
}

export type EmailLayoutInput = {
  /** `<title>` dokumen. Sebagian klien menampilkannya sebagai judul preview. */
  readonly title: string
  /** Teks preview yang tersembunyi di inbox (jangan ulangi isi heading persis). */
  readonly preheader: string
  /** Label kecil di band kuning, mis. `KODE MASUK · SEKALI PAKAI`. */
  readonly bandLabel: string
  /** Judul besar di band kuning. */
  readonly heading: string
  /** Isi utama - HTML dari template pemanggil (sudah di-escape di sana). */
  readonly bodyHtml: string
  /** Alasan email dikirim, tanpa titik akhir. Footer menyusun kalimatnya sendiri. */
  readonly footerReason: string
}

/**
 * `<head>` + reset + media query. Dipisah supaya `renderEmailLayout` tinggal menyusun struktur.
 *
 * `prefers-color-scheme: dark` di sini bukan hiasan: inbox Android/iOS menerapkan inversi otomatis
 * pada email yang tidak mendeklarasikan dark mode, dan hasilnya warna brand jadi pudar.
 */
function renderHead(title: string): string {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>td,th,div,p,a,h1{font-family:Arial,sans-serif !important;}</style>
<![endif]-->
<style>
body{margin:0;padding:0;width:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:separate;border-spacing:0;mso-table-lspace:0;mso-table-rspace:0}
a{color:${EMAIL_PALETTE.accent}}
@media only screen and (max-width:620px){
  .wrap{width:100% !important}
  .px{padding-left:22px !important;padding-right:22px !important}
  .code{font-size:34px !important;letter-spacing:8px !important}
  .h1{font-size:26px !important;line-height:32px !important}
}
@media (prefers-color-scheme:dark){
  .bg{background-color:#1F1B17 !important}
  .card{background-color:#2A2520 !important;border-color:#5E5040 !important}
  .ink{color:#F6EBDA !important}
  .mute{color:#C9B89E !important}
  .codebox{background-color:#3A332B !important;border-color:#F3CB86 !important}
  .codetxt{color:#F3CB86 !important}
  .note{background-color:#332D26 !important}
}
</style>`
}

/** Logo kotak "ip" + nama dua warna dari `BRAND` (bagian kedua pakai warna aksen). */
function renderBrandHeader(): string {
  return `<!-- Brand -->
  <tr><td style="padding:0 4px 18px 4px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
      <tr>
        <td width="44" height="44" align="center" valign="middle" bgcolor="${EMAIL_PALETTE.band}" style="width:44px;height:44px;background-color:${EMAIL_PALETTE.band};border:3px solid ${EMAIL_PALETTE.ink};border-radius:14px 14px 14px 5px;font-family:${FONT_SANS};font-size:20px;font-weight:bold;color:${EMAIL_PALETTE.ink};mso-line-height-rule:exactly;line-height:44px;">ip</td>
        <td style="padding-left:12px;font-family:${FONT_SANS};font-size:17px;font-weight:bold;mso-line-height-rule:exactly;line-height:19px;color:${EMAIL_PALETTE.ink};" class="ink">${escapeHtml(BRAND.first)}<br><span style="color:${EMAIL_PALETTE.accent};">${escapeHtml(BRAND.second)}</span></td>
      </tr>
    </table>
  </td></tr>`
}

/** Footer otomatis: semua email menyebut alasan kirim + identitas brand yang sama. */
function renderFooter(reason: string): string {
  return `<!-- Footer -->
  <tr><td align="center" style="padding:24px 20px 0 20px;">
    <p class="mute" style="margin:0;font-family:${FONT_BODY};font-size:12px;font-weight:bold;mso-line-height-rule:exactly;line-height:19px;color:${EMAIL_PALETTE.muted};">Email otomatis karena ${escapeHtml(reason)}.<br>${escapeHtml(BRAND.name)} · Jakarta, Indonesia</p>
  </td></tr>`
}

/**
 * HTML email lengkap: preheader tersembunyi, brand, card (band kuning + body), footer.
 *
 * `max-width:600px` + tabel MSO di sekelilingnya adalah dua hal berbeda: yang pertama untuk klien
 * modern, yang kedua karena Outlook desktop mengabaikan `max-width` dan butuh tabel berlebar tetap.
 */
export function renderEmailLayout(input: EmailLayoutInput): string {
  return `<!DOCTYPE html>
<html lang="id" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
${renderHead(input.title)}
</head>
<body class="bg" style="margin:0;padding:0;background-color:${EMAIL_PALETTE.paper};">
<span style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${EMAIL_PALETTE.paper};">${escapeHtml(input.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</span>

<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background-color:${EMAIL_PALETTE.paper};">
<tr><td align="center" style="padding:40px 12px;">

<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td><![endif]-->
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;width:600px;max-width:600px;">

  ${renderBrandHeader()}

  <!-- Card -->
  <tr><td class="card" bgcolor="${EMAIL_PALETTE.card}" style="background-color:${EMAIL_PALETTE.card};border:3px solid ${EMAIL_PALETTE.ink};border-bottom-width:8px;border-radius:28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">

      <!-- Band -->
      <tr><td bgcolor="${EMAIL_PALETTE.band}" style="background-color:${EMAIL_PALETTE.band};border-radius:25px 25px 0 0;border-bottom:3px solid ${EMAIL_PALETTE.ink};padding:26px 40px 24px 40px;" class="px">
        <div style="font-family:${FONT_BODY};font-size:11px;font-weight:bold;letter-spacing:2px;color:${EMAIL_PALETTE.bandInk};mso-line-height-rule:exactly;line-height:16px;">${escapeHtml(input.bandLabel)}</div>
        <h1 class="h1" style="margin:6px 0 0 0;font-family:${FONT_SANS};font-size:30px;font-weight:bold;mso-line-height-rule:exactly;line-height:36px;color:${EMAIL_PALETTE.ink};">${escapeHtml(input.heading)}</h1>
      </td></tr>

${input.bodyHtml}

    </table>
  </td></tr>

  ${renderFooter(input.footerReason)}

</table>
<!--[if mso]></td></tr></table><![endif]-->

</td></tr>
</table>
</body>
</html>`
}

/** Gaya bersama isi email - dipakai template supaya body tidak menulis ulang style tiap paragraf. */
export const EMAIL_FONTS = {
  body: FONT_BODY,
  sans: FONT_SANS,
  mono: FONT_MONO,
} as const
