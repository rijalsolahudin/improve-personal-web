import {
  FixedOtpOverrideError,
  assertServerEnvForStartup,
  resolveAppEnv,
  type ServerEnv,
} from '../utils/env'

/**
 * Validasi env saat boot Nitro (ARCHITECTURE.md §8, PRD T19, security.md §1).
 *
 * Sebelum plugin ini, `resolveServerEnv`/`assertNoFixedOtpOverride` tidak pernah dipanggil saat
 * startup: salah konfigurasi baru kelihatan di request pertama (atau tidak kelihatan sama sekali).
 *
 * Yang dilakukan:
 * 1. Env dibaca dari key PRIVATE `runtimeConfig` lewat `useRuntimeConfig()` - BUKAN
 *    `runtimeConfig.public` (security.md §1: keputusan keamanan tidak boleh membaca nilai yang
 *    ter-serialize ke klien).
 * 2. `assertServerEnvForStartup` memvalidasi env, menolak jalur kedua mode OTP fix, dan menolak
 *    `NODE_ENV=production` yang menjalankan mode fix (temuan M3).
 * 3. Konfigurasi yang AMAN tapi mudah salah setel diperingatkan ke log startup (nama variabel saja,
 *    tidak pernah nilainya).
 *
 * Kebijakan fail-closed (dan yang sengaja TIDAK diblokir):
 * - Jalur kedua mode OTP fix (key `runtimeConfig`/nama env yang cocok pola OTP-fix, mis.
 *   `NUXT_OTP_FIX`): MENOLAK start di SEMUA environment, termasuk non-production. Mode fix HARUS murni
 *   turunan `APP_ENV` supaya tidak ada jalur yang bisa lupa dimatikan saat deploy production. Ini
 *   bagian AC T19 yang paling berbahaya kalau lolos.
 * - `NODE_ENV=production` + mode fix aktif: MENOLAK start, di environment mana pun (temuan M3). Ini
 *   menutup `NUXT_APP_ENV` yang salah label di deployment produksi.
 * - Production (`APP_ENV` = production / kosong / tidak dikenal) + env tidak valid: `ServerEnvError`
 *   dilempar, plugin gagal, server MENOLAK start. Lebih baik mati sekarang daripada jalan tanpa
 *   pepper/DB URL dan menyerahkan keputusan ke jalur "kayaknya development".
 * - Non-production: JANGAN menggagalkan `nuxt dev` / `nuxt build` hanya karena env OPSIONAL belum
 *   diisi (mis. `NUXT_RESEND_API_KEY`, `NUXT_MAIL_FROM` - di non-production email memang tidak
 *   dikirim, lihat `resolveServerEnv`). Karena itu kegagalan validasi di non-production hanya
 *   diperingatkan ke log (nama variabel saja), TIDAK melempar - supaya developer frontend tetap bisa
 *   `pnpm dev` tanpa mengisi kredensial server. Perilaku runtime tetap fail-closed: request yang
 *   benar-benar butuh env itu (mis. koneksi DB) akan gagal sendiri saat dipakai.
 * - Test (`NODE_ENV=test`/`VITEST`): tidak melempar untuk env yang belum lengkap. Unit test tidak
 *   menjalankan server produksi dan tidak boleh bergantung pada secret runtime; yang diuji adalah
 *   fungsi murni di `utils/env.ts`.
 */

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST !== undefined
}

/**
 * Peringatan startup untuk konfigurasi yang sah tapi berbahaya kalau tidak disengaja.
 *
 * Isinya HANYA nama variabel dan konsekuensinya - tidak pernah nilai env (laporan startup yang bocor
 * sama bahayanya dengan secret yang bocor), dan tidak ada data user di sini (fase startup).
 */
