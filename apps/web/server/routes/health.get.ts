import { API_VERSION } from '@improve-personal/contracts'

/**
 * `GET /health` - probe publik.
 *
 * Sengaja TIDAK menyentuh database dan tidak mengembalikan apa pun yang bisa dipakai memetakan
 * sistem: cukup "proses ini hidup dan versi protokol yang dilayaninya". Endpoint health yang
 * membocorkan versi dependensi, nama host, atau status koneksi internal adalah peta gratis bagi
 * penyerang, dan health yang menembak DB juga mati bersamaan dengan DB (padahal yang diperiksa
 * cuma "server bisa menjawab atau tidak").
 *
 * Tidak masuk rate limit: dipanggil health-check infrastruktur, bukan klien.
 */
export default defineApiHandler((event) => {
  setHeader(event, 'cache-control', 'no-store')

  return { status: 'ok', apiVersion: API_VERSION }
})
