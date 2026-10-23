/**
 * Muat libsodium yang sebenarnya - berkas TERPISAH, dan pemisahan itu disengaja.
 *
 * Kenapa berlapis dua (`sodium.ts` -> berkas ini -> `libsodium-wrappers-sumo`):
 * Nuxt/vue-bundle-renderer menaruh setiap `dynamicImports` dari chunk yang ada di graf route sebagai
 * `<link rel="prefetch">` di HTML. Selama import dinamis libsodium ditulis langsung di modul yang
 * ikut bundel awal, chunk 185 KB gzip itu tetap diunduh browser ~30 ms setelah app start - walau
 * belum ada satu pun operasi kripto yang berjalan (QA T16 MAYOR-1: initiator "link", startTime 32 ms).
 * Renderer hanya mengikuti SATU tingkat import dinamis, jadi dengan satu lapisan perantara di sini
 * yang di-prefetch hanya berkas kecil ini; libsodium baru diambil saat `loadSodium()` benar-benar
 * dipanggil (unlock/buka sesi data lokal).
 *
 * Build yang dipakai: **`libsodium-wrappers-sumo`**. Yang standar tidak punya `crypto_pwhash`
 * (Argon2id) - dan Argon2id itulah yang membungkus kunci utama pada envelope recovery
 * (ARCHITECTURE §7). Bedanya +36,7 kB gzip, dibayar di jalur yang lambat (unlock/recovery), bukan di
 * jalur login: satu library kripto teruji untuk AEAD, KDF, Argon2id, dan sealed box sekaligus, bukan
 * dua library yang harus diaudit terpisah.
 *
 * **Batas yang jujur (QA T16 MAYOR-1, budget `performance.md`: chunk tunggal <= 100 KB gzip).**
 * Chunk ini terukur **187.973 B gzip / 151.364 B brotli** di build produksi. Batas 100 KB TIDAK bisa
 * dicapai dengan pustaka ini: modul intinya (`libsodium-sumo.mjs`) sendirian sudah 413 KB mentah
 * (169,6 KB gzip) sebelum wrapper-nya, dan build non-sumo pun 311 KB mentah (~132 KB gzip) - keduanya
 * di atas budget, dan satu modul ESM tidak bisa dipecah Rollup menjadi beberapa chunk. Yang bisa
 * dilakukan, dan sudah dilakukan: (1) chunk-nya terpisah & hanya dimuat lewat `import()` ini,
 * (2) tidak lagi di-prefetch saat app start, (3) asetnya dikompres (`nitro.compressPublicAssets`),
 * (4) isi dialog yang memakai jalur kripto lain (kartu backup, form pemulihan) di-`import()` terpisah
 * supaya tidak menumpuk di bundel awal `/app`. Mengganti pustaka kriptonya (Argon2id + XChaCha20 +
 * sealed box) berarti format blob berubah dan data user lama tidak bisa dibuka - itu keputusan
 * terpisah yang butuh review keamanan, bukan perubahan optimasi.
 */
export type SodiumModule = typeof import('libsodium-wrappers-sumo').default

let cached: Promise<SodiumModule> | null = null

export function loadSodiumRuntime(): Promise<SodiumModule> {
  cached ??= (async () => {
    const module = await import('libsodium-wrappers-sumo')
    const sodium = module.default
    await sodium.ready
    return sodium
  })()

  return cached
}
