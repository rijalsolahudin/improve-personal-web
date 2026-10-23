# QA T16 — End-to-end semua AC web & PWA

- **Task Ergonio:** #30 `[T16] QA end-to-end semua AC di web & PWA` (project `personal-productivity`)
- **Tanggal:** 2026-10-23
- **QA:** Fajar
- **Build diuji:** working tree `f8a9a5c` + perubahan belum di-commit (258 saat mulai, 260 saat laporan ditulis); `nuxt build` 10:41 (`.output` 7.99 MB / 2.15 MB gzip), server Nitro lokal `:3798`, Chrome 155 headless via CDP
- **Lingkup:** `apps/web` (Nuxt 4, halaman + server), PWA, `packages/core` / `packages/contracts` / `packages/tokens` hanya sebagai bukti AC. **Mobile tidak diuji** (di luar lingkup task ini).
- **Rules dibaca:** `CLAUDE.md` root, `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`, `docs/PRD.md` (F1–F16 + tabel T1–T25 + DoD), `ARCHITECTURE.md` §6/§14, `apps/web/ARCHITECTURE.md`, `reports/qa-*.md`.

---

## Verdict

## **GAGAL (blocking)**

Tidak ada fitur inti yang mati: seluruh 15 rute merender tanpa error console, login OTP → passkey → task creation jalan end-to-end, PWA installable dan benar-benar offline, test suite hijau (1.278 test), typecheck & lint hijau setelah QA membetulkan gerbang test. Tapi **3 temuan mayor teknis + 1 mayor keputusan produk** membuat gate "nol blocker/mayor" tidak terpenuhi:

1. **MAYOR-1 — Budget performa dilanggar.** Chunk tunggal **183,6 KB gzip** (libsodium; budget 100 KB), JS yang benar-benar dimuat dalam ~3 dtk pertama di `/app` **464 KB gzip** (33 chunk unik), aset statis **tidak terkompresi** di artefak (`Content-Encoding` tidak ada, tidak ada `.br`/`.gz`, `nitro.compressPublicAssets` tidak diset; JS awal 483 KB dikirim mentah). JS awal yang dideklarasikan HTML = 174.042 B gzip (**169,96 KB**, hanya **38 byte** di bawah budget 170 KB — tanpa ruang). Lighthouse mobile (simulasi) `/` skor **0,65** (FCP 3,6 s, LCP 9,0 s); `/login` **0,63** (FCP 4,7 s, LCP 9,3 s) — budget: skor ≥ 90, LCP ≤ 2,5 s.
2. **MAYOR-2 — Kontras teks di permukaan state < WCAG AA** (B8 yang didefer T25 ke T16). Dihitung ulang independen: `--mute-3` di atas `--soft` gagal **21/21** kombinasi, terendah **3,51:1**; `--accent` di atas `--soft` gagal **16/21**, terendah **3,87:1**. Melanggar AC F16 "kontras AA di semua kombinasi gaya × tema".
3. **MAYOR-3 — `pnpm audit --audit-level=high` gagal**: 2 critical + 4 high (semua di toolchain build/dev). Aturan proyek: High/Critical = blocking.

Ditambah **MAYOR-4 (keputusan produk)** — DoD "data bertahan setelah app ditutup" tidak berlaku untuk Journal: isi jurnal masih in-memory (hilang setelah reload), sementara fitur lain (task/habit/goal/jadwal) sudah persist. Sudah dinyatakan `partial` di halaman Panduan, jadi ini bukan bug baru — tapi DoD menyebutnya, jadi harus diputuskan: sambungkan persistensi atau ubah DoD/PRD secara eksplisit.

Rincian, bukti, dan rekomendasi per pemilik ada di bawah.

---

## 1. Ringkasan temuan

| # | Severity | Area | Temuan | Bukti |
|---|---|---|---|---|
| MAYOR-1 | **Mayor** | Performa | Chunk libsodium 183,6 KB gzip (>100 KB); 464 KB gzip JS dimuat ~3 dtk pertama; aset tidak dikompresi; Lighthouse mobile 0,65/0,63 | §5.1 |
| MAYOR-2 | **Mayor** | Aksesibilitas (F16 AC8) | Kontras teks state terpilih 3,51–4,29:1 (< 4,5:1) | §5.2 |
| MAYOR-3 | **Mayor** | Supply chain | `pnpm audit` 2 critical + 4 high (dev/build toolchain) | §5.3 |
| MAYOR-4 | **Mayor (produk)** | F8 / DoD | Jurnal in-memory, hilang setelah reload | §5.4 |
| MINOR-1 | Minor | Keamanan | `access-control-allow-origin: *` di semua respons (default nuxt-security), tanpa allowlist eksplisit | §5.5 |
| MINOR-2 | Minor | Kerapian/gerbang | Lint & Prettier merah sebelum QA: 1 import tak terpakai + 12 file test tidak terformat | §5.6 |
| MINOR-3 | Minor | Cakupan test (F3) | `useZoneDrag` (pointer mouse/touch) tidak punya test otomatis | §5.7 |
| MINOR-4 | Minor | Konsistensi AC/dokumen | `/app/jadwal` & `/app/sticker` masih placeholder "belum didesain" dan tidak ada di nav | §5.8 |

---

## 2. Scope & metode

**Diuji dengan eksekusi (bukan dari laporan lama):**

