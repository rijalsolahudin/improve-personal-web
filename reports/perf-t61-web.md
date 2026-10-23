# Perf web T61 — lazy libsodium, kompresi, precache ramping (MAYOR-1 #30)

- **Task Ergonio:** #61 `Perf web: lazy-load libsodium, kompresi aset, precache ramping (MAYOR-1 #30)`
- **Tanggal:** 2026-10-23
- **Agent:** Bayu (backend/perf web)
- **Build diuji:** `.output` hasil `cd apps/web && NODE_ENV=development pnpm build`, server Nitro lokal `:3806` (`NUXT_APP_ENV=development NUXT_SMTP_URL='' VITEST=1`), Chrome 155 headless via CDP + Lighthouse 13.5.0 (mobile, simulasi).
- **Rules dibaca:** `CLAUDE.md` root, `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`, `reports/qa-t16-e2e-web.md` §5.1.

---

## 1. Akar masalah (yang sebenarnya, bukan judul QA)

QA menyimpulkan "libsodium diimpor statis di jalur layout". Yang ditemukan saat reproduksi:

1. **Impor libsodium sudah dinamis**, tetapi Rolldown menumpuk helper *namespace import dinamis* ke chunk libsodium. Akibatnya chunk 185 KB itu menjadi **dependensi statis** beberapa chunk lain (layout dashboard, form pemulihan, sesi data), dan Nuxt menaruh `<link rel="prefetch" as="script">` untuk chunk itu di **setiap** rute. Browser mengunduhnya ~100 ms setelah HTML, sebelum satu pun operasi kripto berjalan. Bukti: 6 chunk berisi `import{t as X}from"./CFfzFXKL.js"`, dan chunk itu ada di daftar prefetch `/`, `/login`, `/app`.
2. **Lapisan data lokal ada di graf awal semua rute.** `useLocalData` (statis di `app.vue` lewat `useAppearancePrefs`) menyeret `storage/session.ts` + `keys-gateway` → skema zod `@improve-personal/contracts` (~28 KB gzip). Dua komposabel (`useKeyRecovery`, `useDevicePairing`) juga mengimpor nilai dari `session.ts`, jadi `import()` malas untuk sesi tidak pernah benar-benar memisah.
3. **Precache SW 147–151 entri (~1,8 MB)** diunduh pada kunjungan pertama (`globPatterns: **/*.{js,css,html,svg}`).
4. **Kompresi aset** ternyata **sudah** aktif di commit `8aa272d` (`nitro.compressPublicAssets: true`), artefak sudah punya `.br`/`.gz`. Laporan QA T16 memakai build sebelum commit itu. Diverifikasi ulang, bukan diubah.
5. **CLS landing 0,088** berasal dari webfont hero (Baloo 2) yang baru diminta setelah CSS diurai - bukan dari layout.

---

## 2. Perubahan per berkas

| Berkas | Perubahan |
|---|---|
| `apps/web/nuxt.config.ts` | `pwa.workbox.globPatterns` → hanya kerangka (`index.html`, `offline/index.html`, `_i18n/**/messages.json`, `manifest.webmanifest`, `favicon.svg`, `icons/**/*.svg`); tambah `runtimeCaching` `/_nuxt/*.{js,css}` (`CacheFirst`, `nuxt-assets`, 100 entri/30 hari); `vite.build.rolldownOptions.output.codeSplitting.groups` mengunci `libsodium` ke chunk sendiri; `fonts` → `preload: true` untuk Baloo 2 + Nunito (2 berkas, 59 KB); komentar `routeRules /login` mencatat percobaan SSR yang ditolak (CLS 0,233). `compressPublicAssets: true` tetap (sudah ada). |
| `apps/web/app/utils/crypto/sodium-runtime.ts` (baru) | Pemuat libsodium sesungguhnya (import dinamis + `await sodium.ready`). Dipisah supaya prefetch Nuxt hanya mengenai berkas kecil ini. |
| `apps/web/app/utils/crypto/sodium.ts` | `loadSodium()` kini `import('./sodium-runtime')` (satu lapis perantara) + tipe `SodiumModule` di-re-export. API tetap sama untuk seluruh pemanggil. |
| `apps/web/app/utils/storage/database-names.ts` (baru) | `assertUserId`, `localDatabaseName`, `keyDatabaseName`, `hasStoredRecords` dipindah dari `session.ts` (fungsi murni) supaya komposabel lain tidak menyeret modul sesi ke graf awal. |
| `apps/web/app/utils/storage/session.ts` | Memakai helper dari `database-names.ts`; sisa isi tetap (alur kunci tidak berubah). |
| `apps/web/app/composables/useLocalData.ts` | `session.ts` dimuat lewat `import()` saat `ensure()`; `keys-gateway` (zod kontrak) juga `import()` di `isFirstDeviceOfAccount`. `LocalKeyMissingError` dibaca dari modul yang sama dengan guard `null`. |
| `apps/web/app/composables/useKeyRecovery.ts`, `apps/web/app/composables/useDevicePairing.ts` | Impor `keyDatabaseName`/`hasStoredRecords` dari `storage/database-names` (bukan `storage/session`). |
| `apps/web/app/utils/storage/account-scope.test.ts`, `apps/web/app/components/features/account/RecoveryBackupCard.qa.test.ts` | Menyesuaikan sumber impor helper yang dipindah (assertion tidak berubah). |
| `apps/web/app/utils/bundle-budget.test.ts` | Guard baru: chunk libsodium **tidak boleh** diimpor statis chunk lain (regresi yang baru diperbaiki), di samping guard lama (`.br`/`.gz`, chunk ≤100 KB kecuali libsodium, precache tanpa `.br`/`.gz`). |
| `apps/web/app/components/features/deco/decoReuse.qa.test.ts` | Assertion precache mengikuti strategi baru (kerangka + ikon + runtime cache chunk); maksud test (sticker tetap tersedia offline) tidak berubah. |

