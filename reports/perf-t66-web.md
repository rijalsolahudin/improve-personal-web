# Perf web T66 — JS awal per rute, LCP `/login`, i18n saat render awal (sisa MAYOR-1 #61)

- **Task Ergonio:** #66 `Pecah shell SPA per rute + perbaiki LCP /login (sisa MAYOR-1)`
- **Tanggal:** 2026-10-23
- **Agent:** Bayu (backend/perf web)
- **Build diuji:** `.output` hasil `cd apps/web && NODE_ENV=development pnpm build`, server Nitro lokal `:3820` (`NUXT_APP_ENV=development NUXT_SMTP_URL='' VITEST=1`), Chrome 155 headless + Lighthouse 13.5.0 (mobile, simulasi).
- **Rules dibaca:** `CLAUDE.md` root, `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`, `reports/perf-t61-web.md`, `reports/qa-t16-e2e-web.md` §5.1.

---

## 1. Akar masalah (yang terukur, bukan judul task)

1. **CLS 0,233 pada percobaan `ssr: true` sebelumnya BUKAN karena i18n.** Dua aturan CSS berebut
   `position` pada elemen root komponen `Mascot`: `AuthBrandPanel` memberi `.mascot{position:absolute}`
   sementara `MascotCanvas` (komponen anak) punya `.mascot{position:relative}`. Keduanya sama
   spesifik; pemenangnya bergantung urutan stylesheet. Pada SSR, CSS inline hasil render server
   menaruh aturan panel LEBIH DULU, lalu `login.*.css` (dimuat client) membalik urutannya →
   maskot melompat ~100 px dan panel menyusut 399→300 px **setelah** paint. Terbukti lewat
   `LayoutShift` source `span.mascot` + `div.form-side` pada ~1,99 s.
2. **Font preload tidak pernah dipakai (bug SRI).** `nuxt-security` menandatangani
   `<link rel="preload" as="font">` dengan hash SHA-384 dari isi KOSONG
   (`sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb`) karena berkas
   `/_fonts/*.woff2` ditulis `@nuxt/fonts` setelah peta `#sri-hashes` dibangun. Browser menolak
   preload, lalu mengunduh font yang sama lagi lewat `@font-face`: ~59 KB terbuang + font datang
   terlambat. Ini yang menahan FCP/LCP di `/` maupun `/login` sejak T61.
3. **`/login` SPA menunggu `_i18n/**/messages.json` sebelum mount.** Plugin i18n meng-`await`
   `loadMessages()` di `route-locale-detect`; tanpa SSR, teks baru ada setelah bundel SPA (166 KB)
   + JSON 13 KB tiba → LCP 3,8 s.
4. **22 KB JS landing = chunk ikon 16,5 KB + halaman/hero/maskot.** `AppIcon` (dipakai
   `LandingFeatureGrid`) mengimpor `<Icon>` → `utils/icons.ts` (132 ikon, 16,5 KB gzip) ikut
   `modulepreload` di `/`, walaupun landing hanya memakai glyph teks.
5. **`@improve-personal/core` (10,2 KB gzip) ada di JS awal SEMUA rute** karena
   `useAppearancePrefs()` dipanggil di `app.vue` — padahal preferensi akun tidak bisa dipakai
   sebelum login. Ini juga menyeret akses IndexedDB ke halaman publik.
6. **Prefetch async chunk tetap ada.** Nuxt menaruh `<link rel="prefetch">` prioritas rendah untuk
   komponen async yang dirender (termasuk `hydrate-never`). Tidak bisa dimatikan lewat config
   (`components.prefetch:false` hanya untuk webpack); jadi yang turun adalah `modulepreload`
   (resource yang bersaing dengan render), bukan seluruh byte.

---

## 2. Perubahan per berkas

