import { STYLE_FONT_FAMILIES, themes } from '@improve-personal/tokens'

import { REQUEST_SIZE_LIMIT_BYTES } from './server/utils/request-size'
import { BRAND } from './shared/brand'
import { EARLY_APPEARANCE_SCRIPT } from './shared/appearance'

// Rendering (apps/web/ARCHITECTURE.md §2, ADR #6): data user cuma ada di perangkat, jadi halaman app
// dirender di client (`ssr: false` per route). Hanya landing publik yang di-prerender.
// Output = server Node (Nitro preset server): app ini melayani API `/v1/**` sendiri di samping UI-nya,
// jadi build-nya tidak lagi situs statis murni dan deploy-nya butuh host Node (trade-off dicatat di
// ARCHITECTURE.md §2).
//
// Batas ukuran request. Ketegangannya nyata: `SYNC_MAX_BATCH` (500 record) x
// `SEALED_RECORD_MAX_BLOB_BYTES` (1 MB) = sampai 500 MB untuk satu batch yang SAH menurut kontrak.
// Plafon 8 MB dipilih supaya satu request tidak bisa menghabiskan memori server sebelum validasi
// lain jalan - konsekuensinya KLIEN WAJIB membatasi batch per BYTE, bukan hanya jumlah record
// (500 record hanya aman kalau total blob-nya di bawah ~8 MB).
//
// Angkanya hidup di `server/utils/request-size.ts` (satu sumber), karena ada DUA penegaknya:
// middleware `server/middleware/15-body-limit.ts` (menghitung byte body yang mengalir, semua method)
// dan `requestSizeLimiter` di bawah (pemeriksaan header yang murah). Kalau angkanya ditulis dua kali,
// keduanya bisa berbeda pendapat dan yang paling longgar yang berlaku.

/**
 * Warna latar shell PWA (splash + address bar). Manifest cuma bisa membawa SATU warna statis,
 * sedangkan tema app berganti di client lewat `data-theme` (F16). Tema default (Kuning) dipakai
 * supaya splash tidak berkedip putih sebelum tema pilihan user sempat dipasang.
 */
const PWA_SHELL_COLOR = themes.kuning.bg

/**
 * Batas umur cache kerangka app. HTML shell menunjuk berkas `/_nuxt/<hash>.js` yang dihapus dari
 * precache saat deploy berikutnya, jadi umurnya sengaja pendek: shell basi yang disajikan ke user
 * berjaringan lambat bisa menunjuk chunk yang sudah tidak ada (layar putih) sampai user reload.
 */
const APP_SHELL_MAX_AGE_SECONDS = 24 * 60 * 60
/** Lewat dari ini, koneksi dianggap terlalu lambat: tampilkan shell dari cache, bukan layar kosong. */
const APP_SHELL_NETWORK_TIMEOUT_SECONDS = 4
/** `/app`, `/app/to-do`, `/app/memo`, ... - cukup untuk rute yang benar-benar dibuka user. */
const APP_SHELL_MAX_ENTRIES = 8
/** Nama berkas font mengandung hash isi, jadi entri lama tidak pernah dipakai ulang. */
const FONT_CACHE_MAX_ENTRIES = 24
/** Font immutable: aman disimpan lama supaya gaya yang pernah dipakai tetap ada saat offline. */
const FONT_CACHE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60
/**
 * Chunk `/_nuxt/**` ber-hash isi: nama berkas berubah kalau isinya berubah, jadi aman disimpan lama.
 * Batas umurnya cuma untuk membuang sisa deploy lama, bukan karena kontennya bisa basi.
 */
