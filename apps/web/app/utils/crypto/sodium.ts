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