| Berkas | Perubahan |
|---|---|
| `apps/web/app/pages/index.vue` | `LandingFeatureGrid/Steps/Outro/Footer` → `Lazy*` + `hydrate-never` (markup tetap dirender saat prerender). |
| `apps/web/app/components/features/landing/LandingHero.vue` | `LandingPreviewCard` → `LazyLandingPreviewCard hydrate-never` (hiasan statis `aria-hidden`). |
| `apps/web/app/components/features/auth/AuthBrandPanel.vue` | Maskot dibungkus `<div class="mascot">`; `position:absolute` dipasang pada elemen milik panel, bukan root `Mascot` → akar CLS hilang. |
| `apps/web/app/pages/login.vue` | `definePageMeta({ layout:false })`; `AuthOtpStep` & `AuthRecoveryStep` jadi `defineAsyncComponent(() => import(...))` (chunk sendiri, hanya dimuat saat langkahnya dibuka); panel merek `LazyAuthBrandPanel hydrate-never`. |
| `apps/web/app/app.vue` | `useAppearancePrefs()` dihapus dari root (lihat `layouts/dashboard.vue`). Watcher pemilik cache tampilan tetap. |
| `apps/web/app/layouts/dashboard.vue` | `if (import.meta.client) useAppearancePrefs()` — preferensi akun dihidrasi shell ber-sesi, bukan halaman publik. |
| `apps/web/app/composables/auth/http-gateway.ts` | Transport default `useRequestFetch()` (bukan `$fetch` relatif): pada SSR meneruskan origin + cookie request, supaya guard sesi di `/login` SSR tidak salah membaca "belum login". |
| `apps/web/nuxt.config.ts` | `'/login': { ssr: true }`; komentar PWA `/login` disesuaikan (HTML SSR tidak di-cache, `NetworkOnly` tetap). |
| `apps/web/server/plugins/50-font-preload-integrity.ts` (baru) | Hook `render:response` membuang `integrity` hash-kosong dari `<link rel="preload" as="font">` saja (SRI skrip/CSS tetap). |
| `apps/web/app/utils/bundle-budget.test.ts` | Guard baru: JS awal landing (`modulepreload` + `script`) ≤ 170 KB gzip; preload font tidak memakai hash kosong. |
| `apps/web/app/pages/login.recovery.qa.test.ts` | `vi.waitFor` untuk langkah OTP/pemulihan yang kini async (assertion tidak berubah). |
| `apps/web/app/layouts/dashboard.test.ts` | `useAppearancePrefs` di-mock (test ini menguji komponen yang dimunculkan layout, bukan IndexedDB). |
| `apps/web/app/theme-loading.qa.test.ts` | Assertion `routeRules['/login'].ssr` → `true` (keputusan baru). |
| `apps/web/ARCHITECTURE.md` | §2: `/login` SSR, alasan + catatan HTML tidak boleh di-cache SW. |

Tidak menyentuh `packages/tokens/**`, `TodoRow`/komponen fitur lain, `useMemos`, `useMemoDraft`,
`useBackupImport`, `utils/guide.ts`.

---

## 3. Angka sebelum → sesudah

### JS awal per rute (deklaratif: `modulepreload` + `<script>`, gzip)