- **Suite penuh web**: `pnpm --filter @improve-personal/web exec vitest run` → **164 file / 1.278 test lulus** (exit 0).
- **Suite paket yang menyokong AC**: core **369 test**, tokens **25 test**, contracts **111 test** — semua lulus.
- **`nuxt typecheck`** (2×, termasuk setelah perubahan file bersamaan) → exit 0.
- **`eslint . --max-warnings 0`** → exit 0 (setelah QA membetulkan 1 import di file test).
- **`prettier --check`** area web → bersih (setelah QA memformat 12 file test).
- **`nuxt build` + `verify-precache`** → exit 0, **147 entri precache** semuanya bisa dilayani.
- **Browser CDP (Chrome headless, origin `localhost`, bukan production)**:  - login email → OTP fix `777777` → dialog passkey **wajib** → aktivasi passkey dengan **virtual authenticator** (PRF) → langkah kode pemulihan `iprk1.*`;
  - 15 rute `/app*` dibuka satu per satu: judul, `h1`, jumlah nav, dan **console error** direkam (0 error);
  - buat task dari modal To-do → muncul di To-do **dan** Daily;
  - reload: task bertahan;
  - PWA: manifest, service worker `activated`, isi Cache Storage, API tidak ter-cache, navigasi offline, installability;
  - responsif 360/390/768/1280 px: tidak ada overflow horizontal.

> Catatan metode: build produksi menanam `NODE_ENV="production"` sehingga mode OTP fix sengaja ditolak. Untuk menguji alur login di artefak build lokal, server dijalankan dengan `NUXT_APP_ENV=development`, `NUXT_SMTP_URL=''`, dan `VITEST=1` (jalur yang sama yang dipakai harness test untuk melewati cross-check startup) di `localhost`, **bukan** production. Akun uji: `qa-t16-*@local.test` di database dev lokal.
- **Keamanan**: scan bundle publik untuk 9 nilai secret dari `.env`, header CSP/HSTS, atribut cookie, CSRF (tanpa `Origin` & `Origin` asing), `v-html`/`innerHTML`, isi `localStorage`, `document.cookie`.
- **Performa**: ukuran artefak per chunk (gzip), jumlah chunk awal dari `modulepreload`/`script`, Lighthouse mobile untuk `/` dan `/login`.

**Tidak diuji / batasan (jujur):**

- **CrUX/field data** tidak tersedia (app belum di-deploy ke staging/production). Angka Lighthouse adalah **lab lokal** dengan simulasi mobile.
- **Angka LCP simulasi vs provided-throttling berbeda jauh** (`/` 9,0 s vs 0,1 s). Karena itu LCP dipakai sebagai **indikasi risiko**, sedangkan pelanggaran budget JS/kompresi adalah fakta artefak.
- **WebAuthn nyata** di authenticator fisik / iCloud Keychain / Google Password Manager tidak diuji; yang diuji virtual authenticator Chrome (PRF).
- **Google SSO end-to-end** tidak diuji (butuh kredensial & consent Google); kontrak + test server lulus.
- **Sync antar-perangkat** tidak diuji dari UI: PRD sendiri menyatakan "Sync engine yang tersambung (T21) — belum ada"; status sync lokal masih `offline`/menunggu.
- **iOS PWA** (ikon `apple-touch-icon`) tidak diuji; catatan risiko sudah ada di `nuxt.config.ts:201-205`.
- **APK/iOS** di luar lingkup T16 web.

---

## 3. Matriks AC F1–F16 (web & PWA)

Keterangan metode: **T** = test otomatis, **R** = probe browser/runtime, **S** = review statis/config. Semua test yang disebut lulus di run penuh 2026-10-23 (164 file / 1.278 test).