const ASSET_CACHE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
/** Cukup untuk seluruh chunk + CSS satu build (88 JS + ~14 CSS), tanpa menyimpan dua build sekaligus. */
const ASSET_CACHE_MAX_ENTRIES = 100
/**
 * Halaman fallback untuk navigasi yang gagal (offline). Sengaja HTML statis tanpa JavaScript,
 * BUKAN `app/pages/offline.vue`: kalau yang disajikan HTML hasil render Nuxt, hidrasi mengambil alih
 * route sesuai URL di address bar dan halaman offline langsung tertimpa route yang gagal dimuat.
 *
 * Berkasnya ada di `public/offline/index.html`, BUKAN `public/offline.html`. `createManifestTransform`
 * milik `@vite-pwa/nuxt` membuang segmen TERAKHIR dari setiap entri precache berakhiran `.html`
 * (`offline.html` -> `offline`, `offline/index.html` -> `offline`, `index.html` -> `/`). Kunci
 * cache-nya sama, tetapi Workbox mem-fetch kunci itu relatif ke `/sw.js` menjadi `/offline` - dan
 * server statis Nitro hanya melayani `/offline` dari `offline` atau `offline/index.html`, tidak
 * pernah dari `offline.html`. Versi `public/offline.html` karena itu dibalas 404, Workbox membatalkan
 * SELURUH instalasi (`bad-precaching-response`), SW berhenti di `redundant`, dan tidak ada satu pun
 * aset yang ter-cache - tanpa error yang terlihat, karena `autoUpdate` tetap me-resolve promise
 * registrasi dan `devOptions.enabled: false` membuat dev tidak pernah menjalankan SW. Jaga ini dengan
 * `pnpm verify:precache` (ikut jalan di `build`).
 */
const OFFLINE_PAGE_URL = '/offline'

/**
 * Opsi untuk halaman non-API: coba jaringan dulu (halaman asli saat online), simpan hasilnya
 * seperlunya, dan kalau jaringan mati sajikan halaman offline statis - bukan layar error browser.
 */
