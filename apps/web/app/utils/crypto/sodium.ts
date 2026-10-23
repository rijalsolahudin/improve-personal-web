/**
 * Pemuat libsodium tunggal.
 *
 * `import()` DINAMIS, dan itu bukan detail gaya: paket ini ~400 kB berisi WASM. Kalau diimpor statis,
 * halaman login ikut mengunduhnya padahal kripto baru dibutuhkan setelah user punya kunci.
 *
 * Kenapa satu lapis lagi (`./sodium-runtime`) sebelum libsodium: Nuxt menaruh setiap `dynamicImports`
 * dari chunk di graf route sebagai `<link rel="prefetch">`, sehingga import dinamis langsung di modul
 * ini tetap terunduh saat app start (QA T16 MAYOR-1). Renderer hanya mengikuti satu tingkat, jadi
 * perantara kecil ini yang di-prefetch; libsodium diambil saat `loadSodium()` dipanggil. Detail dan
 * batas ukuran chunk-nya ada di kepala `sodium-runtime.ts`.
 */
import type { SodiumModule } from './sodium-runtime'

export type { SodiumModule } from './sodium-runtime'

let cached: Promise<SodiumModule> | null = null

export function loadSodium(): Promise<SodiumModule> {
  cached ??= import('./sodium-runtime').then((runtime) => runtime.loadSodiumRuntime())

  return cached
}