| Fitur | AC yang dibuktikan | Status | Metode & bukti |
|---|---|---|---|
| **F1 Schedule** | Dua mode waktu menghasilkan data identik; validasi selesai > mulai; teks di-escape; recurrence harian 1–6, mingguan 1/2 minggu multi-hari, bulanan tgl & minggu-ke-N, tgl 29–31 dilewati; edit/hapus 3 opsi; tautan task; ekspansi hanya rentang terlihat | **PASS** | **T** `utils/schedule.test.ts` (39) termasuk `dua mode waktu menghasilkan durasi yang sama`, `edit "kejadian ini"`, `"ini & berikutnya" memotong seri lama`, `"semua"`, `hapus sesuai cakupan`, `bulan tanpa tanggal itu dilewati`; `utils/schedules/persistence.test.ts` (7). **R** `/app/kalender` menampilkan grid + tombol `+ Jadwal`; tidak ada `v-html` (S). **Catatan:** route `/app/jadwal` masih placeholder; form jadwal hidup di Kalender (lihat MINOR-4) |
| **F2 To-do** | Format sisa waktu sesuai F2 (batas 59 mnt/1 jam/1 hari/1 bulan/lewat); **satu timer global**, bukan interval per item; filter/sort; checkbox; tautan jadwal; quick add | **PASS** | **T** `utils/time.test.ts` (24) `describeTimeLeft…`, `utils/tasks.test.ts` (13), `composables/useTasks.test.ts` (13). **S** hanya satu `setInterval` di `app/plugins/ticker.client.ts:12` (+ timer QR & status sync yang bukan sisa waktu). **R** buat task → tampil di To-do & Daily; reload → tetap ada |
| **F3 Eisenhower** | Tambah hanya dari to-do; DnD mouse + touch; posisi per kuadran persist setelah reload; tandai selesai tercoret; bersihkan selesai | **PASS** (celah test pointer) | **T** `utils/tasks.test.ts` `move & posisi` (reorder/pindah kuadran/pool + normalisasi posisi), `composables/useTasks.test.ts:138` `move menyimpan kuadran + posisi`. **S** `composables/useZoneDrag.ts:105-129` membedakan mouse vs touch handle. **Celah:** tidak ada test pointer (MINOR-3) |
| **F4 Pomodoro** | Timer dari timestamp (akurat saat background), start/pause/reset/skip, setting persist, target task/teks, riwayat sesi | **PASS** | **T** `utils/pomodoro.test.ts` (12) `sisa waktu dihitung dari endsAt`, `istirahat panjang tiap 4 sesi`, `menit fokus hari ini…`; `composables/usePomodoro.test.ts` (11) |
| **F5 Countdown** | Unit dinamis tiap ambang; sort terdekat; lewat → "sudah lewat"; arsip | **PASS** | **T** `utils/countdown.test.ts` (17) semua ambang + `lewat beberapa hari`, `groupCountdowns…`; `utils/countdown/persistence.test.ts` (6) |
| **F6 Calendar** | Recurring ter-expand di 3 view; klik hari → panel jadwal+task+jurnal; render bulan < 100 ms untuk 500 kejadian | **PASS** | **T** `utils/calendarViews.qa.test.ts` (17), `pages/app/kalender.test.ts` (9), `kalender.paging.test.ts` (3), `calendar.perf.test.ts` (3; 500 kejadian: hitung & render < 100 ms). **R** `/app/kalender` 3 view + `Hari ini` + grid |
| **F7 Habit** | Streak benar untuk hari tertentu (hari non-jadwal tidak memutus); check-in accumulate; arsip; warna; heatmap | **PASS** | **T** 61 test habit (termasuk `utils/habits.test.ts` 12, `useHabits.qa.test.ts` 14, `habit-read-path`, `persistence` 15, `HabitForm.validation` 4). **R** `/app/habit` render |
| **F8 Journal** | 5 bagian; satu jurnal per tanggal (simpan ulang = update); mention `@jadwal`/`#goal` jadi chip; jadwal terhapus tidak error; render aman; pencarian lokal offline | **PASS** (AC) / **DoD gagal** | **T** `utils/journal.test.ts` (5), `utils/memo.test.ts` (9), `pages/app/memo.qa.test.ts` (14), `MemoGoalMention.qa.test.ts` (2). **S** tidak ada `v-html`/`innerHTML`; isi dirender sebagai teks. **R** `/app/memo` 5 kartu + Diary Book. **Gagal DoD:** in-memory (MAYOR-4) |
| **F9 Guide** | Section F1–F16 + FAQ + backup + E2EE/pemulihan; daftar isi bisa diklik; status sesuai kode | **PASS** | **T** `utils/guide.test.ts` (10), `guide.qa.test.ts` (13), `GuidePage.qa.test.ts` (8), `guideRouting.qa.test.ts` (1). **R** `/app/panduan` 14.242 char, 30 anchor nav |
| **F10 Import/Export** | Round-trip identik; file invalid/versi asing ditolak tanpa mengubah data; batas ukuran; peringatan "tidak terenkripsi" | **PASS** | **T** 37 test io: `utils/io/export.test.ts` (6, termasuk `berkas hasil export selalu lolos validasi import`), `import.test.ts` (5, `menolak dokumen tidak konsisten TANPA menulis apa pun`), `preview.test.ts` (6), `read-file.test.ts` (3), `io.round2.qa.test.ts`, `BackupExportCard`/`BackupImportCard` (9) |
| **F11 Overview** | 5 rentang + prev/next; metrik & streak benar per rentang; agregasi sekali per ganti rentang | **PASS** | **T** `utils/overview.test.ts` (26), `overview.aggregation.qa.test.ts` (1), `pages/app/overview.range.qa.test.ts` (19). **R** `/app/overview` rentang pekan + nav |
| **F12 Daily** | Prioritas = Penting&Mendesak lalu urgent (tanpa duplikat, urut deadline); to-do hari ini + terlambat + progress; quick add; edit/hapus dari widget; kalender hari ini; review berkala; cuaca tidak memblokir | **PASS** | **T** 34+ test daily (`useDailyRoutine.qa` 8, `.test` 5, `.persistence.qa` 7, `dailyWidgets.qa` 6, `dailyCalendar.qa` 4, `DailyGoalReviewCard.qa` 5, `DailyTodoCard` 1, `dailyTodoFold.qa` 2). **R** task yang dibuat muncul di widget "To-do hari ini" Daily; 15 rute tanpa error |
| **F13 Goals** | Progress task/habit/jadwal; Sepanjang goal ikut rata-rata; tanpa chapter; chapter selesai manual; status terlewat; periode di luar main goal ditolak; satu item satu tautan; edge case hapus | **PASS** | **T** `utils/goals.test.ts` (13), `goals.parity.qa` (9), `goals.links.qa` (6), `goals.lifecycle.qa` (7), `goals/persistence` (4), `HabitForm.goal.qa` (2). **R** `/app/goals` filter status/kategori |
| **F14 Sticker** | Tempel/ganti/hapus di jurnal; ikon habit/countdown; hias per ukuran layar; posisi % ikut elemen; di luar mode hias tidak menangkap pointer; 100 sticker ringan; ID tak dikenal → placeholder; lazy per pack | **PASS** | **T** 70 test deco/sticker (`DecoLayer.qa` 14, `decoReuse.qa` 10, `DecoPicker.qa` 10, `deco.qa` 12, `deco.test` 10, `DecoStickerItem` 9, `DecoStickerArt` 5, `stickers.test` 4). **R** tombol "Hias" ada di shell |
| **F15 Account & Security** | Login OTP 6 digit; passkey wajib satu tap (tidak bisa ditutup); kode pemulihan `iprk1.*`; perangkat + logout; hapus akun; pesan error generik; E2EE | **PASS** (web) | **T** ±201 test akun/kripto (+ server auth/keys/session: `auth-session`, `otp`, `keys-account`, `session-device`, `google-oauth`, `http-hardening`). **R** login OTP `777777` → dialog passkey non-dismissible → aktivasi virtual authenticator → kartu kode pemulihan berisi `iprk1.` (24 kata + envelope); `/app/akun` menampilkan status kunci & passkey. **Tidak diuji:** SSO Google nyata, authenticator fisik |
| **F16 Tampilan** | 3 tema + 7 gaya sebagai token; ganti tanpa reload; simpan per akun & sync; default Cute+Kuning; nilai asing → default; terpasang sebelum render; font lazy & offline; **kontras AA**; semua halaman tampil benar | **FAIL** (satu sub-AC) | **T** `packages/tokens` 25 test, `appearance.qa` 10, `useAppearancePrefs.round2.qa` 5, `theme-loading.qa` 4, `theme-vocabulary.qa` 3, `AppearanceMenu.qa` 7, `app.qa`. **R** pre-paint atribut benar; font hanya gaya aktif. **FAIL:** AC8 kontras state — MAYOR-2 |