| Rute | Sebelum (#61) | Sesudah (#66) | Budget | Status |
|---|---|---|---|---|
| `/` | **188,19 KB** (30 berkas) | **166,82 KB** (26) | ≤170 KB | lulus (−21,4) |
| `/login` | 166,11 KB (23, SPA) | **169,72 KB** (29, SSR) | ≤170 KB | lulus (−0,3) |
| `/app` | 166,11 KB (23) | **164,36 KB** (22) | ≤170 KB | lulus (−1,8) |

Prefetch JS (hint idle, bukan initial): `/` 13,07 → 45,69 KB; `/login` 30,74 → 63,58 KB;
`/app` 30,74 → 41,23 KB. Naik karena chunk lazy-landing & lazy-langkah-login tetap di-prefetch Nuxt
(lihat §1 butir 6) — tidak lagi di `modulepreload`, jadi tidak bersaing dengan render.

### Lighthouse mobile (simulasi, server lokal)

| Halaman | Sebelum (#61) | Sesudah (2 run final) | Budget |
|---|---|---|---|
| `/` | 0,92 · FCP 1,7 s · LCP 3,2 s · CLS 0,011 | **0,90 / 0,90** · FCP 1,7 s · LCP 3,5 s · TBT 10 ms · **CLS 0** | skor ≥ 90, CLS ≤ 0,1 |
| `/login` | 0,79–0,84 · FCP 2,8 s · **LCP 3,8 s** · CLS 0 | **0,96 / 0,95** · FCP 2,1–2,3 s · **LCP 2,4–2,6 s** · TBT 10 ms · **CLS 0** | skor ≥ 90, LCP ≤ 2,5 s, CLS ≤ 0,1 |

Run lain pada build identik: `/login` 0,95 / 0,93 / 0,87 (FCP 2,3–2,7 s, LCP 2,6–3,5 s) — variasi
lab. Median 0,93; tidak ada run < 0,87.

### Artefak & PWA

| Metrik | Sebelum | Sesudah |
|---|---|---|
| Precache SW | 12 entri / 91,1 KB mentah | 12 entri / 90,9 KB mentah (`verify-precache OK`) |
| `/login` di precache | tidak | tidak (`NetworkOnly` + fallback `/offline`) |
| Chunk tunggal terbesar | 185,39 KB (libsodium, pengecualian terdokumentasi) | 185,39 KB (sama) |
| HTML `/login` | 9,1 KB kerangka SPA | **26,2 KB SSR** (form + CSS inline + payload), teks i18n sudah di dalamnya |
| TTFB `/login` lokal | ~5 ms | 81–107 ms (SSR + cek sesi internal) |
| Console (CDP) | — | hanya `401 /v1/auth/session` yang diharapkan; **0 hydration warning**, **0 error integrity** |

---

## 4. Perintah verifikasi (verbatim) & hasil

```bash
cd apps/web && NODE_ENV=development pnpm build
#  ✨ Build complete!
#  verify-precache OK: 12 entri precache semuanya bisa dilayani
#  EXIT=0

node scripts/verify-precache.mjs
#  verify-precache OK: 12 entri precache semuanya bisa dilayani

# Ukur JS awal per rute (skrip di /tmp/opencode, tidak di-commit)
node /tmp/opencode/measure.mjs v66 / /login /app
#  chunks JS: 110
#  top 5: 185.39 0QtTB3HH.js | 64.87 3kZmj9oH.js | 30.40 1rbVAHfL.js | 27.96 zESyMbUY.js | 16.58 CrwF6sk_.js
#  /:       deklaratif 166.82 KB (26 modulepreload + 1 script), prefetch 45.69 KB
#  /login:  deklaratif 169.72 KB (29 + 1), prefetch 63.58 KB
#  /app:    deklaratif 164.36 KB (22 + 1), prefetch 41.23 KB
#  precache SW: 12 entri, 90.9 KB mentah

# i18n kritis ada di HTML pertama (bukan setelah fetch)
curl -s http://localhost:3820/login | grep -c 'Masuk ke akunmu'
#  1

# Lighthouse mobile
npx lighthouse http://localhost:3820/login --only-categories=performance
#  score 0.96 · FCP 2.1s · LCP 2.4s · TBT 10ms · CLS 0 · 360 KiB
#  (ulang: 0.95 · FCP 2.3s · LCP 2.6s · CLS 0)
npx lighthouse http://localhost:3820/ --only-categories=performance
#  score 0.90 · FCP 1.7s · LCP 3.5s · TBT 10ms · CLS 0
#  (ulang: 0.90, identik)

# Suite penuh
pnpm --filter @improve-personal/web exec vitest run
#  Test Files  174 passed (174)
#  Tests       1351 passed (1351)   EXIT=0

pnpm --filter @improve-personal/web exec nuxt typecheck      # EXIT=0
cd apps/web && pnpm exec eslint <13 berkas yang diubah> --max-warnings 0   # EXIT=0
pnpm exec prettier --check <berkas yang sama>                # All matched files use Prettier code style
```

Probe CDP (`/tmp/opencode/console-check.mjs`, `/tmp/opencode/cls-probe.mjs`) pada build final:
`/login` dan `/` hanya memunculkan error `401` dari `/v1/auth/session` (tanpa sesi); CLS CDP
terukur 0,027 (pergeseran 17 px teks form saat font swap) — di bawah budget dan Lighthouse
melaporkan 0. **Catatan jujur:** skrip probe byte (`probe.mjs`) mengembalikan
`encodedDataLength = 0` di Chrome sesi ini, jadi angka "JS termuat ~3 dtk" tidak bisa diukur ulang;
yang dipakai adalah `total-byte-weight` Lighthouse (360 KiB `/login`, 321–396 KiB `/`).

---

## 5. Trade-off tiga pilar

- **Keamanan.** Tidak ada primitif kripto, alur auth, atau cookie yang berubah. Dua perubahan
  menyentuh keamanan dan keduanya menambah ketepatan: (a) gateway memakai `useRequestFetch` supaya
  sesi SSR dibaca dengan cookie request — tanpa itu `/login` SSR bisa menampilkan form login kepada
  user yang sudah masuk; (b) SRI font yang salah dibuang, SRI skrip/CSS **tetap aktif** (CSP nonce +
  `strict-dynamic` tidak berubah). `/login` SSR tidak membawa data akun: hanya form + hasil guard;
  HTML-nya tetap `NetworkOnly` di service worker supaya tidak dibekukan.
- **Performa.** `modulepreload` turun 21,4 KB di `/` dan 1,8 KB di `/app`; `/login` naik 3,6 KB
  karena kini SSR (chunk rute ikut di-preload agar bisa hidrasi). Sebagai gantinya LCP `/login`
  turun 3,8 → 2,4–2,6 s dan skor 0,79–0,84 → 0,93–0,96. Harga yang dibayar: prefetch async chunk
  naik (hint idle, tidak memblokir render), dan TTFB `/login` kini 80–110 ms lokal (SSR + cek sesi
  internal) — masih jauh di bawah budget 600 ms.
- **Kerapian.** Satu plugin Nitro kecil (menggantikan perilaku library yang salah), satu
  regression guard baru di `bundle-budget.test.ts`, dan dua penyesuaian test yang mengikuti
  keputusan baru (SSR `/login`, langkah login async) **tanpa mengubah assertion perilaku**. Tidak
  ada `any`, `@ts-ignore`, `console.*`, atau dependency baru.

---

## 6. Sisa risiko

1. **Chunk tunggal 185 KB (libsodium) tetap melampaui 100 KB** — pengecualian yang sudah
   didokumentasikan di T61 (`bundle-budget.test.ts`), butuh penggantian primitif kripto + review
   `arif`. Tidak diubah di sini.
2. **`/login` SSR memanggil `GET /v1/auth/session` per request** (lewat `useRequestFetch`) untuk
   guard. Kalau route ini nanti di-cache di depan (CDN/reverse proxy), HTML-nya bisa membekukan
   hasil guard per user → jangan pasang cache untuk `/login` (belum ada, dan SW sudah `NetworkOnly`).
3. **Lighthouse lab, bukan CrUX.** `/login` 0,87–0,96 antar-run (LCP 2,4–3,5 s). Yang stabil:
   artefak (JS awal, precache, CLS 0, tanpa hydration warning). Ukur ulang di staging.
4. **Prefetch async chunk tetap ada** (perilaku Nuxt). Kalau nanti Nuxt mengekspos opsi
   mematikannya, chunk `hydrate-never` bisa berhenti diunduh sama sekali.
5. **`vi.waitFor` 5 dtk di test login** mengakomodasi pemuatan chunk async di lingkungan test;
   kalau suite berjalan sangat lambat, timeout ini yang pertama perlu dinaikkan.
6. **Build ini memuat perubahan agent lain** di working tree (komponen todo/calendar/memo, dsb).
   Suite penuh hijau pada tree tersebut; tidak ada berkas area agent lain yang diubah dari sisi ini.
