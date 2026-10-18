import { STYLE_FONT_FAMILIES } from '@improve-personal/tokens'

import { REQUEST_SIZE_LIMIT_BYTES } from './server/utils/request-size'

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

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',

  modules: ['@pinia/nuxt', '@nuxt/eslint', '@nuxt/fonts', '@nuxtjs/i18n', 'nuxt-security'],

  // Panel dev cuma untuk development; `$production` mematikannya (security.md §12).
  devtools: { enabled: true },

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
      meta: [{ name: 'theme-color', content: '#F6EBDA' }],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
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
    // `public.appEnv` cuma untuk UI (mis. login demo). Kosong = production.
    public: { appEnv: 'production' },
  },
  $development: {
    runtimeConfig: { appEnv: 'development', public: { appEnv: 'development' } },
  },

  routeRules: {
    '/': { prerender: true },
    '/login': { ssr: false },
    '/app/**': { ssr: false },
    // `/v1/**` tidak pernah di-prerender dan tidak boleh masuk cache mana pun: responsnya berisi data
    // per akun (cache/`swr`/`isr` untuk data per-user dilarang - performance.md §2, security.md §2).
    '/v1/**': {
      prerender: false,
      cache: false,
      headers: { 'cache-control': 'no-store' },
    },
  },

  nitro: {
    // Preset server Node, bukan `static`: API `/v1/**` dilayani app ini sendiri (ADR 7 revisi).
    preset: 'node-server',
    prerender: { crawlLinks: false, routes: ['/'] },
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
  fonts: {
    defaults: { subsets: ['latin'], styles: ['normal'] },
    families: [
      { name: 'Baloo 2', provider: 'google', weights: [800] },
      { name: 'Nunito', provider: 'google', weights: [600, 700, 800] },
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
        'script-src': ["'self'", "'nonce-{{nonce}}'", "'strict-dynamic'"],
        'script-src-attr': ["'none'"],
        'upgrade-insecure-requests': true,
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

  // security.md §11 & §12: console.* dibuang dari bundle production, devtools WAJIB mati -
  // panel devtools mengekspos daftar route dan state runtime ke siapa pun yang membuka halaman.
  $production: {
    devtools: { enabled: false },
    vite: {
      build: { rolldownOptions: { output: { minify: { compress: { dropConsole: true } } } } },
    },
  },
})