### AC tingkat task yang tidak punya baris fitur (T1, T2, T19, T23)

| Task | AC | Status | Bukti |
|---|---|---|---|
| **T1** Fondasi/nav | Semua halaman bisa dibuka lewat nav; lint/typecheck/build; responsif ≥360 px | **PASS dengan catatan** | **R** 10 item sidebar + menu akun (Akun, Panduan, Import/Export) + tab bar HP; `/app/jadwal` & `/app/sticker` placeholder tanpa nav (MINOR-4); **R** 360/390/768/1280 px `scrollWidth == innerWidth` (tidak overflow); **T/S** lint 0 error, typecheck 0, build 0 |
| **T2** Lapisan data | Satu interface repo; skema `version`; record punya id/updatedAt/deviceId/tombstone; query rentang pakai index | **PASS** | **T** `utils/storage/{indexeddb,repository,session,account-scope,legacy-migration}.test.ts` (34 + 9 + 7 + 5 + 3); **S** `app/utils/storage/indexeddb.ts` index per tipe & rentang |
| **T19** Server akun | OTP production/non-production, rate limit, expiry, fail-closed, SSO, sesi per perangkat, authz, hapus akun, secret env | **PASS** | **T** `server/tests/*` 195 test (env 40, http 40, otp 20, http-hardening 20, keys-account 20, session-device 14, sync 19, google-oauth 6, auth-session 6, request-ip 6, https-headers 3, contract-routes 1). **R** `777777` diterima di non-production tanpa SMTP; cookie sesi `HttpOnly; SameSite=Lax; Path=/`; CSRF 403 |
| **T23** PWA | Installable; offline; SW tidak cache respons API berisi data user | **PASS** | **R** manifest 200 + `installabilityErrors: []`; SW `activated`, precache **147**, cache `app-shell` + `fonts`; `/v1` & `/api` **0 entri** di Cache Storage; server dimatikan → `/login` = halaman offline (0 `<script>`), `/app` = shell cache lalu redirect ke login, bukan error browser. **Build** `verify-precache OK: 147` |

---

## 4. Definition of Done — status

| Butir DoD | Status | Bukti |
|---|---|---|
| Semua T1–T15, T17–T25 `done`, T16 LULUS | **Belum** | Verdict T16 = GAGAL (3 mayor + 1 mayor produk) |
| Lint, typecheck, unit test (semua area), build web/PWA lulus | **PASS setelah perbaikan QA** | vitest 164/1.278, core 369, tokens 25, contracts 111; typecheck 0; eslint 0; prettier bersih; build 0 + precache 147 |
| Tidak ada `innerHTML` dari input user tanpa sanitasi; import divalidasi sebelum menulis | **PASS** | `grep v-html` hanya komentar penjelas di `ui/QrCode/index.vue:9-10`; `innerHTML` 0; `utils/io/import.test.ts` membuktikan tidak menulis saat dokumen tidak konsisten |
| DB server hanya ciphertext; OTP & kunci tidak pernah di-log; recovery key tidak disimpan server | **PASS (bukti T19–T21)** | `KEY_SLOTS = ['passkey']` (`packages/contracts/src/keys.ts:27`); `server/services/otp.ts:28` "Kode TIDAK PERNAH dicatat"; log server hanya `console.warn/error` terstruktur (`server/utils/server-log.ts`) |
| Data bertahan setelah app ditutup, jalan offline, tersinkron antar perangkat | **FAIL sebagian** | Task/habit/goal/jadwal persist (reload task terbukti); **Journal in-memory** (MAYOR-4); sync engine belum tersambung (diakui PRD F15) |
| Panduan sesuai fitur yang benar-benar jadi | **PASS** | `utils/guide.test.ts` mengikat status/klaim ke kode; Journal jujur ditandai `partial` |

---

## 5. Temuan (reproduksi, expected vs actual, bukti)

### MAYOR-1 — Budget performa web dilanggar (JS awal, chunk tunggal, kompresi)

**Severity:** Mayor (blocking AC performa; `apps/web/.claude/rules/performance.md` §Budget).

**Reproduksi:**
1. `cd apps/web && pnpm build` (exit 0).
2. Ukur gzip tiap `/_nuxt/*.js`; hitung dari HTML `/app` hasil build (`curl /app`, 19 `link[rel=modulepreload]` + 1 `script[src]`) dan dari CDP `performance.getEntriesByType('resource')` setelah mount (33 chunk unik).
3. `curl -sSI -H 'Accept-Encoding: gzip, br' http://localhost:3798/_nuxt/zBSw9x_O.js`.
4. Lighthouse mobile: `lighthouse http://localhost:3798/ --only-categories=performance` dan `/login`.

