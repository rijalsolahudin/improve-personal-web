import { safeRedirectPath } from '~/utils/validation'

/**
 * Gerbang lisensi untuk `/app/**` (ADR 15): tanpa token lisensi yang sah, app tidak bisa dipakai.
 *
 * Pemeriksaannya OFFLINE (tanda tangan Ed25519 atas token tersimpan), jadi app yang sudah
 * diaktivasi tetap terbuka tanpa internet. Ini kontrol produk, bukan batas keamanan data: data user
 * memang tidak ada di server, dan token tidak memberi akses ke apa pun selain membuka app.
 *
 * Hanya di client: `/app/**` dirender client (`ssr: false`) dan token tinggal di `localStorage`.
 * Halaman login sendiri yang mengarahkan user yang sudah berlisensi kembali ke app (lihat
 * `pages/login.vue`), karena halaman itu di-SSR dan server tidak bisa membaca token.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const isProtected = to.path === APP_HOME_PATH || to.path.startsWith(`${APP_HOME_PATH}/`)
  if (!isProtected) return

  if (await useLicense().ensureChecked()) return

  return navigateTo({ path: LOGIN_PATH, query: { redirect: safeRedirectPath(to.fullPath) } })
})