Tidak ada perubahan pada `packages/tokens/**`, `CalendarTimeGrid.vue`, `PomodoroHistory.vue`, `useMemoDraft.ts`, `MemoEditor.vue`, `useBackupImport.ts` (area agent lain).

---

## 3. Angka sebelum/sesudah

### Artefak build

| Metrik | Sebelum | Sesudah | Budget | Status |
|---|---|---|---|---|
| Chunk terbesar (gzip) | **185,48 KB** (`CFfzFXKL.js`, libsodium/Argon2) | **185,39 KB** (`0QtTB3HH.js`, modul yang sama) | ≤ 100 KB | **gagal (batas pustaka)** |
| Chunk terbesar non-libsodium | 65,41 KB | 65,55 KB (entry) | ≤ 100 KB | lulus |
| JS deklaratif `/app` | 170,44 KB (19 modulepreload + entry) | **166,11 KB** (23 + entry) | ≤ 170 KB | lulus |
| JS deklaratif `/login` | 170,44 KB | **166,11 KB** | ≤ 170 KB | lulus |
| JS deklaratif `/` | 192,52 KB (26) | **188,19 KB** (30) | ≤ 170 KB | **gagal (chunk halaman landing sendiri)** |
| Prefetch JS `/app` | 215,64 KB (13) — termasuk 185,5 KB libsodium | **30,74 KB** (14) — tanpa libsodium | - | lulus |
| Prefetch JS `/` | 197,97 KB (9) | **13,07 KB** (10) | - | lulus |
| Precache SW | 147–151 entri / **1.834 KB** mentah | **12 entri / 91 KB** | ramping | lulus |
| Artefak `.br`/`.gz` | ada (commit `8aa272d`) | ada; `Content-Encoding: br`/`gzip` terverifikasi | wajib | lulus |
| `/_nuxt/0QtTB3HH.js` (libsodium) | 534.324 B mentah, `Content-Encoding` tidak ada di build QA | 534.176 B mentah → **151.379 B brotli / 189.842 B gzip** | - | lulus |

### Yang benar-benar diunduh browser (CDP, cold profile, 3 dtk pertama)

| Rute | Sebelum | Sesudah |
|---|---|---|
| `/` | 64 berkas, **352,4 KB** encoded; libsodium diunduh @109 ms | 65 berkas, **281,6 KB** encoded (−20%); **libsodium tidak diunduh** |
| `/login` | (tidak diukur terpisah di baseline) | 48 berkas, **232,0 KB** encoded; **libsodium tidak diunduh** |
| `/app` | 33 chunk / 464 KB gzip (QA, setelah login) | tidak bisa diukur tanpa login; deklaratif 166,11 KB dan libsodium hanya dimuat saat sesi data lokal dibuka |

> Angka CDP adalah `encodedDataLength` (brotli di jaringan), profil Chrome bersih tiap run, 3 detik pertama. Dua run terakhir identik (281,6 / 232,0 KB); run dengan profil hangat lebih rendah - jadi tabel ini memakai yang cold.

### Lighthouse mobile (simulasi, server lokal)