function pageCacheOptions(cacheName: string, maxEntries: number) {
  return {
    networkTimeoutSeconds: APP_SHELL_NETWORK_TIMEOUT_SECONDS,
    expiration: { maxEntries, maxAgeSeconds: APP_SHELL_MAX_AGE_SECONDS },
    // Jangan simpan halaman error/redirect sebagai halaman.
    cacheableResponse: { statuses: [200] },
    precacheFallback: { fallbackURL: OFFLINE_PAGE_URL },
    cacheName,
  }
}

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',

  modules: [
    '@pinia/nuxt',
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxtjs/i18n',
    'nuxt-security',
    '@vite-pwa/nuxt',
  ],

  // Panel dev cuma untuk development; `$production` mematikannya (security.md §12).
  devtools: { enabled: true },

  // Port dev server. Redirect URI Google SSO lokal (`NUXT_GOOGLE_REDIRECT_URI_WEB` di .env) ikut port ini.
  devServer: { port: 3700 },

  css: ['@improve-personal/tokens/css', '~/assets/css/main.css'],

  // Primitif UI tinggal di `components/ui/<Nama>/index.vue` dan dipakai tanpa prefix
  // (`<Button>`). Komponen domain tinggal di `components/features/<domain>/`; pemindaian
  // dimulai dari `features` supaya nama tetap `<TodoRow>`, bukan `<FeaturesTodoRow>`.
  components: [
    { path: '~/components/features', pathPrefix: true },
    { path: '~/components/ui', pathPrefix: false },
  ],

  app: {
    head: {
      htmlAttrs: { lang: 'id' },
      meta: [{ name: 'theme-color', content: PWA_SHELL_COLOR }],
      // Tema & gaya dipasang SEBELUM paint pertama (AC T25/F16). Skrip ini statis (tanpa data
      // per-request), jadi aman untuk CSP: halaman SSR mendapat nonce dari `nuxt-security`, halaman
      // hasil prerender mendapat hash dari `ssg.hashScripts`. Lihat `shared/appearance.ts`.
      script: [{ innerHTML: EARLY_APPEARANCE_SCRIPT, tagPosition: 'head' }],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        // Wajib ditulis di sini: `@vite-pwa/nuxt` hanya menyuntik tautan manifest lewat
        // komponen `<VitePwaManifest />` di `app.vue`, dan komponen itu tidak terpasang di repo
        // ini. Tanpa `<link rel="manifest">`, browser tidak pernah menemukan manifest-nya -
        // PWA tidak bisa di-install walau berkasnya ada.
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
    },
  },

  // runtimeConfig: secret HANYA di key private (security.md §1), dibaca `server/utils/env.ts` lewat
  // `useRuntimeConfig(event)` dan diisi dari env `NUXT_<KEY>`. Nilai di bawah tidak pernah ikut ke
  // bundle klien: connection string Postgres, pepper OTP/rate limit, kredensial Google, kredensial
  // email. Default-nya sengaja kosong - env yang kurang bikin server menolak request (fail-closed),
  // bukan jalan tanpa pepper.
  runtimeConfig: {
    // APP_ENV untuk keputusan KEAMANAN (mode OTP fix, cookie `Secure`) dibaca dari key PRIVATE ini
    // (`NUXT_APP_ENV`). `public.appEnv` di bawah hanya untuk UI - nilainya ter-serialize ke klien,
    // jadi tidak boleh dipakai server untuk memutuskan apa pun yang menyangkut keamanan.
    appEnv: 'production',
    databaseUrl: '',
    otpPepper: '',
    rateLimitPepper: '',
    googleClientId: '',
    googleClientSecret: '',
    googleRedirectUriWeb: '',
    googleRedirectUriMobile: '',
    corsAllowedOrigins: '',
    trustedProxyHops: 0,
    resendApiKey: '',
    mailFrom: '',
    // Transport email non-production, mis. Mailpit lokal `smtp://127.0.0.1:1025`. Terisi = email OTP
    // BENAR-BENAR dikirim lewat SMTP, dan mode OTP fix `777777` mati otomatis di env itu
    // (`server/utils/env.ts`). Production tidak memakainya (jalurnya Resend) dan menolak start kalau
    // key ini terisi - supaya berkas env non-production yang ikut ter-deploy ketahuan saat startup.
    smtpUrl: '',
    // `public.appEnv` cuma untuk UI (mis. login demo). Kosong = production.
    public: { appEnv: 'production' },
  },
  $development: {
    runtimeConfig: { appEnv: 'development', public: { appEnv: 'development' } },
  },

  routeRules: {
    '/': { prerender: true },
    // `/login` SSR: HTML-nya sudah membawa teks form, jadi LCP tidak lagi menunggu bundel SPA +
    // `_i18n/**/messages.json` (QA T16 lanjutan: LCP 3,8 s). Percobaan `ssr: true` sebelumnya
    // menghasilkan CLS 0,233 - penyebab sesungguhnya bukan i18n, melainkan dua aturan CSS yang
    // berebut `position` pada maskot panel merek (urutan CSS inline hasil SSR != CSS hasil impor
    // client). Itu sudah diperbaiki di `AuthBrandPanel.vue`, jadi hidrasi sekarang tidak menggeser
    // apa pun (CLS 0 diukur ulang).
    // Guard `auth.global` tetap jalan di server: `useAuthGateway` memakai `useRequestFetch`, yang
    // meneruskan cookie request pada SSR, sehingga user yang sudah login tidak berhenti di sini.
    '/login': { ssr: true },
    // `/app/**` sengaja TANPA cache (bukan `swr`/`isr`): isinya data per akun. `ssr: false` bikin
    // HTML-nya cuma kerangka SPA (lihat catatan `pwa.workbox.runtimeCaching` di bawah).
    '/app/**': { ssr: false },
    // `/v1/**` tidak pernah di-prerender dan tidak boleh masuk cache mana pun: responsnya berisi data
    // per akun (cache/`swr`/`isr` untuk data per-user dilarang - performance.md §2, security.md §2).
    '/v1/**': {
      prerender: false,
      cache: false,
      headers: { 'cache-control': 'no-store' },
    },
  },

  // PWA (ARCHITECTURE.md §3, AC T23): manifest + service worker Workbox (`generateSW`).
  // Aturan kerasnya: service worker cuma menyimpan ASET STATIS dan kerangka app. Tidak ada respons
  // berisi data user yang boleh masuk Cache Storage - cache browser bertahan setelah logout dan bisa
  // dibaca user lain di perangkat yang sama (security.md §2 & §7, AC #37(3)).
  pwa: {
    // SW baru langsung mengambil alih, supaya user tidak terjebak di shell lama sampai semua tab
    // ditutup. Efek sampingnya: tab yang sudah terbuka memakai aset build baru setelah reload.
    registerType: 'autoUpdate',
    // Registrasi lewat plugin Nuxt (bukan `<script>` inline yang disuntik): CSP di security.md §6
    // memakai nonce + 'strict-dynamic', dan skrip inline tanpa nonce akan diblokir.
    injectRegister: false,
    // Service worker tidak dijalankan di dev: cache dev bikin perubahan lokal tidak terlihat dan
    // menyulitkan debugging hydration. Uji offline dilakukan dari hasil `nuxt build`.
    devOptions: { enabled: false },
    manifest: {
      // Nama HANYA dari `shared/brand.ts` - jangan tulis literal brand di sini (komentar di berkas
      // itu: ganti nama brand cukup di satu tempat).
      name: BRAND.name,
      // `brand.ts` belum punya nama pendek terpisah; memakai nama penuh lebih jujur daripada
      // mengarang brand kedua ("Improve") di manifest.
      short_name: BRAND.name,
      lang: 'id',
      // Langsung masuk halaman app: data user ada di IndexedDB, jadi tidak perlu lewat landing.
      start_url: '/app',
      scope: '/',
      display: 'standalone',
      background_color: PWA_SHELL_COLOR,
      theme_color: PWA_SHELL_COLOR,
      // Ikon SVG (bukan PNG biner yang tidak bisa di-review): browser desktop/Android merasterisasi
      // sendiri dan Chromium menerimanya tanpa error installability. Catatan jujur: iOS "Add to Home
      // Screen" TIDAK memakai ikon manifest (butuh `apple-touch-icon` PNG yang belum ada - risiko
      // diterima), dan `sizes` pada SVG cuma target raster, bukan ukuran intrinsik berkasnya. Entri
      // `maskable` punya safe zone 20% supaya tidak terpotong bentuk ikon launcher.
      icons: [
        { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
        { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
        {
          src: '/icons/icon-maskable-512.svg',
          sizes: '512x512',
          type: 'image/svg+xml',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      // Precache: HANYA kerangka yang wajib ada sebelum satu pun request jaringan - halaman shell
      // hasil prerender (`/`), halaman offline, teks i18n, ikon, dan manifest.
      //
      // Kenapa bukan `**/*.{js,css}` lagi (QA T16 MAYOR-1): pola itu menghasilkan **151 entri /
      // ~1,8 MB** yang seluruhnya diunduh saat kunjungan PERTAMA - bersamaan dengan CSS/JS yang
      // dibutuhkan render. Itu 2-3x lipat berat halaman pertama demi keuntungan offline yang baru
      // terpakai belakangan. Chunk `/_nuxt/**` sekarang disimpan lewat `runtimeCaching` di bawah
      // ketika benar-benar dipakai; berkas ber-hash itu immutable, jadi tidak ada risiko versi basi.
      //
      // Font (`/_fonts/**`) sengaja TIDAK ikut precache: font tiap gaya di-lazy-load (F16), jadi
      // mem-preload semuanya memaksa setiap user mengunduh font 7 gaya saat instalasi SW dan
      // melanggar budget font (performance.md: maksimal 2 berkas / 100 KB). Font disimpan saat
      // benar-benar dipakai lewat `runtimeCaching` di bawah - "tersedia offline setelah dipakai".
      //
      // `_i18n/**/messages.json` ikut precache: teks UI diambil `@nuxtjs/i18n` lewat request
      // terpisah saat runtime (bukan bagian chunk JS), jadi tanpa ini seluruh UI tampil sebagai
      // kunci mentah ("login.meta.title") begitu offline. Isinya statis dan bukan data user.
      // Halaman offline (`offline/index.html`) WAJIB ikut: `precacheFallback` di bawah menunjuk
      // ke `/offline`.
      globPatterns: [
        'index.html',
        'offline/index.html',
        '_i18n/**/messages.json',
        'manifest.webmanifest',
        'favicon.svg',
        'icons/**/*.svg',
      ],
      // WAJIB diisi string kosong, bukan dihilangkan dan bukan `null`. Kalau key ini tidak ada,
      // `@vite-pwa/nuxt` mengisinya sendiri dengan `app.baseURL` ('/') - lihat
      // `if (!("navigateFallback" in options.workbox))` di `dist/shared/nuxt.*.mjs`. Workbox lalu
      // memasang NavigationRoute yang melayani SEMUA navigasi dengan HTML hasil prerender '/',
      // termasuk saat ONLINE: buka `/login` -> yang tampil landing page, reload deep link
      // `/app/to-do` -> halaman yang salah. `null` tidak bisa dipakai karena Nuxt membuang nilai
      // `null` dari config sebelum module membacanya (dibuktikan dengan `loadNuxtConfig`); `''`
      // bertahan dan falsy, jadi workbox-build tidak menghasilkan NavigationRoute sama sekali
      // (template-nya memakai `<% if (navigateFallback) %>`).
      // Fallback offline karena itu dipasang PER ROUTE di `runtimeCaching` lewat `precacheFallback`.
      // Konsekuensi yang disadari: route halaman baru hanya dapat fallback offline kalau rule-nya
      // ditambahkan di sini; route tak dikenal saat offline menampilkan error browser (bukan HTML
      // palsu), dan itu lebih jujur daripada menyajikan halaman yang salah.
      navigateFallback: '',
      cleanupOutdatedCaches: true,
      // SEMUA rule di bawah `method: 'GET'`. Workbox hanya mencocokkan GET secara default, jadi
      // POST/PUT/PATCH/DELETE tidak pernah masuk Cache Storage - tidak ada aksi user yang di-cache.
      runtimeCaching: [
        {
          // KENAPA `NetworkOnly`: `/v1/**` adalah API yang mengembalikan data per akun. Respons itu
          // TIDAK BOLEH ditulis ke Cache Storage sama sekali (AC #37(3), ARCHITECTURE.md §3) -
          // walaupun server sudah mengirim `cache-control: no-store`, service worker tetap bisa
          // menyimpannya kalau ada rule cache di sini. `NetworkOnly` = selalu lewat jaringan.
          urlPattern: /^https?:\/\/[^/]+\/(?:v1|api)(?:\/|$)/,
          handler: 'NetworkOnly',
          method: 'GET',
        },
        {
          // Jaring pengaman untuk URL lain yang mengandung `/api/` (proxy, path bersarang,
          // `**/api/**`). Salah tangkap cuma bikin request lewat jaringan - tidak ada kerugian.
          urlPattern: /\/api\//,
          handler: 'NetworkOnly',
          method: 'GET',
        },
        {
          // Chunk & CSS ber-hash `/_nuxt/**`: bagian dari shell app, bukan data user. Disimpan saat
          // dipakai (bukan diprecache di muka) supaya kunjungan pertama tidak mengunduh seluruh
          // bundel. Nama berkas = hash isi, jadi CacheFirst tidak pernah menyajikan versi basi;
          // `maxEntries` membatasi sisa chunk dari deploy lama.
          urlPattern: /\/_nuxt\/.*\.(?:js|css)$/,
          handler: 'CacheFirst',
          method: 'GET',
          options: {
            cacheName: 'nuxt-assets',
            expiration: {
              maxEntries: ASSET_CACHE_MAX_ENTRIES,
              maxAgeSeconds: ASSET_CACHE_MAX_AGE_SECONDS,
            },
            cacheableResponse: { statuses: [200] },
          },
        },
        {
          // Kerangka `/app/**`. Route ini `ssr: false` (lihat `routeRules`), jadi HTML yang dikirim
          // server adalah template SPA yang SAMA untuk semua akun: tidak ada `__NUXT__` berisi data
          // user di dalamnya, hanya config publik. Isi data user tetap di IndexedDB.
          // Kalau `/app/**` suatu hari diubah jadi SSR, rule ini WAJIB dihapus - HTML SSR berisi
          // data per akun dan DILARANG masuk cache (security.md §2, performance.md §2).
          urlPattern: /^https?:\/\/[^/]+\/app(?:\/|$)/,
          handler: 'NetworkFirst',
          method: 'GET',
          options: pageCacheOptions('app-shell', APP_SHELL_MAX_ENTRIES),
        },
        {
          // `/login` sekarang SSR (lihat `routeRules`), tetapi HTML-nya sengaja TIDAK disimpan:
          // form login tidak berguna tanpa jaringan (OTP/Google butuh server), jadi menyimpannya
          // hanya menampilkan halaman yang pasti gagal. HTML SSR rute ini juga berisi keputusan
          // redirect dari guard sesi, yang tidak boleh dibekukan di cache perangkat.
          // `NetworkOnly` + `precacheFallback` = online selalu HTML asli, offline langsung halaman
          // offline statis. Tanpa rule ini service worker tidak menangani navigasi sama sekali dan
          // user melihat layar error browser, bukan pesan yang jelas.
          urlPattern: /^https?:\/\/[^/]+\/login(?:\/|$)/,
          handler: 'NetworkOnly',
          method: 'GET',
          options: { precacheFallback: { fallbackURL: OFFLINE_PAGE_URL } },
        },
        {
          // Font self-hosted (`@nuxt/fonts`) ber-hash: setelah satu kali dipakai, berkasnya tetap
          // ada saat offline. CacheFirst aman karena nama berkas = hash isi, jadi tidak ada versi
          // basi - berkas baru selalu bernama baru.
          urlPattern: /\/_fonts\/.*\.woff2$/,
          handler: 'CacheFirst',
          method: 'GET',
          options: {
            cacheName: 'fonts',
            expiration: {
              maxEntries: FONT_CACHE_MAX_ENTRIES,
              maxAgeSeconds: FONT_CACHE_MAX_AGE_SECONDS,
            },
            cacheableResponse: { statuses: [200] },
          },
        },
      ],
    },
  },

  nitro: {
    // Preset server Node, bukan `static`: API `/v1/**` dilayani app ini sendiri (ADR 7 revisi).
    preset: 'node-server',
    prerender: { crawlLinks: false, routes: ['/'] },
    // Kompresi aset statis (performance.md §Caching Nitro). Tanpa ini `/_nuxt/*.js` dikirim MENTAH:
    // artefak build memuat 483 KB JS di `/app`, dan itu yang diukur QA T16 MAYOR-1 (tidak ada
    // `Content-Encoding` sama sekali). Nitro mem-prekompres `.gz` + `.br` SAAT BUILD (bukan per
    // request), lalu handler statis memilih encoding sesuai `Accept-Encoding`. Biayanya ukuran
    // `.output` (~+1 MB berkas turunan) - ditukar dengan ~60-75% byte JS/CSS di jaringan.
    compressPublicAssets: true,
    // Nitro hanya memindai `server/tasks/**` kalau flag ini menyala (nitropack:
    // `if (nitro.options.experimental.tasks)`). Ini yang mendaftarkan task `purge-tombstones` &
    // `cleanup-ephemeral`. Aman di production: endpoint `/_nitro/tasks/<nama>` cuma ada di preset dev
    // (`presets/_nitro/runtime/nitro-dev.mjs`), jadi flag ini TIDAK mengekspos task lewat HTTP di
    // server produksi. Cron host memakai jalur `tsx scripts/task.ts` (lihat scripts/task.ts).
    experimental: { tasks: true },
  },

  typescript: {
    strict: true,
    tsConfig: { compilerOptions: { noUncheckedIndexedAccess: true } },
  },

  // Self-hosted saat build, subset latin saja. Patrick Hand cuma dipakai di permukaan jurnal.
  // Font gaya non-Cute (PRD F16) cuma dideklarasikan, tidak di-preload: browser baru mengunduhnya
  // saat gaya itu aktif, jadi gaya default tetap 3 file font.
  //
  // Dua font yang dipakai di paint pertama (`--font-display` = Baloo 2, `--font-body` = Nunito)
  // di-preload: LCP halaman landing adalah teks hero dengan font display, dan tanpa preload berkasnya
  // baru diminta setelah CSS selesai diurai - teks berganti font setelah paint (CLS 0,088 di QA T16).
  // Total dua berkas tetap di bawah budget font (<= 2 berkas / 100 KB woff2).
  fonts: {
    defaults: { subsets: ['latin'], styles: ['normal'] },
    families: [
      { name: 'Baloo 2', provider: 'google', weights: [800], preload: true },
      { name: 'Nunito', provider: 'google', weights: [600, 700, 800], preload: true },
      { name: 'Patrick Hand', provider: 'google', weights: [400] },
      ...STYLE_FONT_FAMILIES.map(({ name, weights }) => ({
        name,
        provider: 'google',
        weights: [...weights],
        preload: false,
      })),
    ],
  },

  i18n: {
    defaultLocale: 'id',
    strategy: 'no_prefix',
    detectBrowserLanguage: false,
    locales: [{ code: 'id', language: 'id-ID', file: 'id.json' }],
    // Sengaja TIDAK memakai `experimental.preload` (pesan locale di-serialisasi ke HTML).
    // Halaman `/login` sudah SSR, jadi teksnya tetap ada di render pertama; pesan yang sama lalu
    // diambil dari `_i18n/**/messages.json` sebelum hidrasi (plugin i18n menunggunya), sehingga
    // markup server & client identik. Sebaliknya `preload` menambah ~20 KB JSON ke HTML dinamis
    // `/login` (belum terkompresi) dan ~41 KB ke landing hasil prerender - dibayar setiap kunjungan
    // hanya untuk menghindari satu request 13 KB yang sudah dicache service worker.
  },

  security: {
    headers: {
      contentSecurityPolicy: {
        'base-uri': ["'none'"],
        'connect-src': ["'self'"],
        'font-src': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'img-src': ["'self'", 'data:'],
        'object-src': ["'none'"],
        // Nonce per request + 'strict-dynamic' (security.md §6): skrip yang disuntik tidak lolos
        // hanya karena berasal dari origin kita. `'self'` dipertahankan untuk browser yang belum
        // mendukung CSP3 - di browser CSP3 ia diabaikan begitu 'strict-dynamic' ada.
        //
        // `'wasm-unsafe-eval'`: libsodium (kripto E2EE) berjalan sebagai WebAssembly, dan CSP3
        // MENOLAK kompilasi WASM tanpa token ini - gejalanya `CompileError: WebAssembly.instantiate()
        // ... violates the following Content Security Policy`, dan bagi user hanya terlihat "data
        // lokal tidak bisa dibuka". Bedanya dengan yang dilarang security.md §6: `'unsafe-eval'`
        // (mengizinkan `eval()`/`Function()`) TETAP tidak ada di daftar ini; token ini HANYA
        // mengizinkan kompilasi WebAssembly.
        'script-src': ["'self'", "'wasm-unsafe-eval'", "'nonce-{{nonce}}'", "'strict-dynamic'"],
        'script-src-attr': ["'none'"],
        'upgrade-insecure-requests': true,
        // Service worker di-origin sendiri; tanpa `worker-src`, browser jatuh ke `script-src` yang
        // membawa nonce per request - nonce itu tidak ada di request `/sw.js`, jadi registrasi bisa
        // ditolak. `'self'` saja sudah cukup karena skrip SW tidak pernah di-inline.
        'worker-src': ["'self'"],
      },
      referrerPolicy: 'strict-origin-when-cross-origin',
      permissionsPolicy: {
        camera: [],
        geolocation: [],
        microphone: [],
      },
    },
    nonce: true,
    // Landing tetap di-prerender, jadi halaman itu tidak punya nonce per-request: CSP-nya dipasang
    // lewat <meta> + hash skrip (plugin `30-cspSsgHashes`), sedangkan respons server memakai header
    // nonce (plugin `40-cspSsrNonce`). `hashScripts` tetap WAJIB selama `/` statis - kalau dimatikan,
    // landing kena CSP nonce yang tidak cocok dengan satu pun skripnya sendiri.
    ssg: { meta: true, hashScripts: true, hashStyles: false },
    sri: true,
    // Rate limit otoritatif ada di POSTGRES (`server/services/rate-limit.ts`). Limiter bawaan
    // nuxt-security menyimpan penghitung di MEMORI, jadi dengan dua pod setiap klien mendapat jatah
    // di tiap pod: limitnya tampak aktif padahal tidak menghitung apa pun yang dibagi. Karena itu
    // dibiarkan mati - bukan dinyalakan supaya "kelihatan ada lapisan tambahan".
    rateLimiter: false,
    // CSRF ada di `server/middleware/10-csrf.ts` (cek `Origin`/`Sec-Fetch-Site`), bukan `nuxt-csurf`:
    // mobile memakai bearer tanpa cookie (CSRF tidak berlaku) dan web sudah cukup dengan
    // `SameSite=Lax` + cek origin di server. Alasan lengkap ada di berkas middleware-nya.
    csrf: false,
    // Batas ukuran request: 8 MB (lihat REQUEST_SIZE_LIMIT_BYTES di kepala berkas ini).
    requestSizeLimiter: {
      maxRequestSizeInBytes: REQUEST_SIZE_LIMIT_BYTES,
      maxUploadFileRequestInBytes: REQUEST_SIZE_LIMIT_BYTES,
    },
    hidePoweredBy: true,
    // removeLoggers bawaan nuxt-security memakai opsi esbuild yang diabaikan Vite 8 (oxc);
    // pembuangan console.* dilakukan di minifier Rolldown (lihat `vite` di bawah).
    removeLoggers: false,
  },

  // Drive NTFS (fuseblk) tidak memberi event file ke watcher native, jadi HMR dan perubahan
  // i18n tidak terdeteksi. Polling hanya untuk dev; biayanya sedikit CPU saat develop.
  vite: {
    server: { watch: { usePolling: true, interval: 300 } },
    build: {
      rolldownOptions: {
        output: {
          // libsodium WAJIB chunk sendiri. Tanpa aturan ini Rollup/Rolldown menumpuk helper kecil
          // (namespace import dinamis) ke chunk import()-nya - hasilnya chunk 185 KB itu ikut jadi
          // dependensi STATIS banyak chunk (layout dashboard, form pemulihan), lalu di-prefetch di
          // setiap rute. Dipisah di sini, satu-satunya jalan masuk tetap `import()` di
          // `app/utils/crypto/sodium.ts`.
          codeSplitting: {
            groups: [
              { name: 'libsodium', test: /[\\/]node_modules[\\/](?:\.pnpm[\\/])?libsodium/ },
            ],
          },
        },
      },
    },
  },

  // security.md §11 & §12: console.* dibuang dari bundle production, devtools WAJIB mati -
  // panel devtools mengekspos daftar route dan state runtime ke siapa pun yang membuka halaman.
  $production: {
    devtools: { enabled: false },
    vite: {
      build: { rolldownOptions: { output: { minify: { compress: { dropConsole: true } } } } },
    },
  },
})
