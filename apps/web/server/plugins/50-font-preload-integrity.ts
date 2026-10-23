/**
 * `nuxt-security` (runtime/nitro/plugins/20-subresourceIntegrity) menambahkan hash SRI ke setiap
 * `<link rel="preload">` berdasarkan peta `#sri-hashes`. Peta itu dibangun dari `publicAssets`
 * SAAT `nitro:build:public-assets` - sementara berkas `/_fonts/*.woff2` baru ditulis `@nuxt/fonts`
 * setelah tahap itu, sehingga yang ter-hash adalah isi kosong. Hash kosong
 * (`sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb`) sama untuk SEMUA
 * font: browser menolak preload karena digest tidak cocok, lalu mengunduh font yang sama sekali
 * lagi lewat `@font-face`. Efeknya dua kali ~59 KB di jalur render dan font baru dipakai setelah
 * permintaan kedua - persis yang merusak FCP/LCP halaman yang teksnya memakai font itu.
 *
 * Plugin ini hanya membuang `integrity` dari link preload FONT (skrip & CSS tetap ber-SRI, dan
 * SRI pada font memang tidak melindungi apa pun di sini: berkasnya same-origin, immutable, dan
 * tidak pernah dieksekusi). Kalau `@nuxt/fonts` suatu hari menulis berkasnya sebelum pemindaian,
 * hash-nya akan benar dan kita biarkan apa adanya.
 */
const EMPTY_SHA384 = 'sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb'

/** Link preload font: `rel="preload"` + `as="font"` dalam satu tag. */
const FONT_PRELOAD_RE = /<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="font")[^>]*>/g
const EMPTY_INTEGRITY_RE = new RegExp(
  `\\s+integrity="${EMPTY_SHA384.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
  'g',
)

export default defineNitroPlugin((nitroApp) => {
  // `render:response`, bukan `render:html`: hook HTML nuxt-security terdaftar SETELAH plugin
  // `server/plugins` (ia modul), jadi menyaring di `render:html` akan sia-sia - atribut yang salah
  // ditambahkan lagi setelahnya. `render:response` jalan paling akhir, setelah HTML dirakit.
  nitroApp.hooks.hook('render:response', (response) => {
    if (typeof response.body !== 'string' || !response.body.includes('as="font"')) return
    response.body = response.body.replace(FONT_PRELOAD_RE, (tag) =>
      tag.replace(EMPTY_INTEGRITY_RE, ''),
    )
  })
})