**Actual:**
- Chunk tunggal terbesar **`CFfzFXKL.js` = 534.324 B raw / 187.973 B gzip (183,6 KB)** — chunk libsodium/Argon2. Budget chunk tunggal 100 KB → **dilanggar**. Chunk ini **bukan** bagian 19 `modulepreload` di HTML, tapi dimuat saat app start (bukan interaksi user): `initiator: "link"`, `startTime: 32 ms`.
- JS awal yang dideklarasikan HTML `/app` (19 `modulepreload` + 1 `script`): **174.042 B gzip = 169,96 KB**; budget 170 KB → **lolos hanya 38 byte**. Raw-nya **483 KB** karena tidak dikompresi.
- Dalam ~3 dtk pertama setelah mount, `/app` sudah memuat **33 chunk JS unik = 464 KB gzip** (termasuk libsodium di atas) — 2,7× budget JS awal. Ini yang membuat FCP/LCP lab memburuk.
- `/_nuxt/zBSw9x_O.js` dikirim `Content-Length: 190647` **tanpa `Content-Encoding`**; `.output/public` tidak punya `.br`/`.gz`; `nitro.compressPublicAssets` tidak ada di `nuxt.config.ts:307-317`.
- Lighthouse mobile (2 profil baru, hasil sama): `/` **0,65** — FCP 3,6 s, **LCP 9,0 s**, TBT 20 ms, CLS 0,088, total 1.553 KiB. `/login` **0,63** — FCP 4,7 s, **LCP 9,3 s**, TBT 40 ms, CLS 0,017, total 1.336 KiB. (`throttling-method=provided`: `/` 0,98 / LCP 0,1 s — angka LCP simulasi sensitif; FCP 3,6–4,7 s dan ukuran artefak tidak.)
- Dugaan penyebab render lambat: SW mengunduh **147 entri precache** saat kunjungan pertama, bersaing dengan CSS/JS render di simulasi mobile.

**Expected:** JS initial ≤ 170 KB gzip per route, chunk tunggal ≤ 100 KB, aset statis terkompresi, Lighthouse mobile ≥ 90, LCP ≤ 2,5 s.

**Bukti kode:** `apps/web/nuxt.config.ts:307-317` (nitro tanpa `compressPublicAssets`), `apps/web/nuxt.config.ts:177-305` (precache `**/*.{js,css,html,svg}`), impor crypto yang statis di `app/composables/useLocalData.ts` → `app/utils/storage/session.ts` → `app/utils/crypto/*`.

**Rekomendasi (dimas/bayu):**
- Pisahkan libsodium ke `import()` dinamis yang hanya dipanggil saat operasi kripto benar-benar dibutuhkan (unlock/enkripsi), jangan di graf layout.
- Aktifkan `nitro.compressPublicAssets: true` (atau dokumentasikan kompresi di reverse proxy dan ukur ulang di staging).
- Kurangi precache kerangka: precache entry + halaman offline + i18n saja; chunk route di-cache saat dipakai (`runtimeCaching`), atau tunda instalasi SW setelah `load`.
- Ukur ulang dengan PSI/CrUX di staging sebelum rilis.

### MAYOR-2 — Kontras teks permukaan state < WCAG AA (F16 AC8)

**Severity:** Mayor (AC eksplisit; keterbacaan).

**Reproduksi:** hitung rasio kontras token efektif (`palette + themes[theme] + uiStyles[style].neutrals + brand[theme]`) untuk 21 kombinasi gaya × tema. Skrip QA: `/tmp/opencode/qa-t16/contrast-b8.ts` (tidak masuk repo).

**Actual (gagal 4,5:1):**

| Pasangan | Gagal | Terendah | Contoh |
|---|---|---|---|
| `--mute-3` di atas `--soft` | **21/21** | **3,506:1** | cute-pure/ungu `#7C756D` di `#E6DEFB` |
| `--mute` di atas `--soft` | **15/21** | 3,747:1 | cute-pure/ungu |
| `--accent` di atas `--soft` | **16/21** | 3,866:1 | cute/ungu `#7A52C7` di `#E0D4F6` |
| `--mute` di atas `--hover` | 4/21 | 4,295:1 | cute-pure/ungu |
| `--ink-2` di atas `--dash` | 2/21 | 4,135:1 | kertas/ungu |

**Pemakaian nyata:** `app/components/features/calendar/CalendarTimeGrid.vue:211` (`.head.selected { background: var(--soft) }`) + `:215-220` (`.dow { color: var(--mute-3) }`, anak dari `.head`); `:354-357` (`.slot:hover { background: var(--hover); color: var(--mute) }`); `:227-229` (`.head.today .num { color: var(--accent) }`, bobot < 700 sehingga bukan "large text"); `app/components/features/pomodoro/PomodoroHistory.vue:110-113` (`.skipped .badge`, `--ink-2` di `--dash`).

**Expected:** semua teks normal ≥ 4,5:1 di semua kombinasi (AC F16 & `performance`/`security` review checklist).

**Catatan:** 441 pasangan "permukaan utama" yang disepakati di T25 tetap lulus (terendah 4,5063:1). Temuan ini persis B8 yang didefer ke T16 — **belum diperbaiki**. Hitungan `--accent` di atas `--soft` di sini lebih luas dari subset yang dicatat B8 (T25 hanya menyebut 2 gaya): skrip QA memeriksa token mentah untuk semua 21 kombinasi, jadi angka 16/21 adalah batas atas; yang pasti gagal di pemakaian nyata adalah `.head.today .num` pada gaya Simple/Elegan (bobot < 700).

**Rekomendasi (dimas):** gelapkan `--mute-3`/`--mute` ±8–12% atau pakai `--mute-2` untuk caption di state terpilih; untuk `--accent` di `--soft` gunakan `--deep`/`--deeper`; tambahkan pasangan state ke `packages/tokens/src/contrast.qa.test.ts` supaya tidak regresi.

### MAYOR-3 — `pnpm audit` tidak bersih (2 critical + 4 high)

**Severity:** Mayor (aturan `shared-security.md`: High/Critical = blocking).

**Reproduksi:** `pnpm audit --audit-level=high` dari root (exit 1).

**Actual:** 12 kerentanan — **2 low, 4 moderate, 4 high, 2 critical**:
- critical: `@simple-git/argv-parser < 2.0.1` & `simple-git` (via `nuxt > @nuxt/devtools`) — GHSA-v5rq-49vh-5v5c, GHSA-x6jw-m9v5-85vh;
- high: `node-forge ≤ 1.4.0` (via `nuxt > @nuxt/cli > listhen` dan `nitropack > listhen`), `braces ≤ 3.0.3` (i18n/nitropack/globby), `simple-git ≤ 3.36.0` ×2.

