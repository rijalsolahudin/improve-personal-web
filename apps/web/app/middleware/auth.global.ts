import { APP_HOME_PATH, LOGIN_PATH } from '~/utils/features'
import { safeRedirectPath } from '~/utils/validation'

/**
 * Guard rute global untuk area ber-sesi.
 *
 * Ini proteksi UX, BUKAN lapisan keamanan: tiap request ke `/v1/**` tetap diverifikasi server (cookie
 * sesi + kepemilikan resource), jadi melewati guard ini tidak memberi akses data apa pun
 * (security.md §3). Gunanya cuma supaya halaman `/app/**` tidak tampil tanpa sesi.
 *
 * Satu middleware global berbasis path dipilih daripada `definePageMeta({ auth: true })` di 11 halaman:
 * satu tempat, dan halaman baru tidak bisa "lupa" ditandai.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const isProtected = to.path === APP_HOME_PATH || to.path.startsWith(`${APP_HOME_PATH}/`)
  const isLogin = to.path === LOGIN_PATH

  // Landing dan route publik lain tidak butuh sesi: jangan buat request apa pun ke server di situ.
  if (!isProtected && !isLogin) return

  // `ensureLoaded()` menunggu jawaban server dan membagi satu request yang sama. Inilah yang mencegah
  // pantulan: reload keras di `/app/x` dengan sesi yang masih hidup tidak pernah melihat `null`
  // sementara, jadi user tidak dilempar ke `/login` tanpa alasan.
  //
  // Kalau pemeriksaan sesi gagal karena jaringan, hasilnya sama dengan "tidak ada sesi" (fail-closed):
  // user ke `/login?redirect=<tujuan>`, dan begitu server bisa dihubungi lagi halaman login memuat
  // sesinya - yang (sesi masih hidup) langsung mengarahkannya kembali ke tujuan itu.
  const session = await useAuthSession().ensureLoaded()

  if (isProtected && !session) {
    // Tujuan dikembalikan lewat `safeRedirectPath` (helper yang sama dengan sisi login, cegah open
    // redirect): guard cuma boleh mengirim path internal `/app/**`, bukan apa pun yang ada di URL.
    return navigateTo({ path: LOGIN_PATH, query: { redirect: safeRedirectPath(to.fullPath) } })
  }

  // Sudah punya sesi tapi membuka `/login` (mis. menekan tombol back setelah masuk): arahkan ke app
  // supaya tidak ada keadaan "sudah login tapi masih di halaman login".
  if (isLogin && session) return navigateTo(APP_HOME_PATH)
})
