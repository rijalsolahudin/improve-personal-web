/**
 * Pemuat libsodium tunggal.
 *
 * Build yang dipakai: **`libsodium-wrappers-sumo`**. Yang standar tidak punya `crypto_pwhash`
 * (Argon2id) - dan Argon2id itulah yang membungkus kunci utama pada envelope recovery
 * (ARCHITECTURE §7). Bedanya +36,7 kB gzip, dibayar di jalur yang lambat (unlock/recovery), bukan di
 * jalur login: satu library kripto teruji untuk AEAD, KDF, Argon2id, dan sealed box sekaligus, bukan
 * dua library yang harus diaudit terpisah.
 *
 * `import()` DINAMIS, dan itu bukan detail gaya: paket ini ~400 kB berisi WASM. Kalau diimpor statis,
 * halaman login ikut mengunduhnya padahal kripto baru dibutuhkan setelah user punya kunci.
 *
 * **Batas yang jujur (QA T16 MAYOR-1, budget `performance.md`: chunk tunggal <= 100 KB gzip).**
 * Chunk ini terukur **187.973 B gzip / 151.364 B brotli** di build produksi. Batas 100 KB TIDAK bisa
 * dicapai dengan pustaka ini: berkas `libsodium-sumo.mjs` sendirian sudah 413 KB mentah (171,6 KB gzip)
 * sebelum wrapper-nya, dan build non-sumo pun 311 KB mentah (~132 KB gzip) - keduanya di atas budget,
 * dan satu modul ESM tidak bisa dipecah Rollup menjadi beberapa chunk. Yang bisa dilakukan, dan sudah
 * dilakukan: (1) chunk-nya terpisah & hanya dimuat lewat `import()` ini, (2) asetnya dikompres
 * (`nitro.compressPublicAssets`), (3) isi dialog yang memakai jalur kripto lain (kartu backup, form
 * pemulihan) di-`import()` terpisah supaya tidak menumpuk di bundel awal `/app`.
 *
 * Catatan perilaku: Nuxt tetap menaruh chunk ini di `<link rel="prefetch" as="script">` pada HTML `/app`
 * (vue-bundle-renderer mem-prefetch dynamic import dari graf route). Itu prefetch berprioritas rendah,
 * bukan render-blocking, dan tidak bisa dimatikan dari `nuxt.config`; menghilangkannya butuh plugin
 * Nitro (wilayah server) atau mengganti pustaka kripto - keduanya di luar perubahan ini.
 */
export type SodiumModule = typeof import('libsodium-wrappers-sumo').default

let cached: Promise<SodiumModule> | null = null

export function loadSodium(): Promise<SodiumModule> {
  cached ??= (async () => {
    const module = await import('libsodium-wrappers-sumo')
    const sodium = module.default
    await sodium.ready
    return sodium
  })()

  return cached
}