**Dampak nyata:** seluruh jalur ada di **toolchain build/dev** (devtools dimatikan di production oleh `nuxt.config.ts:419-424`); eksploitasi butuh mesin dev/CI yang menjalankan devtools terhadap repo yang bisa dikendalikan penyerang. Runtime production tidak mengekspos `simple-git`/`listhen` sebagai endpoint. Namun gate CI resmi tetap gagal, dan `@nuxt/devtools` tetap terpasang di `node_modules`.

**Sudah dilaporkan sebelumnya:** `reports/be-security/analysis-security.md` H3 (temuan sama, belum ditutup; belum ada `pnpm.overrides` di root `package.json`).

**Rekomendasi (bayu/arif):** `pnpm.overrides` untuk `simple-git ≥ 3.36.1` (atau 4.0.1), `node-forge ≥ 1.4.1`, `braces ≥ 3.0.4`; `pnpm install` + commit lockfile; jadikan `pnpm audit --audit-level=high` job CI blocking. Kalau tidak bisa dinaikkan, tulis exception bertrade-off + mitigasi.

### MAYOR-4 — Jurnal tidak bertahan setelah reload (DoD "data bertahan")

**Severity:** Mayor (DoD), **keputusan produk** — bukan regresi baru.

**Reproduksi:** login → `/app/memo` → tulis di editor → simpan → reload.

**Actual:** `useMemos` menyimpan jurnal di `useState('memos')` yang di-seed mock dan **tidak pernah ditulis ke IndexedDB/outbox**. Komentar kode menyatakannya sendiri: `app/composables/useMemos.ts:43-45` — "Fase 1: in-memory … Isi jurnal tidak ditulis ke localStorage … nanti disimpan terenkripsi lewat packages/core". Halaman Panduan juga jujur: `app/utils/guide.ts:179-190` (status `partial`, "isi jurnal dan mood baru bertahan selama sesi, belum tersimpan permanen"). Probe reload: `textarea` kosong dan entri hilang.

**Expected (DoD):** "Data bertahan setelah app ditutup, jalan offline, dan tersinkron antar perangkat." Task/habit/goal/jadwal memenuhi ini (task terbukti bertahan setelah reload); jurnal tidak.

**Catatan:** T11 sudah LULUS dengan AC "simpan ulang = update" (in-memory) dan keterbatasan ini dinyatakan di Panduan. Jadi pilihannya: (a) sambungkan jurnal ke repository core + outbox (bayu/dimas) sebelum rilis, atau (b) ubah DoD/PRD dan komunikasikan sebagai fitur fase 2. Selama belum diputuskan, gate tidak bisa menyatakan "semua AC + DoD lulus".

### MINOR-1 — `access-control-allow-origin: *` tanpa allowlist eksplisit

**Severity:** Minor.

**Bukti:** semua respons (termasuk `/v1/*`) mengirim `access-control-allow-origin: *` tanpa `access-control-allow-credentials` (`curl -I http://localhost:3798/app`). Berasal dari default CORS handler nuxt-security (`createOriginHeaders`: origin tidak diset → `*`). `nuxt.config.ts:396-399` mematikan `csrf` dan tidak mengonfigurasi CORS; `runtimeConfig.corsAllowedOrigins` ada tapi tidak dipakai handler.

**Dampak:** tidak ada kredensial ambient yang bisa dibaca lintas origin (cookie `SameSite=Lax` + tanpa `credentials`), jadi bukan IDOR/bypass. Tapi aturan `security.md` §6 meminta allowlist eksplisit; `*` juga membuat respons non-kredensial mana pun bisa dibaca situs lain.

**Rekomendasi:** set `security.corsHandler` mati atau origin eksplisit; tambah test header.

### MINOR-2 — Gerbang lint & format merah sebelum QA (sudah diperbaiki QA, test-only)

**Severity:** Minor (proses).

- `pnpm exec eslint . --max-warnings 0` → **exit 1**: `app/utils/guide.test.ts:6` `GUIDE_COPY is defined but never used`.
- `prettier --check` area web → **12 file test** tidak terformat (`dailyWidgets.qa`, `DecoLayer.qa`, `decoReuse.qa`, `DecoStickerItem.qa`, `dailyCalendar.qa`, `useAppearancePrefs.round2.qa`, `useBackupImport.round2.qa`, `useDeco.qa`, `kalender.test`, `calendarViews.qa`, `deco.qa`, `io.round2.qa`).

QA menghapus import tak terpakai (bukan assertion) dan menjalankan `prettier --write` pada 12 file test itu; setelahnya eslint & prettier **exit 0**. Tidak ada assertion yang diubah/dihapus.

### MINOR-3 — `useZoneDrag` tanpa test pointer (celah cakupan F3)

**Severity:** Minor (risiko, bukan bug). `app/composables/useZoneDrag.ts` menangani pointer mouse/touch, threshold, ghost, dan drop index, tetapi tidak ada test otomatis; yang diuji hanya `useTasks.move` (persistensi posisi). Rekomendasi: tambah test komponen yang mengirim `pointerdown/move/up` (mouse di kartu, touch hanya dari handle, tombol di kartu tidak memicu drag).

### MINOR-4 — `/app/jadwal` & `/app/sticker` placeholder, tidak ada di nav

**Severity:** Minor (dokumen/AC vs implementasi). Keduanya merender "Halaman ini belum didesain" (`app/pages/app/[feature].vue` → `FeaturePlaceholder`). F1 hidup di Kalender; F14 hidup di picker/hias. T1 berbunyi "semua 15 halaman bisa dibuka lewat nav" — secara literal tidak terpenuhi untuk dua rute ini. Rekomendasi: hapus rute placeholder atau ubah AC/PRD + tautkan dari menu.

Tambahan kecil di area yang sama: `/app/akun` tidak memanggil `useHead`, jadi judul tab tetap "Improve Personal" (halaman lain menyebut nama halaman). Bukan bug fungsional, tapi tidak konsisten.

---

## 6. Cek tiga pilar

