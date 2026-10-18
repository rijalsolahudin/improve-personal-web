/**
 * IP klien di belakang proxy.
 *
 * `X-Forwarded-For` mentah DILARANG dipercaya (security.md §9): klien bisa mengirim header itu
 * sendiri, dan kalau server memakainya apa adanya, rate limit per IP jadi gratis untuk dilewati -
 * cukup ganti header tiap request.
 *
 * Cara yang dipakai: `trustedProxyHops` (env) menyatakan berapa proxy di depan server yang benar-benar
 * milik kita. Proxy menambahkan entri di KANAN header, jadi entri paling kanan ke-`hops` adalah klien
 * seperti yang dilihat proxy terpercaya pertama. Entri di sebelah kiri itu dikirim klien dan tidak
 * pernah dipercaya.
 *
 * `hops = 0` (default) berarti server tidak di belakang proxy: header diabaikan seluruhnya dan yang
 * dipakai hanya alamat socket. Dari sisi PEMALSUAN ini pilihan yang aman - nilai `hops` yang lebih
 * rendah tidak bisa dipakai memalsukan IP, karena entri di sebelah kiri (yang dikirim klien) tidak
 * pernah dipakai, dan dengan `hops = 0` header itu tidak dibaca sama sekali.
 *
 * Yang HARUS disadari (temuan M5 audit keamanan): salah menyetel lebih rendah di server yang
 * BENAR-BENAR berada di belakang proxy bukan sekadar "IP kurang akurat". IP klien menjadi IP proxy,
 * jadi SELURUH pengguna berbagi satu bucket rate limit per-IP - mis. `otp:ip` 20 permintaan / 15 menit
 * untuk semua orang. Satu penyerang bisa menghabiskan jatah itu (20 request) dan membuat permintaan
 * OTP semua pengguna lain dijawab `429` selama 15 menit, berulang tiap jendela: tombol mati layanan
 * yang murah. Karena itu plugin startup memperingatkan kombinasi `production` + `hops = 0`, dan
 * jumlah hop-nya wajib disetel sesuai topologi deployment (lihat `NUXT_TRUSTED_PROXY_HOPS` di
 * `.env.example`) - setelah dipastikan proxy MENIMPA `X-Forwarded-For` dari klien.
 */

const FORWARDED_FOR_HEADER = 'x-forwarded-for'

/** Header bisa berisi beberapa alamat dipisah koma; yang dipakai hanya entri yang dipercaya. */
export function forwardedForEntry(
  headerValue: string | undefined,
  trustedProxyHops: number,
): string | null {
  if (!headerValue || trustedProxyHops <= 0) return null

  const entries = headerValue
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  // Klien = entri paling kanan ke-`hops`. Kalau header lebih pendek dari jumlah hop, artinya
  // request tidak melewati semua proxy yang dikonfigurasi - jangan menebak, pakai socket.
  const index = entries.length - 1 - trustedProxyHops
  const candidate = index >= 0 ? entries[index] : undefined
  return candidate ?? null
}

/**
 * Gabungan: entri `X-Forwarded-For` yang dipercaya, kalau tidak ada pakai alamat socket.
 *
 * Murni (tanpa akses request) supaya bisa diuji langsung; adapter h3-nya di bawah.
 */
export function resolveClientIp(
  forwardedFor: string | undefined,
  peerAddress: string | undefined,
  trustedProxyHops: number,
): string | null {
  return forwardedForEntry(forwardedFor, trustedProxyHops) ?? peerAddress ?? null
}

/** IP klien untuk request ini, sesuai jumlah hop proxy terpercaya di env. */
export function clientIpOf(event: H3Event, trustedProxyHops: number): string | null {
  return resolveClientIp(
    getHeader(event, FORWARDED_FOR_HEADER),
    getRequestIP(event, { xForwardedFor: false }),
    trustedProxyHops,
  )
}
