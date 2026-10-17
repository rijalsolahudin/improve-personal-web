import { STYLE_FONT_FAMILIES } from '@improve-personal/tokens'

// Rendering (apps/web/ARCHITECTURE.md §2, ADR #6): data user cuma ada di perangkat, jadi halaman app
// dirender di client (`ssr: false` per route). Hanya landing publik yang di-prerender.
// Output = situs statis (CDN) + SPA fallback (200.html) untuk route client.
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',

  modules: ['@pinia/nuxt', '@nuxt/eslint', '@nuxt/fonts', '@nuxtjs/i18n', 'nuxt-security'],

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

  // APP_ENV (§8, §12): diisi `NUXT_PUBLIC_APP_ENV` saat build. Kosong = production → login demo mati.
  runtimeConfig: {
    public: { appEnv: 'production' },
  },
  $development: {
    runtimeConfig: { public: { appEnv: 'development' } },
  },

  routeRules: {
    '/': { prerender: true },
    '/login': { ssr: false },
    '/app/**': { ssr: false },
  },

  nitro: {
    preset: 'static',
    prerender: { crawlLinks: false, routes: ['/'] },
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
    // Halaman statis tidak punya nonce per-request: CSP dipasang lewat <meta> + hash script.
    ssg: { meta: true, hashScripts: true, hashStyles: false },
    sri: true,
    // Tidak ada server route di app ini (API ada di apps/server).
    rateLimiter: false,
    hidePoweredBy: true,
    // removeLoggers bawaan nuxt-security memakai opsi esbuild yang diabaikan Vite 8 (oxc);
    // pembuangan console.* dilakukan di minifier Rolldown (lihat `vite` di bawah).
    removeLoggers: false,
  },

  // security.md §11: console.* dibuang dari bundle production.
  $production: {
    vite: {
      build: { rolldownOptions: { output: { minify: { compress: { dropConsole: true } } } } },
    },
  },
})