### Keamanan — PASS (dengan MINOR-1 & MAYOR-3)

- **Secret di bundle publik:** 161 file `.output/public` dipindai terhadap 9 nilai secret dari `.env` (DB URL, OTP/rate-limit pepper, Google client ID/secret, redirect URI, SMTP, mail from) → **0 hit**. `runtimeConfig.public` hanya `appEnv` (`nuxt.config.ts:152`).
- **Cookie sesi:** `ip_session` → `HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`; `Secure` menyala kecuali `APP_ENV=development` (`server/utils/session-cookie.ts:44-50`), dan test `server/tests/http.test.ts:304-328` menegaskan `Secure`.
- **CSRF:** `POST /v1/sync/push` dengan cookie sesi tetapi **tanpa** `Origin`/`Sec-Fetch-Site` → **403 FORBIDDEN**; dengan `Origin: https://evil.example` → **403**. (`server/middleware/10-csrf.ts`.)
- **Header:** CSP nonce + `'strict-dynamic'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `worker-src 'self'`; `'unsafe-eval'` **tidak ada**; `'wasm-unsafe-eval'` ada (disetujui PRD F15 untuk libsodium). HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` aktif.
- **XSS:** `v-html` 0 (hanya komentar di `ui/QrCode/index.vue:9-10`), `innerHTML`/`eval`/`new Function` 0 di `app/`.
- **localStorage:** hanya `ip-style`, `ip-theme`, `ip-appearance-owner` (preferensi tampilan); **tidak ada token/kunci**; `document.cookie` kosong dari JS (HttpOnly).
- **Error generik:** `server/utils/api-error.ts` + `http-hardening.test.ts` (20 test).
- **Catatan:** `access-control-allow-origin: *` (MINOR-1); audit High/Critical (MAYOR-3).

### Performa — FAIL

- Budget performa **gagal**: chunk tunggal 183,6 KB gzip (>100 KB), 464 KB gzip JS dimuat ~3 dtk pertama (>170 KB), aset statis tanpa kompresi. JS awal deklaratif 169,96 KB — lolos hanya 38 byte. Lighthouse mobile `/` 0,65 (FCP 3,6 s, LCP 9,0 s), `/login` 0,63 (FCP 4,7 s, LCP 9,3 s) — angka LCP simulasi sensitif (§5.1), tapi skor & FCP konsisten di 2 run. CLS 0,088 & 0,017 (≤ 0,1, lulus).
- TTFB lokal 453 ms (di bawah 600 ms, lab). Payload `__NUXT__` landing **996 B** (budget 50 KB). Gambar tidak dipakai di halaman publik; font default 2 woff2 (39,7 KB + 19,2 KB) sesuai budget.
- F6 AC performa lulus: 500 kejadian < 100 ms (hitung & render).
- Performa agregasi Overview & timer global sesuai desain (satu ticker).

### Kerapian — PASS setelah perbaikan QA

- `nuxi typecheck` exit 0; `eslint --max-warnings 0` exit 0; `prettier --check` bersih; `vitest` 1.278 lulus; build + verify-precache lulus.
- Tidak ada `.only`/`.skip`/test di-comment (satu `it.skipIf` kondisional di `assets/css/tokens.test.ts` untuk artefak build — berjalan saat `dist` ada).
- `console.log` 0 di `app/` & `server/`; hanya 4 `console.warn/error` untuk error nyata/startup.
- Dead code/placeholder: `/app/jadwal` & `/app/sticker` (MINOR-4); `Patrick Hand` masih terdaftar di `nuxt.config.ts:332` walau tidak dipakai gaya (catatan T25 B10, dampak nol).

---

## 7. Perintah & hasil (verbatim)

```bash
# 1) Suite penuh web (final, setelah perubahan QA)
cd apps/web && pnpm exec vitest run
#    Test Files  164 passed (164)
#    Tests       1278 passed (1278)
#    Duration    108.25s
#    EXIT=0

# 2) Paket pendukung AC
pnpm --filter @improve-personal/core exec vitest run      # 20 files / 369 tests passed, exit 0
pnpm --filter @improve-personal/tokens exec vitest run    # 3 files / 25 tests passed, exit 0
pnpm --filter @improve-personal/contracts exec vitest run # 8 files / 111 tests passed, exit 0

# 3) Typecheck (dua kali, termasuk setelah perubahan file bersamaan)
cd apps/web && pnpm exec nuxt typecheck                   # exit 0, tanpa output

# 4) Lint & format
cd apps/web && pnpm exec eslint . --max-warnings 0        # sebelum: exit 1 (1 error file test)
                                                          # setelah perbaikan QA: exit 0
cd <root> && pnpm exec prettier --check apps/web/app apps/web/server apps/web/nuxt.config.ts apps/web/vitest.config.ts
#    All matched files use Prettier code style!   (setelah memformat 12 file test)

# 5) Build + PWA
cd apps/web && NODE_ENV=development pnpm build
#    ✨ Build complete!
#    verify-precache OK: 147 entri precache semuanya bisa dilayani
#    EXIT=0
node scripts/verify-precache.mjs                          # OK 147
grep -c NavigationRoute .output/public/sw.js              # 0
grep -o NetworkOnly .output/public/sw.js | wc -l          # 3
grep -o 'url:"[^"]*_i18n[^"]*"' .output/public/sw.js      # url:"_i18n/6ded7f1c/id/messages.json"
grep -o 'skipWaiting\|clientsClaim\|cleanupOutdatedCaches' .output/public/sw.js | sort | uniq -c
#    1 clientsClaim / 1 cleanupOutdatedCaches / 1 skipWaiting  (autoUpdate)

# 6) Audit supply chain
pnpm audit --audit-level=high
#    12 vulnerabilities found
#    Severity: 2 low | 4 moderate | 4 high | 2 critical
#    EXIT=1

# 7) Lighthouse mobile (lab, bukan production)
lighthouse http://localhost:3798/      --only-categories=performance --output=json
#    score 0.65 · FCP 3.7s · LCP 9.0s · TBT 20ms · CLS 0.088 · total 1544 KiB
lighthouse http://localhost:3798/login --only-categories=performance --output=json
#    score 0.63 · FCP 4.7s · LCP 9.3s · TBT 40ms · CLS 0.017 · total 1336 KiB
#    (ulang dengan profil baru: hasil sama; --throttling-method=provided: score 0.98, LCP 0.1s)
```

