# QA T16 (gate rilis, putaran final) — End-to-end web & PWA

- **Task Ergonio:** #30 `[T16] QA end-to-end semua AC di web & PWA` (project `personal-productivity`), status `review` — dijalankan **ulang sebagai gate rilis** setelah #61, #62, #63, #65, #66, #67, #69, #71 `done`.
- **Tanggal:** 2026-10-24
- **QA:** Fajar
- **Build diuji:** working tree (belum commit) di atas `765369d`; `NODE_ENV=development pnpm build` 01:33 (`.output` 8,23 MB / 2,21 MB gzip), server Nitro lokal `:3910` (`NUXT_APP_ENV=development`, `NUXT_SMTP_URL=''`, `VITEST=1`, origin `localhost`), Chrome 155 headless via CDP, Lighthouse 13.5.0 (mobile, simulasi).
- **Lingkup:** `apps/web` (Nuxt 4: halaman, server, PWA) + paket pendukung (`core`, `contracts`, `tokens`) sebagai bukti AC. **Mobile tidak diuji** (di luar lingkup T16 web).
- **Sikap putaran ini:** tidak mengulang matriks manual 15 rute (sudah terbukti di `reports/qa-t16-e2e-web.md` dan per modul di #61–#71). Fokus: **membuktikan gate rilis** — artefak build, budget performa, kontras, supply chain, DoD data, regresi suite, spot-check 5 rute inti, PWA/offline. Semua angka di bawah **diukur sendiri** pada build ini, bukan disalin dari handoff.
- **Rules dibaca:** `CLAUDE.md` root · `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md` · `apps/web/AGENTS.md` · `apps/web/CLAUDE.md` · `apps/web/.claude/rules/{security,performance,code-quality}.md` · `reports/qa-t16-e2e-web.md` · `reports/perf-t61-web.md` · `reports/perf-t66-web.md` · `reports/qa-62-contrast.md` · `reports/qa-67-primary-contrast.md` · `reports/security-t63-audit.md` · `reports/qa-65-journal-persist.md` · `reports/qa-71-journal-write.md`.

---

## Verdict

## **LULUS**

Tidak ada blocker/mayor terbuka. Keempat penahan T16 sebelumnya **terbukti tertutup pada build ini** dengan eksekusi, bukan warisan laporan:

| Penahan T16 lama | Status di build ini | Bukti |
|---|---|---|
| MAYOR-1 budget performa (chunk 183,6 KB, JS awal 169,96 KB mepet, aset tanpa kompresi, LH 0,65/0,63) | **TERTUTUP** (1 pengecualian diputuskan user) | JS awal `/` **166,82**, `/login` **169,71**, `/app` **164,35 KB** (≤170); chunk non-kripto terbesar **64,86 KB**; `.br`/`.gz` aktif (`Content-Encoding: br`); Lighthouse mobile `/` **0,90 / 0,91 / 0,90**, `/login` **0,90 / 0,88 / 0,92 / 0,95 / 0,95**; CLS **0** |
| MAYOR-2 kontras state < AA | **TERTUTUP** | 525 hitungan matriks state: **0 gagal < 4,5**, **0 gagal < 4,62**, minimum **4,624** (naik dari 3,506); 441 permukaan utama: **0 gagal**, minimum 4,506 = baseline (tidak turun) |
| MAYOR-3 audit High/Critical | **TERTUTUP** | `pnpm audit --audit-level=high` → **exit 0**, 0 critical, 1 high **ignored terdokumentasi** (`node-forge`, `first_patched_version: null`); gate CI `.github/workflows/security-audit.yml` ada & valid |
| MAYOR-4 jurnal tidak bertahan | **TERTUTUP** | Sesi nyata: judul + isi + mood bertahan setelah reload; IndexedDB **hanya ciphertext + index + outbox**; `localStorage` bersih setelah simpan |

**Exception yang TIDAK dihitung blocker (keputusan user):** chunk tunggal **185,39 KB gzip** = pustaka libsodium (Argon2id + XChaCha20). Tidak bisa ≤ 100 KB tanpa mengganti primitif kripto (format blob berubah → data lama tak terbuka); guard-nya terdokumentasi di `apps/web/app/utils/bundle-budget.test.ts` dan lulus di suite penuh. **Diterima sebagai exception rilis.**

Catatan minor yang **tidak** memblokir (rincian §6): LCP `/` 3,3–3,5 s dan `/login` 2,6–3,3 s di lab (skor lulus), headroom JS awal `/login` hanya 0,29 KB, prefetch idle naik, draf jurnal plaintext selama mengetik (GAP-65-03 pre-existing), `access-control-allow-origin: *` (MINOR-1 pre-existing), title `/app/akun`, dead code `StatTile`.

---

## 1. Tabel gate

| # | Gate | Hasil | Angka / bukti kunci |
|---|---|---|---|
| 1 | Build + artefak | **LULUS** | `pnpm build` exit 0; `Σ 8,23 MB (2,21 MB gzip)`; `verify-precache OK: 12`; `node scripts/verify-precache.mjs` → OK 12 |
| 2a | JS awal per rute (gzip) | **LULUS** | `/` **166,82 KB** (26 berkas) · `/login` **169,71 KB** (29) · `/app` **164,35 KB** (22) — semua ≤ 170 |
| 2b | Chunk tunggal | **LULUS (exception)** | terbesar **185,39 KB** = libsodium (`0QtTB3HH.js`, raw 534.176 B); non-kripto terbesar **64,86 KB** (≤100) |
| 2c | Kompresi aset | **LULUS** | `/_nuxt/0QtTB3HH.js` → `Content-Encoding: br`, `Content-Length: 151379`, `cache-control: immutable` |
| 2d | Lighthouse mobile `/` | **LULUS** | 0,90 · 0,91 · 0,90 (FCP 1,7 s; LCP 3,3–3,5 s; TBT 10 ms; CLS 0; 321–397 KiB) |
| 2e | Lighthouse mobile `/login` | **LULUS** | 0,90 · **0,88** · 0,92 · 0,95 · 0,95 (FCP 2,3–2,7 s; LCP 2,6–3,3 s; CLS 0; 360 KiB). Median **0,92**; satu run 0,88 saat 2 instance Chrome idle masih hidup (load avg 1,6–2,7), run bersih semuanya **≥ 0,90** |
| 3a | Kontras state (525) | **LULUS** | 0 gagal < 4,5 · 0 gagal < 4,62 · min **4,624** (`accent@soft`, cute-pure/hijau) |
| 3b | Kontras permukaan utama (441) | **LULUS** | 0 gagal < 4,5 · min **4,506** (`placeholder@paper`, kertas/ungu) = baseline #62/#67, **tidak ada penurunan** |
| 3c | Kontras primary | **LULUS** | hanya `ink` 7,722 & `deeper` 5,088 dipakai nyata; token lain gagal (53/189) tapi 0 pemakaian (#67) |
| 4a | `pnpm audit --audit-level=high` | **LULUS** | exit **0**; 2 low · 4 moderate · **1 high (1 ignored)** · 0 critical |
| 4b | Gate CI audit | **LULUS** | `.github/workflows/security-audit.yml` ada; YAML valid; trigger PR/push/schedule/dispatch; `permissions: contents: read`; action dipin SHA; menjalankan `pnpm run audit:security` |
| 4c | Secret di artefak publik | **LULUS** | 10 nilai `.env` (≥10 char) dipindai ke **423 berkas** `.output/public` → **0 hit** (satu-satunya "hit" = nilai `NUXT_APP_ENV=development` yang memang `runtimeConfig.public.appEnv`) |
| 4d | Cookie sesi | **LULUS** | `ip_session=…; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax`; `Secure` aktif kecuali `APP_ENV=development` (`server/utils/session-cookie.ts:46`, ditegaskan `server/tests/http.test.ts:328`) |
| 4e | CSRF | **LULUS** | `POST /v1/sync/push` + cookie, **tanpa Origin** → **403**; `Origin: https://evil.example` → **403**; origin sah → lolos guard (400 validasi body) |
| 5a | Jurnal + mood bertahan | **LULUS** | Setelah reload: `textarea` = isi jurnal, `input.title-input` = judul, `.mood[aria-pressed=true]` = indeks 4 (Bahagia) |
| 5b | IndexedDB hanya ciphertext + outbox | **LULUS** | `record` 5 baris (kunci: id/hlc/deleted/**blob**/timestamp), `record_index` 5, `sync_outbox` **6 baris `op:"put"`**, `sync_state` 1; pemindaian plaintext judul/isi/mood di **semua** store = **0 hit**; blob di-base64-decode bukan JSON/teks (printable ratio 0,37) |
| 5c | Draf tidak plaintext setelah simpan | **LULUS** | Saat mengetik: `ip-memo-draft-<tgl>` ada (memuat teks — GAP-65-03 pre-existing); setelah simpan: **draf `[]`**, `localStorage` hanya `ip-style`/`ip-theme`/`ip-appearance-owner` |
| 6a | Vitest web (penuh) | **LULUS** | **182 file / 1.405 test** lulus, exit 0 (82,06 s) |
| 6b | Vitest core / tokens / contracts | **LULUS** | core **20 file/371**, tokens **3/33**, contracts **8/111**, exit 0 |
| 6c | `nuxt typecheck` | **LULUS** | exit 0, tanpa output |
| 6d | `eslint . --max-warnings 0` | **LULUS** | exit 0 |
| 6e | `prettier --check` | **LULUS** | "All matched files use Prettier code style!", exit 0 |
| 7a | 5 rute inti render | **LULUS** | `/app` h1 "Selamat pagi, Friend" · `/app/kalender` "Kalender" · `/app/memo` "Journal" · `/app/goals` "Goals" · `/app/to-do` "To-do"; **0 console error**, **0 hydration warning**, `#__nuxt` terisi di semua |
| 7b | Buat task + reload | **LULUS** | Task dibuat di To-do → tampil → **masih tampil setelah reload** |
| 7c | Quick add dari Daily (F12) | **LULUS** | Task dari widget "To-do hari ini" → tampil, **bertahan setelah reload**, dan muncul di `/app/to-do` |
| 7d | Simpan jurnal + reload | **LULUS** | lihat 5a/5b/5c (dua akun berbeda, dua run independen) |
| 8a | Manifest & installability | **LULUS** | `manifest.webmanifest` **200** (432 B), `Page.getAppManifest.errors: []`, `getInstallabilityErrors: []` |
| 8b | Service worker | **LULUS** | `activated`, scope `/`, script `/sw.js`; cache: `workbox-precache-v2` 11 kunci, `nuxt-assets` 100, `app-shell` 5, `fonts` 2 |
| 8c | 0 URL API di Cache Storage | **LULUS** | `apiHits: []` setelah memanggil `/v1/auth/session` |
| 8d | Offline nyata (server dimatikan) | **LULUS** | `/login` → halaman "Kamu sedang offline · Improve Personal", `h1` "Kamu sedang offline", **0 `<script>`**, bukan error browser; `/app` → app shell dari cache lalu guard mengarahkan ke `/login?redirect=/app` (200 SPA, bukan `ERR_CONNECTION`) |

---

## 2. Perintah & hasil (verbatim)

```bash
# 1) Build + artefak
cd apps/web && NODE_ENV=development pnpm build
#   └  ✨ Build complete!
#   verify-precache OK: 12 entri precache semuanya bisa dilayani
#   Σ Total size: 8.23 MB (2.21 MB gzip)
#   BUILD_EXIT=0
node scripts/verify-precache.mjs
#   verify-precache OK: 12 entri precache semuanya bisa dilayani
#   PRECACHE_EXIT=0

# 2) Ukur JS awal (skrip QA /tmp/opencode/qa-t16-final/measure.mjs, gzip level 9 dihitung sendiri)
node measure.mjs root,login,app
#   chunks JS: 110
#   top 5 (gzip KB): 185.39 0QtTB3HH.js | 64.86 C56FzpXD.js | 30.40 1rbVAHfL.js | 27.96 zESyMbUY.js | 16.58 CrwF6sk_.js
#   /:       deklaratif 166.82 KB gzip (26 modulepreload + 1 script) raw 465.20 KB
#   /login:  deklaratif 169.71 KB gzip (29 + 1) raw 471.19 KB
#   /app:    deklaratif 164.35 KB gzip (22 + 1) raw 460.02 KB
#   prefetch (hint idle): / 110.55 · /login 128.44 · /app 106.08 KB — chunk libsodium TIDAK ikut

# 3) Kompresi aset statis
curl -sI -H 'Accept-Encoding: br, gzip' http://127.0.0.1:3910/_nuxt/0QtTB3HH.js
#   cache-control: public, max-age=31536000, immutable
#   Content-Encoding: br
#   Content-Length: 151379

# 4) Lighthouse mobile (server lokal, build lokal)
npx lighthouse http://localhost:3910/      --only-categories=performance --output=json
#   run1 score 0.90 · FCP 1.7s · LCP 3.5s · TBT 10ms · CLS 0 · 321 KiB
#   run2 score 0.91 · FCP 1.7s · LCP 3.3s · TBT 10ms · CLS 0 · 397 KiB
#   run3 score 0.90 · FCP 1.7s · LCP 3.5s · TBT 10ms · CLS 0 · 321 KiB
npx lighthouse http://localhost:3910/login --only-categories=performance --output=json
#   run1 score 0.90 · FCP 2.7s · LCP 3.0s · TBT 10ms · CLS 0 · 360 KiB
#   run2 score 0.88 · FCP 2.7s · LCP 3.3s · TBT 50ms · CLS 0
#   run3 score 0.92 · FCP 2.6s · LCP 2.9s · TBT 10ms · CLS 0
#   run4 score 0.95 · FCP 2.3s · LCP 2.6s · TBT 10ms · CLS 0
#   run5 score 0.95 · FCP 2.3s · LCP 2.6s · TBT 10ms · CLS 0

# 5) Kontras (skrip sendiri /tmp/opencode/qa-t16-final/contrast.mjs, rumus WCAG 2.1 ditulis ulang)
node contrast.mjs
#   === STATE (25 pasangan x 21 = 525) ===
#     accent@soft     min 4.624 (cute-pure/hijau)   0 gagal <4.5   0 gagal <4.62
#     ink-2@dash      min 4.627 (kertas/hijau)      0 / 0
#     mute-3@soft     min 4.636 (tegas/ungu)        0 / 0
#     ...
#   -> total 525, gagal <4.5 = 0, gagal <4.62 = 0, MINIMUM 4.624
#   === PERMUKAAN UTAMA (21 x 21 = 441) ===
#     placeholder@paper min 4.506 (kertas/ungu)     0 gagal <4.5
#     ...
#   -> total 441, gagal <4.5 = 0, MINIMUM 4.506  (identik baseline #62/#67 -> tidak turun)
#   === PRIMARY (9 x 21 = 189) ===
#     ink@primary 7.722 · deeper@primary 5.088 (dipakai)  | 53/189 <4.5 untuk token yang TIDAK dipakai

# 6) Supply chain
pnpm audit --audit-level=high ; echo $?
#   7 vulnerabilities found
#   Severity: 2 low | 4 moderate | 1 high (1 ignored)
#   0
pnpm audit --json | jq '.metadata.vulnerabilities'
#   {"info":0,"low":2,"moderate":4,"high":1,"critical":0}
#   high = GHSA-86w9-cpqp-85rv (node-forge, ignoreGhsas di pnpm-workspace.yaml:35-37, first_patched_version: null)

# 7) Regresi suite
pnpm --filter @improve-personal/web exec vitest run
#   Test Files  182 passed (182)
#   Tests       1405 passed (1405)      Duration 82.06s   VITEST_WEB_EXIT=0
pnpm --filter @improve-personal/core exec vitest run        # 20 files / 371 tests, exit 0
pnpm --filter @improve-personal/tokens exec vitest run      # 3 files / 33 tests, exit 0
pnpm --filter @improve-personal/contracts exec vitest run   # 8 files / 111 tests, exit 0

cd apps/web
pnpm exec nuxt typecheck                                    # exit 0
pnpm exec eslint . --max-warnings 0                         # exit 0
cd ../..
pnpm exec prettier --check apps/web/app apps/web/server apps/web/nuxt.config.ts \
  apps/web/vitest.config.ts apps/web/i18n apps/web/tests \
  packages/tokens/src packages/core/src packages/contracts/src
#   All matched files use Prettier code style!   exit 0
```

**Probe browser (CDP, Chrome 155 headless, `localhost:3910`, server build lokal — bukan production), 2 run (akun berbeda):**

- Login: email → OTP `777777` → 6 kotak terisi → `/app` + dialog onboarding "Privasimu Sepenuhnya Dijaga" (tanpa tombol tutup; hanya "Aktifkan Passkey" / "Simpan Kode Pemulihan" / "Keluar") → virtual authenticator (PRP, PRF) → **"Passkey sudah diatur"** di `/app/akun`, `key_material` = 2 baris → langkah "Simpan kode pemulihan" (boleh dilewati, by design).
- Kode pemulihan: tombol **"Buat kode pemulihan"** di `/app/akun` → teks `iprk1.*` muncul di halaman (`recoveryInBody: true`).
- 5 rute inti: judul tab + `h1` benar, `#__nuxt` terisi, **0 console error**, **0 hydration warning** (semua pesan `Runtime.consoleAPICalled` tipe warning/error diperiksa).
- Task: quick add To-do → tampil → reload → **masih ada**. Quick add Daily → tampil → reload → **masih ada** → **muncul juga di To-do**.
- Jurnal: tulis judul + isi + klik mood "Bahagia" → "Simpan ke jurnal" → tanpa banner error → `draf: []` → reload → teks, judul, mood kembali.
- Penyimpanan (setelah simpan): `localStorage` = `ip-style`, `ip-theme`, `ip-appearance-owner` (0 hit plaintext); DB `ip-<uid>`: `record` 5 (blob ciphertext), `record_index` 5, `sync_outbox` 6 × `put`, `sync_state` 1; DB `ip-keys-<uid>`: `key_material` 2, `recovery_guard` 0; **0 plaintext hit** untuk judul/isi/mood.
- PWA: manifest 200, `sw.js` `activated`, cache `workbox-precache-v2` (11) + `nuxt-assets` (100) + `app-shell` (5) + `fonts` (2), **0 URL `/v1`/`/api`**.
- Offline (server **dimatikan**, `curl` → 000): `/login` = halaman offline (judul "Kamu sedang offline · Improve Personal", **0 `<script>`**); `/app` = shell cache → `/login?redirect=/app`; keduanya bukan halaman error browser.

---

## 3. DoD data — bukti mentah

```
PROBE (akun A, 127.0.0.1)                     PROBE (akun B, localhost)
journal.afterReload.area  = "Isi jurnal …"    journal.afterReload.area  = "Isi jurnal …"
journal.afterReload.title = "Rahasia judul …" journal.afterReload.title = "Rahasia judul …"
moodPressed               = [null,false,false,false,true,false]   (indeks 4 = Bahagia, persist)
draftKeys setelah simpan  = []                draftKeys setelah simpan  = []
record/record_index/outbox plaintextHits     = []  []  []
blobSample = { length: 292, decodedHead: "ð\u0016kÑ", looksLikeJson: false, printableRatio: 0.37 }
sync_outbox ops = ["put","put","put","put","put","put"]
```

Kolom `record` hanya memuat `id, hlc, deleted, blob, createdAtMs, updatedAtMs` — judul, isi, tag perasaan, dan enum mood hanya ada di dalam blob. Outbox berisi 6 operasi `put` (belum tersinkron — sync engine memang belum tersambung, lihat §6).

---

## 4. Keamanan — hasil pemeriksaan

| Pemeriksaan | Hasil |
|---|---|
| Secret di `.output/public` (10 nilai `.env` × 423 berkas) | **0 hit** (hanya `development` = `runtimeConfig.public.appEnv`, bukan secret) |
| Header `/login` | CSP `nonce-…` + `'strict-dynamic'`, `script-src-attr 'none'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `worker-src 'self'`, **tanpa `'unsafe-eval'`** (hanya `'wasm-unsafe-eval'` untuk libsodium); HSTS `max-age=15552000`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal |
| Cookie sesi | `HttpOnly` + `SameSite=Lax` + `Path=/` + `Max-Age` 30 hari; `Secure` mati **hanya** karena `APP_ENV=development` (`server/utils/session-cookie.ts:46`), ditegaskan test `server/tests/http.test.ts:328` |
| CSRF | tanpa Origin → **403**; Origin asing → **403** (`server/middleware/10-csrf.ts`) |
| Token di JS-readable storage | `localStorage` hanya preferensi tampilan + draf memo; `document.cookie` tidak memuat sesi (HttpOnly) |
| XSS | `v-html`/`innerHTML` = 0 (hanya komentar penjelas di `ui/QrCode/index.vue:9-10`) |
| `console.log` produk | 0 di `app/` dan `server/` |
| Artefak server | `.output/server/node_modules` tidak memuat `node-forge`/`listhen` |

---

## 5. Cek tiga pilar

**Keamanan — PASS.** Semua checklist `apps/web/.claude/rules/security.md` yang relevan terverifikasi pada build ini: tidak ada secret di bundle, cookie HttpOnly/SameSite, CSRF menolak, CSP nonce tanpa `unsafe-eval`, input jurnal tersimpan sebagai ciphertext, error ke user generik (banner "belum tersimpan" memakai copy i18n, bukan pesan storage), dan `pnpm audit` High/Critical bersih (1 high di-ignore dengan alasan tertulis + mitigasi).

**Performa — PASS dengan catatan.** Budget artefak terpenuhi: JS awal 166,82 / 169,71 / 164,35 KB (≤170), chunk non-kripto ≤ 64,86 KB (≤100), aset terkompresi `br`, precache 12 entri / 91 KB (bukan 1,8 MB), Lighthouse ≥ 0,90 (satu outlier 0,88 saat mesin berbeban), CLS 0. Yang masih di atas budget: **LCP lab 3,3–3,5 s (`/`) dan 2,6–3,3 s (`/login`)** vs 2,5 s — angka lab simulasi (bukan CrUX), skor tetap lulus; dicatat sebagai risiko §6. Chunk libsodium 185,39 KB = exception yang sudah diputuskan user.

**Kerapian — PASS.** `typecheck`, `eslint --max-warnings 0`, `prettier --check` exit 0; 1.405 test web + 371 core + 33 tokens + 111 contracts hijau; tidak ada `.only`/`.skip` (grep hanya menemukan `pomodoro.skip()` dan `IDBKeyRange.only`, bukan modifier test), tidak ada `console.log`, tidak ada test yang dilonggarkan. Sisa dead code `StatTile`/`Card variant="primary"` (P3, sudah tercatat #62/#67) bukan blocker.

---

## 6. Sisa risiko (tidak memblokir rilis)

1. **LCP lab di atas budget.** `/` 3,3–3,5 s dan `/login` 2,6–3,3 s (budget 2,5 s) pada simulasi mobile Lighthouse; skor lulus (0,90–0,95). Penyebab struktural: app adalah satu shell SPA yang menjalankan entry + Vue + skema kontrak; `/` memuat hero + font. Angka ini **lab lokal**, bukan CrUX/p75 — wajib diukur ulang di staging setelah deploy sebelum menyatakan CWV produksi aman.
2. **Headroom JS awal `/login` hanya 0,29 KB** (169,71 dari 170). Satu import kecil yang masuk graf awal akan melewati budget; `bundle-budget.test.ts` akan menangkapnya, tapi jangan menambah dependency ke jalur login tanpa mengukur.
3. **Chunk libsodium 185,39 KB** — exception resmi (keputusan user). Perubahan primitif kripto (`@noble/*` / libsodium `.wasm` eksternal) butuh review `arif` + uji byte-identik, bukan tweak bundle.
4. **Prefetch idle naik** dibanding T66 (`/` 45,69 → 110,55 KB; `/login` 63,58 → 128,44 KB). Ini hint prioritas rendah (tidak lagi `modulepreload`, tidak bersaing dengan render; `total-byte-weight` Lighthouse stabil 321–397 KiB), tapi menambah byte kunjungan pertama di jaringan lambat.
5. **Draf jurnal plaintext selama mengetik** (`ip-memo-draft-*`, GAP-65-03 / B-54.1) — sudah dilaporkan di #65, belum diputuskan produk (enkripsi draf dengan `dataKey` atau TTL). Setelah simpan draf terhapus (terbukti).
6. **Kegagalan tulis/hapus yang senyap** (RISK-71-09/12): gagal hapus dan gagal tulis mood belum punya UI; `memos.error` belum dirender. Tidak ada data hilang pada jalur normal.
7. **Dua tab** (RISK-71-04/05): dua tab membuat tanggal baru bersamaan bisa menghasilkan 2 record untuk satu tanggal; hapus di tab A bisa dihidupkan simpan basi di tab B. Butuh keunikan `entry_date` di `packages/core`.
8. **Sync antar-perangkat belum tersambung** (outbox hanya lokal, 6 operasi menunggu). DoD "tersinkron antar perangkat" belum bisa dibuktikan dari UI — kondisi yang sama dengan T16 dan diakui PRD (T21).
9. **Flake ticker** (`app/plugins/ticker.client.ts` menulis `useNow` tiap detik) membuat `kalender.test.ts`/`memo.qa.test.ts` sesekali gagal di bawah beban. Run penuh kali ini **0 flake** (182/182 hijau), tapi akarnya belum dibereskan (matikan ticker di test).
10. **`access-control-allow-origin: *`** di semua respons (MINOR-1 T16) — tanpa `credentials`, jadi bukan IDOR; tetap menyimpang dari aturan allowlist eksplisit.
11. **`/app/akun` tidak punya judul tab spesifik** (tetap "Improve Personal") — minor kosmetik, pre-existing.
12. **Kontras laten:** `placeholder@paper` 4,506 (margin 0,006 di atas AA, baseline T25); `--dash` bukan permukaan teks (0 pemakaian); teks di atas warna kategori solid 2,03–4,45 (dekoratif, `aria-hidden`, teks label membawa makna).
13. **WebAuthn tidak bisa diuji di origin IP.** Pada `http://127.0.0.1:3910` aktivasi passkey gagal dengan `Gagal: This is an invalid domain.` — aturan platform (IP bukan RP ID yang valid), **bukan bug app**; di `http://localhost:3910` passkey aktif normal. Uji rilis harus memakai `localhost`/domain nyata. Authenticator fisik (Face ID/iCloud/Google) tetap tidak diuji; yang diuji virtual authenticator (PRF).
14. **Data lapangan belum ada** (belum deploy): semua angka performa adalah lab lokal; ukur ulang dengan PSI/CrUX di staging.

---

## 7. Yang TIDAK diuji ulang (dan alasannya)

- **Matriks manual 15 rute** — sudah dibuktikan di `reports/qa-t16-e2e-web.md` dan per modul (#61–#71); putaran ini hanya spot-check 5 rute inti + bukti regresi suite penuh. Tidak ada perubahan rute sejak laporan itu (diff putaran ini hanya perbaikan perf/kontras/jurnal/audit).
- **Google SSO end-to-end** — butuh kredensial & consent Google; kontrak + test server lulus (`google-oauth` 6 test).
- **Sync antar-perangkat** — engine belum tersambung (bukan regresi; lihat §6.8).
- **iOS PWA / perangkat fisik** — di luar lingkup web; ikon `apple-touch-icon` masih catatan risiko di `nuxt.config.ts`.
- **Mobile React Native** — di luar T16 web.
- **Uji ke production / data user nyata** — tidak dilakukan (aturan QA).

---

## 8. Berkas yang diubah QA

**Tidak ada.** Tidak ada kode produk, test, atau config yang diubah; tidak ada commit; tidak ada perubahan status/komentar Ergonio dari sesi ini (orkestrator yang memindahkan status & memposting komentar).

Skrip & artefak QA di `/tmp/opencode/qa-t16-final/` (tidak masuk repo): `measure.mjs`, `contrast.mjs`, `secret-scan.mjs`, `probe.mjs`, `offline.mjs`, `installability.mjs`, `akun-check.mjs`, `build.log`, `vitest-*.log`, `lh-*.json`, `probe*.json`.

---

## 9. Ringkasan satu paragraf untuk komentar task

**LULUS.** Gate rilis T16 terpenuhi di build `NODE_ENV=development pnpm build` (verify-precache OK 12): JS awal 166,82 (`/`) / 169,71 (`/login`) / 164,35 KB (`/app`) ≤170, chunk libsodium 185,39 KB = exception yang diputuskan user, aset `br`, Lighthouse mobile 0,90–0,91 (`/`) dan median 0,92 (`/login`, 5 run), kontras 525 state **0 gagal** (min 4,624) + 441 permukaan **0 gagal** (min 4,506, tidak turun), `pnpm audit` exit 0 (1 high ignored `node-forge`, gate CI ada & valid), tanpa secret di artefak, cookie HttpOnly/SameSite, CSRF 403, jurnal+mood bertahan setelah reload dengan IndexedDB hanya ciphertext+outbox dan draf bersih setelah simpan, suite web 182/1.405 + core 371 + tokens 33 + contracts 111 + typecheck/eslint/prettier hijau, 5 rute inti 0 console error/0 hydration warning, task & jurnal bertahan setelah reload, PWA installable + SW aktif + 0 URL API di cache + offline nyata. Sisa risiko (LCP lab 2,6–3,5 s, headroom `/login` 0,29 KB, draf plaintext saat mengetik, gagal hapus/mood tanpa UI, dua tab, sync belum tersambung) tercatat di `reports/qa-t16-web-final.md` §6 — tidak memblokir.