| Halaman | Sebelum (QA T16) | Sesudah (run final) | Budget |
|---|---|---|---|
| `/` | skor **0,65** · FCP 3,6 s · LCP 9,0 s · CLS 0,088 · 1.553 KiB | **0,92** · FCP **1,7 s** · LCP **3,2 s** · TBT 20 ms · CLS **0,011** · 404 KiB | skor ≥ 90, LCP ≤ 2,5 s |
| `/login` | skor **0,63** · FCP 4,7 s · LCP 9,3 s · 1.336 KiB | **0,79–0,84** · FCP **2,8 s** · LCP **3,8 s** · TBT 10–20 ms · CLS **0** · 333 KiB | skor ≥ 90, LCP ≤ 2,5 s |

CLS kedua halaman sekarang di bawah budget; FCP turun 1,9–2,9 s. Yang belum: skor `/login` dan LCP kedua halaman (penjelasan di §6).

---

## 4. Perintah verifikasi (verbatim) & hasil

```bash
cd apps/web && NODE_ENV=development pnpm build
#  ✨ Build complete!
#  verify-precache OK: 12 entri precache semuanya bisa dilayani
#  EXIT=0 (tanpa warning deprecation; `codeSplitting` menggantikan `advancedChunks`)

node scripts/verify-precache.mjs
#  verify-precache OK: 12 entri precache semuanya bisa dilayani

curl -sI -H 'Accept-Encoding: br, gzip' http://localhost:3806/_nuxt/0QtTB3HH.js
#  cache-control: public, max-age=31536000, immutable
#  Content-Encoding: br
#  Content-Length: 151379
curl -sI -H 'Accept-Encoding: gzip' http://localhost:3806/_nuxt/0QtTB3HH.js
#  Content-Encoding: gzip / Content-Length: 189842
curl -sI http://localhost:3806/_nuxt/0QtTB3HH.js
#  Content-Length: 534176   (tanpa Accept-Encoding)

pnpm --filter @improve-personal/web exec vitest run
#  Test Files  169 passed (169)
#  Tests       1310 passed (1310)
#  Duration    74.45s   EXIT=0

pnpm --filter @improve-personal/web exec nuxt typecheck
#  EXIT=0 (tanpa output)

cd apps/web && pnpm exec eslint nuxt.config.ts \
  app/utils/crypto/sodium.ts app/utils/crypto/sodium-runtime.ts \
  app/composables/useLocalData.ts app/utils/storage/session.ts \
  app/utils/storage/database-names.ts app/composables/useKeyRecovery.ts \
  app/composables/useDevicePairing.ts app/utils/storage/account-scope.test.ts \
  app/components/features/account/RecoveryBackupCard.qa.test.ts \
  app/utils/bundle-budget.test.ts app/components/features/deco/decoReuse.qa.test.ts --max-warnings 0
#  EXIT=0

pnpm exec prettier --check <berkas yang sama>
#  All matched files use Prettier code style!   EXIT=0

# Ukur gzip per chunk + JS deklaratif per rute (skrip di /tmp/opencode, tidak di-commit)
node /tmp/opencode/measure.mjs final / /login /app
#  chunks JS: 100
#  top 5: 185.39 0QtTB3HH.js | 65.55 CMLxDAYS.js | 30.01 DKaXPGJw.js | 27.96 zESyMbUY.js | 16.59 B4OH2E-S.js
#  /:       deklaratif 188.19 KB (30 modulepreload + 1 script), prefetch 13.07 KB
#  /login:  deklaratif 166.11 KB (23 + 1), prefetch 30.74 KB
#  /app:    deklaratif 166.11 KB (23 + 1), prefetch 30.74 KB
#  precache SW: 12 entri, 91.1 KB mentah

# Probe CDP (cold profile, 3 dtk): ukuran encoded + apakah libsodium diunduh
node /tmp/opencode/probe.mjs http://localhost:3807/ 3000
#  JS di 3000 ms: 65 berkas, 281.6 KB encoded
#  sodium chunk: tidak diunduh

# Lighthouse mobile
npx lighthouse http://localhost:3807/      --only-categories=performance
#  score 0.92 · FCP 1.7s · LCP 3.2s · TBT 20ms · CLS 0.011 · 404 KiB
npx lighthouse http://localhost:3807/login --only-categories=performance
#  score 0.84 · FCP 2.8s · LCP 3.8s · TBT 10ms · CLS 0 · 333 KiB
#  (run kedua pada build sama: 0.79; TBT 260ms - variasi simulasi)
```

---

## 5. Trade-off tiga pilar