**Probe browser (CDP, `localhost:3798`, server Nitro build, bukan production):**

- Login OTP `777777` → `/app`; dialog "Aktivasi Passkey" (non-dismissible) → virtual authenticator (PRF) → dialog "Simpan kode pemulihan" berisi `iprk1.eyJ2IjoxLCJ3b3JkcyI6…` (24 kata + envelope).
- 15 rute `/app*` (Daily, Goals, Kalender, Countdown, To-do, Eisenhower, Pomodoro, Habit, Journal, Overview, Jadwal, Panduan, Import/Export, Sticker, Akun): semuanya render, `h1` ada, **0 console error**, tidak ada hydration warning.
- To-do: buat "QA T16 task probe" lewat modal → muncul di daftar To-do (`1 aktif`) **dan** widget "To-do hari ini" Daily (`0/1 selesai`); setelah reload masih ada.
- PWA: manifest `200` + `installabilityErrors: []`; SW `activated`; cache `workbox-precache-v2` **147** entri, `app-shell` (`/app`, `/app/to-do`), `fonts`; setelah memanggil `/v1/auth/session` & `/api/health`, **0** URL API di Cache Storage.
- Offline (server dimatikan, `curl` connection refused): `/login` → judul **"Kamu sedang offline · Improve Personal"**, `h1` "Kamu sedang offline", **0 `<script>`**, bukan halaman error browser; `/app` → shell cache dimuat (hidrasi jalan) lalu redirect ke `/login`, juga bukan error browser.
- Responsif: 360/390/768/1280 px — `document.documentElement.scrollWidth === innerWidth`, sidebar desktop hilang < 600 px.

---

## 8. Sisa risiko & rekomendasi

1. **Sebelum rilis (blocking):** MAYOR-1 (dimas: lazy libsodium, split chunk, kompresi), MAYOR-2 (dimas: token kontras + test), MAYOR-3 (bayu/arif: overrides + CI audit), keputusan MAYOR-4 (produk: persistensi jurnal atau ubah DoD).
2. **Setelah blocker beres:** MINOR-1 (CORS eksplisit), MINOR-3 (test pointer DnD), MINOR-4 (rute placeholder), title `/app/akun` yang masih "Improve Personal".
3. **Ukur di staging:** Lighthouse/PSI + CrUX setelah deploy; angka lab lokal dengan simulasi tidak mewakili p75 mobile. Uji juga instalasi PWA & offline di Android Chrome dan iOS Safari nyata (ikon iOS belum ada).
4. **Uji authenticator nyata:** passkey (PRF) di perangkat fisik; virtual authenticator membuktikan alur, bukan kompatibilitas semua authenticator.
5. **Sync antar-perangkat** belum bisa diuji dari UI (belum tersambung); status "Menunggu dikirim (2)" di shell adalah outbox lokal, bukan bukti sync.
6. **Perubahan bersamaan:** selama sesi ini ada agent lain yang mengubah `packages/core/src/io/{goal-invariants,import}.ts` dan `apps/web/app/utils/guide.ts` **setelah build 10:41** (dan menambah test). Suite/typecheck/lint final dijalankan pada tree setelah perubahan itu (11:0x), tetapi probe browser/PWA & Lighthouse memakai artefak build 10:41. Perbedaan itu hanya menyentuh import/guide (tidak mengubah rute/PWA/performa), namun **build ulang + ulangi probe** disarankan sebelum tanda tangan final.

---

## 9. Berkas yang diubah QA (test-only)

Tidak ada kode produk yang diubah. Tidak ada commit, tidak ada perubahan status Ergonio.

- `apps/web/app/utils/guide.test.ts` — hapus import `GUIDE_COPY` yang tidak dipakai (memperbaiki eslint; jumlah test tetap 15).
- `apps/web/app/components/features/daily/dailyWidgets.qa.test.ts`
- `apps/web/app/components/features/deco/DecoLayer.qa.test.ts`
- `apps/web/app/components/features/deco/decoReuse.qa.test.ts`
- `apps/web/app/components/features/deco/DecoStickerItem.qa.test.ts`
- `apps/web/app/composables/dailyCalendar.qa.test.ts`
- `apps/web/app/composables/useAppearancePrefs.round2.qa.test.ts`
- `apps/web/app/composables/useBackupImport.round2.qa.test.ts`
- `apps/web/app/composables/useDeco.qa.test.ts`
- `apps/web/app/pages/app/kalender.test.ts`
- `apps/web/app/utils/calendarViews.qa.test.ts`
- `apps/web/app/utils/deco.qa.test.ts`
- `apps/web/app/utils/io/io.round2.qa.test.ts`
  → 12 file di atas hanya diformat `prettier --write`; tidak ada assertion yang diubah.

Skrip/probe QA ada di `/tmp/opencode/qa-t16/**` (tidak masuk repo): `contrast-b8.ts`, `probe*.mjs`, `*.log`, `lh-*.json`.

---

## 10. Verdict ulang (ringkas)

**GAGAL** — 3 mayor teknis + 1 mayor keputusan produk. Yang sudah terbukti sehat: seluruh AC fungsional F1–F16 kecuali kontras F16, PWA installable/offline, keamanan sesi/CSRF/CSP/secret, dan 1.278 test + typecheck + lint + build hijau. Yang menahan rilis: budget performa, kontras AA state, audit dependency High/Critical, dan persistensi jurnal vs DoD.