function warnAboutRiskyConfig(env: ServerEnv): void {
  if (isTestRuntime()) return

  // Temuan M3: mode fix di non-production itu memang desainnya (login demo/e2e), tapi harus KELIHATAN
  // di log deploy. Kalau baris ini muncul di log environment yang seharusnya produksi, berarti
  // `NUXT_APP_ENV` salah label.
  if (env.fixedOtpEnabled) {
    console.warn(
      `[env] mode OTP fix AKTIF (APP_ENV=${env.appEnv}): kode OTP tetap diterima untuk SEMUA email. ` +
        'Jangan dipakai di deployment publik - periksa NUXT_APP_ENV.',
    )
  }

  // Temuan M5: tanpa hop proxy terpercaya, IP klien = IP proxy, jadi SEMUA klien berbagi satu bucket
  // rate limit per-IP (`otp:ip` 20/15 menit). Konsekuensinya bukan "IP kurang akurat" saja: satu
  // penyerang bisa menghabiskan jatah itu dan memblokir permintaan OTP semua orang. Default-nya tetap
  // 0 (fail-closed terhadap pemalsuan `X-Forwarded-For`); yang perlu adalah menyetelnya sesuai
  // topologi.
  if (env.isProduction && env.trustedProxyHops === 0) {
    console.warn(
      '[env] NUXT_TRUSTED_PROXY_HOPS=0: server diasumsikan TIDAK di belakang proxy. Kalau di belakang ' +
        'proxy/CDN, IP klien akan terbaca sebagai IP proxy - limit per-IP menjadi satu bucket GLOBAL ' +
        'dan mudah dihabiskan. Setel jumlah hop proxy yang benar-benar milik kita.',
    )
  }
}

export default defineNitroPlugin(() => {
  // Prerender (`nuxt build`/`nuxt generate`) menjalankan plugin ini di proses build - dan proses itu
  // sengaja TIDAK punya secret runtime (yang di-prerender cuma landing publik). Kalau divalidasi di
  // sini, build gagal karena `NUXT_DATABASE_URL` belum ada, padahal artifact-nya tidak butuh DB.
  // Jadi prerender dilewati: validasi yang mengikat adalah saat server PRODUKSI benar-benar start.
  if (import.meta.prerender === true) return

  // Cast tipe saja (sama seperti `utils/env.ts`): `useRuntimeConfig` bertipe h3 v2 dari nitropack,
  // sedangkan seluruh helper server bertipe h3 v1. Objeknya sama, hanya beda versi tipe.
  const config = useRuntimeConfig() as unknown as Record<string, unknown>
  const envNames = Object.keys(process.env)

  // Pemeriksaan silang `NODE_ENV` dilewati di runtime TEST, dan itu disengaja: `@nuxt/test-utils`
  // menjalankan server hasil `nuxt build` dengan `NODE_ENV=production` (lihat `env.NODE_ENV` di
  // `server.mjs`-nya) sementara suite test memakai `NUXT_APP_ENV=test`. Tanpa pengecualian ini,
  // seluruh test HTTP gagal start di pemeriksaan yang justru menguji perilaku server produksi -
  // dan `VITEST` adalah sinyal yang sudah dipakai untuk membedakan runtime test di tempat lain.
  const nodeEnv = isTestRuntime() ? undefined : process.env.NODE_ENV

  try {
    warnAboutRiskyConfig(assertServerEnvForStartup(config, envNames, nodeEnv))
  } catch (error) {
    // Jalur kedua mode OTP fix (dan `NODE_ENV=production` + mode fix): tolak start di mana pun, tidak
    // bisa "dilewati".
    if (error instanceof FixedOtpOverrideError) throw error

    const isProduction = resolveAppEnv(config.appEnv) === 'production'
    if (isProduction && !isTestRuntime()) throw error

    // Non-production / test: cukup peringatkan, jangan blokir `nuxt dev`/`nuxt build`/test karena env
    // opsional. Pesannya hanya nama variabel (dari `ServerEnvError.fields`), tidak pernah nilainya.
    const fields = error instanceof Error ? error.message : 'konfigurasi env tidak valid'
    console.warn(`[env] validasi env dilewati (non-production/test): ${fields}`)
  }
})