- **Keamanan (kripto vs startup).** Tidak ada satu pun primitif, parameter KDF, format blob, atau alur unlock yang diubah. Yang berubah hanya *kapan* modul kripto diunduh: libsodium tetap satu-satunya pustaka (Argon2id + XChaCha20 + sealed box), tetap dimuat lewat `import()` sebelum operasi pertama, dan tidak lagi diunduh di halaman yang tidak menyentuh kunci (landing, `/login`). Menekan chunk di bawah 100 KB berarti mengganti pustaka kripto → format blob berubah dan **data user lama tidak bisa dibuka**; itu keputusan keamanan, bukan optimasi, jadi tidak diambil di task ini (butuh review `arif`).
- **Performa vs offline.** Precache dipangkas dari 151 menjadi 12 entri; chunk & CSS ber-hash sekarang disimpan `CacheFirst` **saat dipakai** (immutable, 30 hari, 100 entri). Konsekuensi jujur: navigasi offline pertama ke rute yang belum pernah dibuka online tetap jatuh ke halaman offline statis - sama seperti sebelumnya untuk rute yang tidak punya rule. Keuntungannya: kunjungan pertama tidak lagi mengunduh ±1,8 MB yang tidak dipakai render.
- **Kerapian.** Helper murni dipisah (`database-names.ts`), dua QA test menyesuaikan sumber impor/strategi precache **tanpa mengubah assertion perilaku**, dan guard baru mencegah chunk kripto kembali masuk graf awal. Tidak ada `any`, `@ts-ignore`, atau `console.*` baru.

---

## 6. Sisa risiko & acceptance yang belum terpenuhi (jujur)

1. **Chunk tunggal ≤ 100 KB — tidak bisa dicapai dengan libsodium apa pun.**
   Diukur dari tarball npm: `libsodium-sumo.mjs` **169,6 KB gzip** sendirian; build non-sumo `libsodium.mjs` **133,9 KB gzip**; keduanya satu modul ESM yang tidak bisa dipecah Rollup. Chunk 185 KB yang tersisa = inti pustaka + wrapper 15,3 KB.
   *Rekomendasi (task terpisah, wajib review `arif`):* ganti primitif ke `@noble/*` (XChaCha20-Poly1305, Argon2id, X25519 sealed box, `crypto_kdf` dari BLAKE2b) dengan uji byte-identik terhadap libsodium sebelum rilis, **atau** build libsodium dengan `.wasm` eksternal (glue JS < 30 KB) yang juga perlu vendoring + review supply chain. Selama itu, `app/utils/bundle-budget.test.ts` mendokumentasikan pengecualian ini secara eksplisit.
2. **JS awal `/` = 188,19 KB deklaratif (>170).** Selisih 22 KB adalah chunk milik halaman landing sendiri (16,6 KB page chunk + BrandMark/ikon/maskot); shell aplikasi 166,11 KB sudah di bawah budget. Menurunkannya butuh memindahkan `@improve-personal/contracts`+zod (28 KB) keluar dari graf awal, yang berarti mengubah validasi DTO sisi klien di `useAuthSession`/`useLoginFlow` - perubahan kontrak-lintas-app, bukan tweak perf.
3. **Metrik "JS termuat ~3 dtk" masih di atas 170 KB** (232–282 KB encoded per rute). Penyebabnya sama: aplikasi adalah SPA satu shell; landing + login menjalankan entry, Vue, dan skema kontrak. Mencapainya butuh pemisahan shell per rute (multi-entry), bukan penyesuaian chunk.
4. **Lighthouse `/login` 0,79–0,84 (target ≥ 90).** LCP 3,8 s karena `/login` adalah SPA (`ssr: false`) dan teks UI baru tersedia setelah `/ _i18n/.../messages.json` (12,2 KB) tiba. Percobaan `ssr: true` sudah dicoba: HTML terkirim lebih awal, tetapi CLS melonjak ke **0,233** (hidrasi mengganti markup) dan skornya turun ke 0,70 → dikembalikan ke `ssr: false`. Opsi lanjutan: SSR login dengan markup hidrasi yang stabil (atau `font-display: optional` + skeleton), atau membundel pesan i18n ke chunk entry - yang terakhir menambah 12 KB JS awal dan menabrak budget, jadi tidak diambil sekarang.
5. **Angka Lighthouse adalah lab lokal dengan simulasi mobile**, bukan CrUX/p75. Variasi antar-run 0,79–0,84 (`/login`) dan 0,88–0,92 (`/`) cukup besar; yang stabil adalah artefak (ukuran chunk, prefetch, precache, kompresi).
6. **Build ini memuat perubahan agent lain** di working tree (`useBackupImport.ts`, test guide/core). Suite penuh hijau pada tree tersebut; tidak ada file area agent lain yang disentuh.
