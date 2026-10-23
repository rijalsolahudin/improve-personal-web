# QA Report — T25: Tampilan (tema warna + 7 gaya sebagai design token)

> **Status terkini (putaran 2, 2026-10-23): LULUS dengan catatan.** B1–B5 yang memblokir putaran 1 sudah diperbaiki & diverifikasi ulang secara independen. Sisa catatan (B6, B8) tidak memblokir task ini — lihat §10. Verdict **GAGAL** di bawah adalah hasil putaran 1 (historis, jangan dihapus).

**Task:** Ergonio `PERS2-39` · **Tanggal:** 2026-10-23 · **Reviewer:** Fajar (QA)
**Build diuji:** working tree `f8a9a5c` + perubahan yang belum di-commit (theme/token sudah ada di commit `722e24d`, `app.vue` terakhir diubah 16 Okt) · **Browser:** Chrome headless via CDP terhadap hasil build `.output` (dijalankan lokal, bukan environment produksi)
**Lingkup:** `apps/web` (Nuxt 4) + `packages/tokens` (+ `packages/core` hanya untuk kontrak `user_prefs`)

**Rules dibaca:** `CLAUDE.md` root, `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`, `docs/PRD.md` F16 + tabel T25, `apps/web/ARCHITECTURE.md` §4–§6.

---

## Verdict

## **GAGAL**

Tema & gaya **ada sebagai token** dan **berfungsi langsung** (tanpa reload, font gaya benar-benar lazy-load, default Cute + Kuning, nilai asing jatuh ke default). Tapi **3 acceptance criteria tidak terpenuhi**:

1. **AC3 (simpan per akun & sync antar perangkat) gagal** — preferensi hanya ditulis ke `localStorage` (`ip-theme`/`ip-style`). Record `user_prefs` yang sudah disiapkan di `packages/core` **tidak pernah ditulis/dibaca**, jadi tidak ada yang masuk outbox sync; key-nya juga global sehingga preferensi satu akun terbawa ke akun lain di browser yang sama.
2. **AC8 (kontras AA semua kombinasi gaya × tema) gagal** — **220 dari 273 pasangan teks** di bawah 4.5:1 (21 kombinasi). Contoh: tautan `#EE6A1F` di atas putih = **3.13:1** (Cute Pure/Tegas + Kuning), caption `--mute-3` = **2.37–4.00:1** di semua gaya, placeholder = **1.84–2.34:1**, teks pada tombol tema terpilih (`--paper` di `--accent`) = **3.13:1**.
3. **AC6 (terpasang sebelum render pertama / tanpa kedip) gagal sebagian** — `/` yang di-prerender mengirim `<html data-theme="kuning" data-style="cute">`, dan `/app` + `/login` tidak punya atribut sama sekali; sebelum modul JS jalan, browser sudah melukis `:root` (Kuning/Cute). Restore hanya terjadi di plugin client.

Tambahan yang perlu diperbaiki sebelum `done`: **kontrak gaya `cute-pure` (tokens) ≠ `cute_pure` (core)** — Cute Pure akan berubah jadi Cute kalau lewat `user_prefs` (sync/import), dan gaya **Kertas mengabaikan pilihan tema** (semua token ditimpa monokrom).

| Ringkasan test | Hasil |
|---|---|
| Test QA baru (8 file, 55 test) | **47 lulus / 8 gagal** (8 gagal = reproduksi B2 & B3, sengaja) |
| `packages/tokens` — `npx vitest run` (termasuk 7 test lama `css.test.ts`) | 3 file · **19 lulus / 6 gagal** (semua di `contrast.qa.test.ts`) |
| `packages/core` — `npx vitest run src/domain/entities/user-prefs.qa.test.ts` | **9 lulus / 0 gagal** |
| `apps/web` — 5 file QA baru | **26 lulus / 2 gagal** (2 = B2 kosakata gaya) |
| Regresi area terdampak (`useAppearance`, `shell`, `layouts`, `login`) | **8 lulus / 2 gagal** — 2 gagal **bukan T25**: pekerjaan T22 yang belum selesai (`dashboard.qa.test.ts` indikator sync, `login.qa.test.ts` alur lupa OTP) |
| `npx eslint` (8 file test baru) | bersih (`--max-warnings 0`, exit 0) |
| `npx tsc` tokens & core | exit 0 |
| `npx nuxt typecheck` (web) | exit **2** — 6 error, **semua di file test task lain** (`DecoLayer.qa`, `dailyCalendar.qa`, `useDailyRoutine.qa`, `useDeco.qa`); tidak ada error di file T25 |
| Probe browser (CDP, build `.output`) | default/21 kombinasi/font lazy-load/persistensi/kedip — lihat §4 |

---

## 1. Scope & test plan

### Yang diuji

| Level | File baru | Fokus |
|---|---|---|
| Unit token | `packages/tokens/src/appearance.qa.test.ts` (11 test) | 3 tema & 7 gaya, default, kelengkapan token per tema, font tiap gaya terdaftar untuk lazy-load, blok CSS `[data-theme]`/`[data-style]`, selector gabungan gaya×tema, dekorasi hanya Cute/Cute Pure, **token layout tidak ikut berubah** (proxy "tanpa layout shift") |
| Unit kontras | `packages/tokens/src/contrast.qa.test.ts` (7 test) | Rasio kontras WCAG AA 4.5:1 untuk teks yang benar-benar dipakai (ink/ink-2/mute/mute-2/mute-3/accent/paper-on-accent/placeholder/chip prioritas/status) di 21 kombinasi |
| Unit domain | `packages/core/src/domain/entities/user-prefs.qa.test.ts` (9 test) | `normalizeUserPrefs` (nilai asing → default tanpa error, payload rusak, field tambahan), schema ketat, default Cute+Kuning, `normalizeUserPrefsFrom` |
| Store web | `apps/web/app/stores/appearance.qa.test.ts` (10 test) | Default, semua 3+7 nilai, independensi tema/gaya, persist setelah "restart" (store baru), 14 nilai asing, storage diblokir baca/tulis, restore idempoten |
| Binding `<html>` | `apps/web/app/app.qa.test.ts` (4 test) | `data-theme`/`data-style` dari app.vue: default, berubah langsung tanpa remount, pilihan tersimpan dipakai saat render pertama, nilai asing tetap default |
| Komponen | `apps/web/app/components/features/appearance/AppearanceMenu.qa.test.ts` (7 test) | Menu buka/tutup (klik & Escape), 3 tema + swatch, 7 gaya + preview font, pilih langsung mengubah store/ringkasan tanpa menutup menu, `aria-expanded`/`aria-controls`/`aria-pressed` |
| Kontrak lintas paket | `apps/web/app/theme-vocabulary.qa.test.ts` (3 test) | Daftar tema/gaya `tokens` ↔ `core` identik; setiap gaya UI selamat lewat `normalizeUserPrefs` |
| Konfigurasi pemuatan | `apps/web/app/theme-loading.qa.test.ts` (4 test) | Font gaya `preload: false` & font default tidak ikut dimatikan preload-nya (dari `loadNuxtConfig`), rule SW `/_fonts/*.woff2` = `CacheFirst` (offline), token CSS global, route `/app` `ssr:false` & `/` prerender |

### Yang **tidak** diuji (dan alasannya)

- **Matriks visual 7 gaya × 3 tema di seluruh halaman app**: halaman `/app/**` butuh login + pembukaan kunci E2EE; repo tidak punya harness E2E (tidak ada Playwright). Browser dipakai terbatas pada landing hasil build (lihat §4). Ini celah yang harus ditutup T16.
- **Sinkronisasi sungguhan 2 perangkat**: jalur tulis `user_prefs` tidak ada (§3 B1), jadi tidak ada yang bisa diuji — bukan test yang di-skip, memang tidak ada kode.
- **Preview sebelum disimpan**: implementasi memilih = langsung menerapkan (tidak ada tombol simpan), jadi "preview" dan "terapkan" adalah hal yang sama.
- **Dark mode**: tidak ada di PRD F16 saat ini.
- **Halaman login/onboarding "menampilkan pilihan"**: teks PRD ambigu; tidak dijadikan kriteria gagal.

---

## 2. Hasil per acceptance criteria

| # | Acceptance criteria | Hasil | Bukti |
|---|---|---|---|
| **AC1** | 3 tema (Kuning/Hijau/Ungu) + 7 gaya (Cute default, Cute Pure, Kertas, Simple, Elegan, Vintage, Tegas) sebagai design token | **PASS** (dengan catatan B2/B5) | `appearance.qa.test.ts` — daftar persis, tiap tema punya 24 token yang sama, tiap gaya punya font/bobot/radius/border/bayangan/pola/dekorasi. CSS hasil `toCssVariables()` punya blok `[data-theme='hijau'|'ungu']` dan `[data-style='…']` untuk 6 gaya non-default, `:root` memuat Kuning + Cute. Kode: `packages/tokens/src/colors.ts:97-166`, `styles.ts:9-17`, `css.ts:118-147` |
| **AC2** | Ganti gaya/tema langsung tanpa reload & tanpa layout shift | **PASS** (catatan B6) | `app.qa.test.ts` — "ganti tema & gaya berlaku langsung tanpa reload / tanpa mount ulang": atribut `<html>` berubah dan **elemen root tetap objek yang sama**. `AppearanceMenu.qa.test.ts` — pilih tema/gaya → store + ringkasan berubah, panel tetap terbuka. CDP: ganti `data-style` mengubah `font-family`/`background` terhitung tanpa navigasi. Layout: token spasi/`fs`/`lh`/`grid` **tidak** ditimpa blok gaya (`appearance.qa.test.ts`), tapi tinggi teks berubah karena metrik font (B6) |
| **AC3** | Pilihan bertahan setelah restart **dan tersinkron antar perangkat** | **FAIL** | **Restart PASS:** `appearance.qa.test.ts` — "pilihan bertahan setelah restart (store baru membaca storage)"; CDP: `localStorage` ungu/elegan → reload → `data-theme=ungu data-style=elegan`, font Jost. **Sync FAIL (B1):** tidak ada tulisan/bacaan `user_prefs`; `grep -rn "userPrefs" apps/web/app` hanya menemukan definisi repository (`utils/storage/repository.ts:154`). Store hanya `localStorage` (`stores/appearance.ts:49,54,63-64`). Key tidak per-user → preferensi terbawa antar akun di browser yang sama |
| **AC4** | Default Cute + Kuning | **PASS** | `appearance.qa.test.ts` — default + konstanta `DEFAULT_THEME`/`DEFAULT_STYLE`; `app.qa.test.ts` — `<html>` default `kuning`/`cute`; CDP: `DEFAULT theme=kuning style=cute bg=rgb(246, 235, 218) font=Nunito` |
| **AC5** | Nilai tak dikenal → default tanpa error | **PASS** | `appearance.qa.test.ts` — 14 nilai asing (`''`, `' '`, `'merah'`, `'KUNING'`, `' ungu'`, `'cute pure'`, `'cute_pure'`, `'CUTE'`, `<script>`, `'null'`, `'undefined'`, `'__proto__'`, `'constructor'`, JSON) → Kuning/Cute tanpa melempar; nilai valid + pasangan asing tetap dipakai. `user-prefs.qa.test.ts` — `normalizeUserPrefs` untuk payload rusak/bukan objek. **Catatan:** `'cute-pure'` (gaya resmi UI) justru jatuh ke `cute` saat lewat core — itu B2, bukan AC5 |
| **AC6** | Gaya terpasang sebelum render pertama (tanpa kedip) | **FAIL** (B4) | `/` (prerender) mengirim `<html lang="id" data-theme="kuning" data-style="cute">` dan **tidak ada skrip early-restore** (`grep -c "ip-theme" dist/index.html` = 0). `/app` & `/login` (`ssr:false`) mengirim `<html lang="id">` **tanpa atribut**. CDP dengan JS dimatikan + `localStorage` ungu/elegan → yang dilukis tetap `theme=kuning, style=cute, bg=rgb(246,235,218)`. Restore hanya di `plugins/theme.client.ts` (setelah JS jalan) |
| **AC7** | Font gaya di-lazy-load & offline | **PASS** | `theme-loading.qa.test.ts` — 10 font gaya `preload:false`, 3 font default tidak di-set `preload:false` (di HTML build tidak ada `<link rel="preload" as="font">`, jadi font diunduh saat dipakai); rule SW `/_fonts/*.woff2` = `CacheFirst`, `cacheName: 'fonts'`, maxAge 1 tahun; `dist/sw.js` memuat pola `_fonts`. CDP: load pertama **3 permintaan font**; pindah ke Elegan menambah **2 permintaan** (Jost 400/500) dan `document.fonts.check('16px "Jost"') === true` |
| **AC8** | Kontras AA di semua kombinasi gaya × tema | **FAIL** (B3) | `contrast.qa.test.ts` — **6 dari 7 kelompok gagal**, **220/273 pasangan < 4.5:1**. Rincian & angka di §3 B3 |
| **AC9** | Semua halaman web tampil benar di tiap gaya (minimal halaman utama) | **TIDAK TERVERIFIKASI PENUH** | Landing hasil build: 21 kombinasi menghasilkan nilai token terhitung yang benar (bg/font berubah; 6 font body berbeda). Tidak ada `font-family` literal di komponen (`grep` = 0), jadi tipografi mengikuti gaya. Halaman `/app/**` tidak bisa dibuka tanpa login/unlock; 178 warna hex literal masih ada di komponen (terbanyak `overview.vue` 21, `GoalChip.vue` 14 — area task lain), jadi sebagian permukaan tidak ikut berganti palet. Butuh E2E T16 untuk verdict penuh |

---

## 3. Bug

### B1 — Preferensi tampilan tidak disimpan per akun & tidak ikut sync — **High (blocking AC3)**

**Reproduksi minimal**
1. Browser A, login akun X → menu Tampilan → pilih **Ungu + Elegan**.
2. Buka browser/perangkat B, login akun **X** yang sama → tema tetap **Kuning + Cute**.
3. DevTools → Application → IndexedDB: tidak ada record `user_prefs`; yang berubah hanya `localStorage.ip-theme` / `ip-style`.
4. Logout, login akun **Y** di browser A → tema **Ungu + Elegan** milik X ikut terbawa.

**Expected (PRD F16 / AC T25):** pilihan "tersimpan per akun dan ikut sync ke semua perangkat (terenkripsi seperti data lain)".
**Actual:** hanya `localStorage` global, tidak per akun, tidak masuk outbox sync.

**Bukti kode**
- `apps/web/app/stores/appearance.ts:35-42` (`persist` → `localStorage`), `:49,54` (setTheme/setStyle), `:63-64` (restore) — tidak ada jalur repository.
- `apps/web/app/utils/storage/repository.ts:154` mendefinisikan `userPrefs: createRepository(deps, 'user_prefs')`, tapi **tidak ada satu pun pemakai** (`grep -rn "userPrefs" apps/web/app` → hanya baris itu).
- `packages/core/src/domain/entities/user-prefs.ts` + `envelope.ts:32` sudah menyiapkan entity untuk sync — tidak terpakai.
- `apps/web/ARCHITECTURE.md:60` mewajibkan tulis lewat use case core (bukan store langsung).

**Severity:** High — AC eksplisit tidak terpenuhi; preferensi bocor antar akun di satu browser.

---

### B2 — Kosakata gaya berbeda: `cute-pure` (tokens/CSS) vs `cute_pure` (core/`user_prefs`) — **High (blocking sync/import Cute Pure)**

**Reproduksi**
1. Pilih gaya **Cute Pure** → nilai UI `cute-pure`.
2. Simpan sebagai record `user_prefs` (jalur sync/import F10) → `userPrefsSchema` menolak (`appStyleSchema` hanya menerima `cute_pure`).
3. Sebaliknya, record dengan `style: 'cute_pure'` dari perangkat lain → `normalizeUserPrefs` membaca `'cute_pure'` sebagai dikenal (core) tetapi UI tidak punya `data-style='cute_pure'`, dan bila dipetakan ke `StyleName` tidak valid → jatuh ke **Cute**.

**Expected:** satu nilai gaya untuk token, `data-style`, `user_prefs`, export/import, dan sync.
**Actual:** dua ejaan; Cute Pure hilang saat melewati `user_prefs`, dan berkas export berisi `cute_pure` tidak bisa dipakai UI apa adanya.

**Bukti**
- `packages/tokens/src/styles.ts:9-17` → `'cute-pure'`; `dist/tokens.css` memakai `[data-style='cute-pure']`.
- `packages/core/src/domain/enums.ts:188-198` → `APP_STYLES = ['cute','cute_pure',…]`; `user-prefs.ts:40` memakai `appStyleSchema`.
- Test gagal: `app/theme-vocabulary.qa.test.ts` — "daftar gaya identik…" (`+ "cute-pure"` vs `- "cute_pure"`) dan "setiap gaya dari UI selamat melewati normalisasi user_prefs" (`[ 'cute-pure' ]`).

**Severity:** High untuk AC3/AC5 lintas jalur data; belum terlihat di UI sekarang karena B1 (belum ada jalur data sama sekali).

---

### B3 — Kontras teks di bawah WCAG AA di semua kombinasi gaya × tema — **High (blocking AC8)**

**Test:** `packages/tokens/src/contrast.qa.test.ts` (rasio dihitung dari token efektif: palet + tema + `neutrals` + `brand` gaya).

| Kelompok teks | Gagal | Terburuk |
|---|---|---|
| Teks redup `--mute` di kartu/halaman (10.5–14px) | 24/42 | `cute/kuning` 3.48:1 |
| Caption `--mute-3` di kartu/halaman (10.5–12px) | **42/42** | `simple/kuning` 2.37:1 |
| Tautan/aksen `--accent` sebagai teks | 20/42 | `simple/kuning` 2.89:1 |
| Teks tombol beraksen (`--paper` di `--accent`) | 8/21 | `cute-pure/kuning` 3.13:1 |
| Placeholder input | **21/21** | `cute/hijau` 1.84:1 |
| Chip/warning prioritas (urgent/medium/low) | **63/63** | `cute/kuning` 4.18:1 |
| Teks sukses (`--success`) | **42/42** | `vintage/kuning` 3.69:1 |
| **Total** | **220/273** | — |

**Contoh konkret (bisa direproduksi dengan kalkulator kontras mana pun)**
| Kombinasi | Pasangan | Rasio | Dipakai di |
|---|---|---|---|
| Cute Pure/Kuning, Tegas/Kuning, Simple/Kuning | `#EE6A1F` di `#FFFFFF` | **3.13:1** | `main.css:22-25` (semua tautan), `Segmented/index.vue:105-108` (label tema terpilih) |
| Elegan/Kuning | `#A8864F` di `#FFFFFF` | **3.39:1** | tautan & opsi terpilih |
| Cute/Kuning | `#8A7B68` di `#F6EBDA` | **3.48:1** | teks redup di atas latar halaman |
| Cute/Kuning | `#A8957C` di `#FFFBF4` | **2.81:1** | caption (`CalendarTimeGrid.vue:220`, `CalendarGridTask.vue:105,119`) |
| Simple/Kuning | `#A2A29B` di `#FFFFFF` | **2.57:1** | caption |
| Kertas (semua tema) | `#7A7974` di `#F6F5F0` | **4.00:1** | caption |
| Vintage/Kuning | `#7A6449` di `#EDE2CB` | **4.36:1** | teks redup di halaman |
| Cute/Ungu | `#B9A9D3` di `#FCFAFF` | **2.09:1** | placeholder (`main.css:50-52`) |
| Semua kombinasi | `#C2381A` di `#FFE1DA` · `#9A6A00` di `#FFF0C8` · `#3E7A33` di `#E3EEE0` | **4.40 / 4.18 / 4.35:1** | chip & kotak peringatan prioritas (`EncryptedBackupForm.vue:142-143`, `RecoveryBackupCard.vue:221-222,278-279`) |
| Semua kombinasi | `#3E8A32` di `#FFFFFF` / `#F3F9EF` | **4.30 / 4.01:1** | teks status sukses (`RecoveryBackupCard.vue:217`) |

Semua teks di atas berukuran < 18.66px bold / < 24px, jadi ambang "large text" 3:1 tidak berlaku. Rasio `--ink`/`--ink-2`/`--deep`/`--deeper` (teks utama) **lulus** di semua 21 kombinasi.
**Severity:** High — AC eksplisit; termasuk komponen pemilih tema itu sendiri (label tema aktif 3.13:1).

---

### B4 — Kedip tema sebelum JS: HTML awal selalu Kuning/Cute — **Medium (blocking AC6)**

**Reproduksi**
1. Set `localStorage.ip-theme='ungu'`, `ip-style='elegan'` (mis. dari sesi sebelumnya).
2. Hard reload `/` dengan jaringan lambat atau JS dimatikan → halaman **dilukis Kuning/Cute**.
3. Setelah modul JS jalan, baru berubah ke Ungu/Elegan.

**Expected:** "Gaya dipasang sebelum render pertama (tanpa kedip tema/gaya salah saat load)".
**Actual:** HTML/CSS dilukis lebih dulu; atribut baru dipasang plugin client.

**Bukti**
- `dist/index.html` (hasil `nuxt build`, 22 Okt — `app.vue`/token tidak berubah sejak 16 Okt): `<html lang="id" data-theme="kuning" data-style="cute">`; `grep -c "ip-theme"` = **0** (tidak ada skrip early-restore).
- `curl -s http://127.0.0.1:4321/app` dan `/login` → `<html lang="id">` **tanpa** `data-theme`/`data-style`; CSS `main.css:9-20` memakai `var(--bg)` dari `:root` (Kuning).
- CDP `Emulation.setScriptExecutionDisabled(true)` + `localStorage` ungu/elegan → `NO_JS_FIRST_PAINT {"theme":"kuning","style":"cute","bg":"rgb(246, 235, 218)"}`.
- Satu-satunya pemasang: `apps/web/app/plugins/theme.client.ts` + `app.vue:5-7`.

**Severity:** Medium — visual, singkat, tapi AC-nya eksplisit dan repro-nya deterministik. Perbaikan: skrip inline kecil di `<head>` (dengan hash/nonce CSP, seperti pola `ssg.hashScripts`) yang membaca `ip-theme`/`ip-style` dan menyetel `data-*` sebelum paint; atau shell netral sampai hidrasi.

---

### B5 — Gaya Kertas mengabaikan pilihan tema (3 tema tampil identik) — **Medium**

**Reproduksi:** pilih gaya **Kertas**, lalu ganti tema Kuning → Hijau → Ungu. Latar, kertas, garis, aksen, dan seluruh 24 token tidak berubah.
**Expected (PRD F16):** tema "mengganti seluruh ramp kertas/primary/accent"; kombinasi gaya × tema bebas dan bermakna.
**Actual:** `uiStyles.kertas` menimpa **semua** `THEME_COLOR_KEYS` lewat `neutrals` + `brand` yang isinya sama untuk ketiga tema (`packages/tokens/src/styles.ts:130-188`). Komentar kode menyebut ini disengaja ("aksen monokrom yang sama untuk semua tema"), tetapi tidak tercatat sebagai trade-off di PRD.
**Bukti terukur (CDP):** `STYLE kertas kuning:rgb(246,245,240) | hijau:rgb(246,245,240) | ungu:rgb(246,245,240)`; `KERTAS_THEME_NOOP true`.
**Severity:** Medium — preferensi tema tersimpan tetapi tidak berefek di 1 dari 7 gaya. Kalau memang keputusan desain, ubah PRD F16; kalau tidak, beri aksen per tema seperti Elegan/Vintage.

---

### B6 — Ganti gaya mengubah tinggi teks (reflow) — **Low / catatan**

CDP pada landing: Cute → Elegan mengubah `scrollHeight` **3604 → 3414 px (−190 px)** dan tinggi header 908 → 895 px, karena metrik font berbeda. Tidak ada reload/remount dan kerangka layout tidak berubah; pergeseran ini dipicu interaksi user sehingga tidak dihitung CLS. Kalau "tanpa layout shift" dimaksudkan pixel-stabil, perlu `size-adjust`/fallback metrics atau line-box tetap.

### B7 — Font default 3 berkas (budget performa "≤ 2 file") — **Low / catatan**

Load pertama memuat **3 berkas font** (Baloo 2, Nunito, Patrick Hand) — terukur via CDP. `performance.md` membatasi "font total ≤ 2 file, ≤ 100 KB woff2"; `nuxt.config.ts` menyebut "gaya default tetap 3 file font" tanpa menulis trade-off eksplisit. Bukan regresi baru dari T25 (font Cute sudah ada), tapi ikut terpakai oleh token gaya.

---

## 4. Probe browser (hasil build, CDP + Chrome headless)

Server lokal dijalankan dari `.output` dengan env dummy khusus QA (`NUXT_APP_ENV=development`, SMTP dummy) — bukan environment produksi, tidak ada koneksi DB/email. Output di bawah **dipangkas** (spasi/quoted family disederhanakan) supaya terbaca; angka & status apa adanya.

```
DEFAULT theme=kuning style=cute bg=rgb(246, 235, 218) color=rgb(47, 42, 36) font=Nunito htmlBg=rgb(246, 235, 218)
DISTINCT_FONTS ["Nunito","\"Work Sans\"","\"DM Sans\"","Jost","Lora","\"Space Grotesk\""]
STYLE cute      kuning:rgb(246,235,218) | hijau:rgb(229,239,220) | ungu:rgb(238,232,246) | font Nunito
STYLE cute-pure kuning:rgb(255,255,255) | hijau:rgb(255,255,255) | ungu:rgb(255,255,255) | font Nunito
STYLE kertas    kuning:rgb(246,245,240) | hijau:rgb(246,245,240) | ungu:rgb(246,245,240) | font "Work Sans"
STYLE simple    kuning:rgb(246,246,244) | hijau:rgb(246,246,244) | ungu:rgb(246,246,244) | font "DM Sans"
STYLE elegan    kuning:rgb(247,244,238) | hijau:rgb(247,244,238) | ungu:rgb(247,244,238) | font Jost
STYLE vintage   kuning:rgb(237,226,203) | hijau:rgb(237,226,203) | ungu:rgb(237,226,203) | font Lora
STYLE tegas     kuning:rgb(255,255,255) | hijau:rgb(255,255,255) | ungu:rgb(255,255,255) | font "Space Grotesk"
KERTAS_THEME_NOOP true
INITIAL font_requests 3 (css 27, js 64)
AFTER_ELEGAN font_requests 2 (Jost 400/500), document.fonts.check Jost = true
RESTORED_AFTER_RELOAD {"theme":"ungu","style":"elegan","bg":"rgb(247, 244, 238)","font":"Jost"}
SERVER_HTML_ATTRS <html lang="id" data-theme="kuning" data-style="cute">
NO_JS_FIRST_PAINT {"theme":"kuning","style":"cute","bg":"rgb(246, 235, 218)"}
```

Kesimpulan probe: token benar-benar terpasang di CSS hasil build (bukan cuma konstanta TS), ganti atribut langsung mengubah tampilan, font gaya benar-benar lazy-load, persisten setelah reload — **dan** kedip tema (B4) serta no-op Kertas (B5) terbukti.

---

## 5. Cek tiga pilar

### Keamanan
- Nilai tema/gaya divalidasi terhadap daftar putih sebelum dipakai sebagai `data-*`; tidak ada nilai user yang masuk `style`/CSS mentah. Swatch preview memakai konstanta token, bukan input (`AppearanceMenu.vue:14-20`). `localStorage` hanya berisi preferensi non-sensitif (sesuai security.md §7 yang melarang token auth, bukan preferensi UI).
- **Catatan:** preferensi tidak di-scope per akun sehingga berpindah antar akun di satu browser (bagian dari B1). Bukan kebocoran data sensitif, tapi melanggar "per akun".
- Tidak ada secret/PII baru di payload SSR (atribut hanya nama tema/gaya).

### Performa
- Pendekatan CSS variable per gaya (satu set komponen) — sesuai PRD; ganti gaya tidak memicu render ulang komponen (`app.qa.test.ts` buktikan root tidak remount).
- Font gaya `preload:false` dan benar-benar hanya diunduh saat dipakai (+2 berkas saat pindah ke Elegan), lalu di-cache `CacheFirst` oleh SW untuk offline. Token CSS global 14.97 KB (3.6 KB gzip).
- **Catatan:** 3 berkas font default (B7); reflow teks saat ganti gaya (B6).

### Kerapian
- Satu sumber token (`packages/tokens`), CSS digenerate (tidak diedit manual), test menjaga blok CSS.
- **Masalah:** dua kosakata gaya (B2) = sumber kebenaran ganda; `userPrefs` repository tidak terpakai (dead path untuk fitur ini) — bagian dari B1.
- Test baru memakai perilaku (rasio kontras, atribut `<html>`, store, menu) bukan detail internal; tidak ada `.only`/`.skip`.

---

## 6. Perintah & hasil (verbatim ringkas)

```bash
# token: 3 file, 19 lulus / 6 gagal (semua di contrast.qa.test.ts = reproduksi B3)
cd packages/tokens && npx vitest run

# domain user_prefs (normalisasi F16): 9 lulus / 0 gagal
cd packages/core && npx vitest run src/domain/entities/user-prefs.qa.test.ts

# web, seluruh test QA T25: 26 lulus / 2 gagal (2 = reproduksi B2)
cd apps/web && npx vitest run \
  app/stores/appearance.qa.test.ts app/app.qa.test.ts \
  app/components/features/appearance/AppearanceMenu.qa.test.ts \
  app/theme-vocabulary.qa.test.ts app/theme-loading.qa.test.ts

# regresi area terdampak (theme/appearance/shell/layouts/login): 8 lulus / 2 gagal
# 2 gagal = pekerjaan T22 yang belum selesai, bukan T25
cd apps/web && npx vitest run app/composables/useAppearance.test.ts \
  app/components/features/shell app/layouts app/pages/login.qa.test.ts

# lint 8 file test baru: bersih (exit 0)
cd apps/web && npx eslint app/stores/appearance.qa.test.ts app/app.qa.test.ts \
  app/components/features/appearance/AppearanceMenu.qa.test.ts \
  app/theme-vocabulary.qa.test.ts app/theme-loading.qa.test.ts --max-warnings 0
cd packages/tokens && npx eslint src/appearance.qa.test.ts src/contrast.qa.test.ts --max-warnings 0
cd packages/core && npx eslint src/domain/entities/user-prefs.qa.test.ts --max-warnings 0

# typecheck: tokens & core exit 0; web exit 2 (6 error, semuanya file test task lain)
cd packages/tokens && npx tsc -p tsconfig.json
cd packages/core && npx tsc -p tsconfig.json
cd apps/web && npx nuxt typecheck
```

---

## 7. Coverage & celah test yang tersisa

- **Kontras** diuji di level token (sumber kebenaran), **bukan** computed style tiap elemen: pola latar (`--grid`, dot pattern) dan gradient bisa menurunkan rasio nyata; T16 sebaiknya menjalankan **axe-core** di Playwright untuk halaman utama × 21 kombinasi.
- **Matriks halaman** (Daily, To-do, Kalender, Jurnal, Overview, Goals, Akun, Panduan, Import/Export) belum divisualkan per gaya karena butuh login + unlock E2EE; ini risiko terbesar yang belum tertutup dari AC9. 178 warna hex literal di komponen (terbanyak `overview.vue`, `GoalChip.vue`, `AuthEmailStep.vue`) berarti sebagian permukaan tidak ikut tema — perlu keputusan: token atau memang warna brand/sticker.
- **Sync preferensi** tidak punya test karena jalurnya belum ada (B1). Setelah diperbaiki, test yang dibutuhkan: dua "perangkat" (dua instance storage) → ganti tema di A → record `user_prefs` di outbox → pull di B → tema sama; plus nilai asing di record → default tanpa error.
- **Kedip** hanya bisa dibuktikan kuat dengan screencast/first-paint capture di E2E (di sini dibuktikan dari HTML awal + JS dimatikan).
- **Offline sungguhan**: rule cache & `precacheFallback` diverifikasi dari konfigurasi + `dist/sw.js`, bukan dengan mematikan jaringan di browser.

---

## 8. Rekomendasi (untuk developer, bukan dikerjakan QA)

1. **B1:** sambungkan `useAppearanceStore` ke `user_prefs` lewat use case core (bukan tulis IndexedDB langsung — ARCHITECTURE §4): tulis record saat pilihan berubah, hydrate dari record setelah unlock, dan hapus/abaikan `localStorage` sebagai sumber utama (atau simpan sebagai cache per-`userId`).
2. **B2:** pilih satu ejaan. Paling murah: ubah `APP_STYLES`/`appStyleSchema` ke `'cute-pure'` + migrasi record lama (atau mapper dua arah) dan tambahkan test paritas seperti `theme-vocabulary.qa.test.ts`.
3. **B3:** gelapkan token teks: `--mute`/`--mute-3`/`--placeholder`; `accent` untuk teks (bukan `primary`) minimal 4.5:1 di `paper`/`bg`; `--paper` di `--accent` perlu aksen lebih gelap atau teks `--ink`; chip prioritas & `success` digelapkan sedikit (4.18–4.40 → ≥4.5). Jalankan `contrast.qa.test.ts` sampai hijau.
4. **B4:** skrip inline pra-paint (hash/nonce) yang menyetel `data-theme`/`data-style` dari `localStorage`, dan pertimbangkan shell netral untuk route `ssr:false`.
5. **B5:** putuskan: beri aksen per tema untuk Kertas, atau catat trade-off di PRD bahwa Kertas monokrom.
6. **B6/B7:** pertimbangkan `size-adjust` pada fallback font; catat trade-off 3 berkas font default di PRD/PR.

---

## 9. File yang ditambahkan QA

```
apps/web/app/app.qa.test.ts
apps/web/app/stores/appearance.qa.test.ts
apps/web/app/components/features/appearance/AppearanceMenu.qa.test.ts
apps/web/app/theme-vocabulary.qa.test.ts
apps/web/app/theme-loading.qa.test.ts
packages/tokens/src/appearance.qa.test.ts
packages/tokens/src/contrast.qa.test.ts
packages/core/src/domain/entities/user-prefs.qa.test.ts
reports/qa-t25-tema.md
```

Tidak ada kode produk yang diubah. 8 test yang gagal **sengaja** dibiarkan merah sebagai reproduksi B2 & B3; jangan dihapus/dilemahkan — perbaiki kodenya sampai hijau.

---

# Putaran 2 — re-review setelah perbaikan `dimas` + `bayu`

**Tanggal:** 2026-10-23 08:51–09:0x WIB · **Reviewer:** Fajar (QA) · **Build diuji:** `.output` hasil `pnpm build` **08:52** (dibangun ulang dari working tree terkini, bukan build lama 22 Okt) · **Server:** `node .output/server/index.mjs` di `127.0.0.1:4321` dengan env dummy (`NUXT_APP_ENV=development`) — lokal, bukan production · **Browser:** Chrome 155 headless via CDP

## 10.1 Verdict putaran 2

## **LULUS dengan catatan**

Tidak ada bug pemblokir tersisa. Kelima temuan yang memblokir putaran 1 sudah diperbaiki dan saya buktikan ulang tanpa memakai angka dari developer:

| Temuan putaran 1 | Status putaran 2 | Bukti independen |
|---|---|---|
| **B1** prefs hanya di `localStorage`, tidak per akun, tidak sync | **FIXED** | Ditulis & dibaca dari repository `user_prefs`; baris outbox bertambah; akun B tidak mewarisi; hapus `localStorage` → pilihan tetap kembali. Test QA baru 5/5 hijau (§10.3) |
| **B2** `cute-pure` (tokens) vs `cute_pure` (core) | **FIXED** | Kanonik `cute-pure` di core+tokens; alias `cute_pure` dinormalkan di jalur baca **dan** schema tulis/import; nilai asing → default (§10.4) |
| **B3** kontras AA | **FIXED (surface test 441 pasangan)** + catatan B8 | Hitung ulang independen: **441 pasangan, 0 gagal, terendah 4.5063:1** (§10.5). Sisa masalah di permukaan state (`--soft`/`--hover`) → B8, follow-up T16 |
| **B4** kedip tema sebelum JS | **FIXED** | Skrip inline pra-paint ada di `/`, `/app`, `/login`, sebelum CSS; hash CSP di `/`, nonce di route SSR; JS app diblokir → tema sudah benar (§10.6) |
| **B5** Kertas mengabaikan tema | **FIXED** | 19 dari 72 token berbeda per tema; bg/aksen/tinta terhitung berbeda di browser (§10.7) |

Catatan yang **tidak** memblokir: **B6** klaim reflow 0 px hanya benar untuk Cute→Elegan di 768 px; gaya lain masih bergeser (maks 82 px desktop / 225 px mobile) — Low, pemicunya interaksi user (bukan CLS). **B8** kontras beberapa teks di atas permukaan state masih < 4.5:1 (3.51–4.29) — Medium, di luar 441 pasangan yang disepakati dan sudah didefer ke T16 pada putaran 1. **B9/B10** catatan Low (cache tema akun sebelumnya di layar terkunci; font `Patrick Hand` tinggal konfigurasi).

**Tidak ada assertion QA yang dilemahkan/dihapus.** Semua file test QA T25 mtime-nya **06:06–06:24** (sebelum report putaran 1 selesai 06:24:18), sedangkan seluruh file produk yang diperbaiki mtime **07:52–08:48** — test tidak disentuh setelah putaran 1. Jumlah test per file juga identik dengan putaran 1 (18 + 9 + 28 = **55**), dan assertion kunci tetap ketat (`toEqual([])` pada kontras, `toHaveLength(7)`, `toEqual([...])` pada kosakata). `grep` untuk `.only`/`.skip`/`it.todo` = **0**.

## 10.2 Hasil per acceptance criteria (putaran 2)

| # | Acceptance criteria | Hasil | Bukti |
|---|---|---|---|
| **AC1** | 3 tema + 7 gaya sebagai design token | **PASS** | `packages/tokens` 25/25 hijau; `appearance.qa.test.ts` masih menuntut daftar persis & 24 token per tema |
| **AC2** | Ganti gaya/tema langsung tanpa reload & tanpa layout shift | **PASS (catatan B6)** | `app.qa.test.ts` + menu: atribut `<html>` berubah, elemen root sama (tanpa remount). Reflow: Cute→Elegan **0 px @768**, tapi Cute→Simple **−116 px @768**, **−225 px @390** (lihat B6) |
| **AC3** | Bertahan setelah restart & tersinkron antar perangkat | **PASS** | `useAppearancePrefs.round2.qa.test.ts` 5/5: ditulis ke `userPrefs` + `countOutbox() > 0`; restart dari record; akun lain mulai default; hapus cache → record tetap. `useAppearancePrefs.test.ts` (developer) 9/9 turut hijau |
| **AC4** | Default Cute + Kuning | **PASS** | `appearance.qa.test.ts`, `app.qa.test.ts`; probe: `theme=kuning style=cute` |
| **AC5** | Nilai tak dikenal → default tanpa error | **PASS** | Store 14 nilai asing → default; core `normalizeUserPrefs` payload rusak → default tanpa throw; record `themeColor:'merah', style:'neon'` → Kuning/Cute tanpa error (§10.3) |
| **AC6** | Gaya terpasang sebelum render pertama (tanpa kedip) | **PASS** | 3 route: skrip inline di `<head>` sebelum CSS; `/` memakai **hash** CSP (`sha256-edJmu2…`, cocok dengan isi skrip), `/app`+`/login` memakai **nonce** yang sama dengan header CSP. CDP + semua `*/_nuxt/*.js` diblokir → `/`, `/app`, `/login` langsung `data-theme=ungu data-style=elegan`, `body` `rgb(247,244,238)`, font Jost |
| **AC7** | Font gaya lazy-load & offline | **PASS** | `theme-loading.qa.test.ts` 4/4; runtime **2 berkas woff2** pada load pertama (Nunito + Baloo 2, 4 face); pindah gaya menambah hanya font gaya itu; rule SW `CacheFirst` |
| **AC8** | Kontras AA di semua kombinasi gaya × tema | **PASS (catatan B8)** | Hitung ulang independen **441/441 lulus, terendah 4.5063:1** (§10.5). Sisa: teks di atas `--soft`/`--hover`/`--dash` belum AA → B8 |
| **AC9** | Semua halaman tampil benar di tiap gaya | **BELUM TERVERIFIKASI PENUH** | Sama seperti putaran 1: `/app/**` butuh login + unlock E2EE; verifikasi penuh tetap di **T16** (axe/Playwright). Tidak ada `font-family` literal di komponen; 21 kombinasi token terhitung benar di landing |

## 10.3 B1 — verifikasi independen (bukan test developer)

Test QA baru: `apps/web/app/composables/useAppearancePrefs.round2.qa.test.ts` (5 test, semua hijau). Isinya sengaja tidak menduplikasi test developer; yang dibuktikan adalah perilaku AC:

1. **Ditulis ke repository + outbox:** `setTheme('ungu')`/`setStyle('elegan')` → `repos.userPrefs.listAll()` berisi `{themeColor:'ungu', style:'elegan'}` **dan** `storage.countOutbox() > 0` (record ikut antrean sync, bukan hanya lokal).
2. **Akun lain tidak mewarisi:** akun A (storage A) ungu/elegan → ganti ke akun B (storage B, `localStorage` akun A masih ada) → store **kuning/cute**, `ownerUserId = B`, `localStorage.ip-appearance-owner = B`, record B = default. Tidak ada kebocoran preferensi A→B.
3. **`localStorage` hanya cache:** setelah pilihan hijau/tegas, `localStorage.clear()` + store baru + sesi yang sama → pilihan **hijau/tegas** kembali dari record (bukan dari cache).
4. **Alias lama:** record berisi `cute_pure` → store `cute-pure` (bukan Cute), dan saat ditulis ulang tersimpan kanonik `cute-pure`.
5. **Nilai asing dari versi lain:** record `themeColor:'merah', style:'neon', hideDecorations:'ya'` → `hydrate()` **resolve tanpa throw**, store jatuh ke Kuning/Cute.

Bukti kode: `useAppearancePrefs.ts:99-119` (tulis via `session.writer.write({ type:'user_prefs' })` → record+index+outbox satu transaksi), `:140-181` (baca `repos.userPrefs.listAll()` → `normalizeUserPrefs`), `:202-217` (akun berganti → reset `recordId`/`persisted`), `app.vue:16-25` (logout → `forget()`, akun baru → `adopt()`), `stores/appearance.ts:98-110` (owner-scoped cache), `useLogout.ts:43` (`clearAppStorage` menghapus semua key `ip-`).

## 10.4 B2 — verifikasi kosakata (core + web + import)

Skrip independen memanggil API publik core:

```
APP_STYLES  = ["cute","cute-pure","kertas","simple","elegan","vintage","tegas"]
STYLE_NAMES = ["cute","cute-pure","kertas","simple","elegan","vintage","tegas"]
PARITAS true
input        normalizeAppStyle  schemaTulis  jalurBaca  userPrefsSchema
cute         cute               cute         cute       cute
cute-pure    cute-pure          cute-pure    cute-pure  cute-pure
cute_pure    cute-pure          cute-pure    cute-pure  cute-pure   ← alias lama, tidak jatuh ke Cute
CUTE_PURE    null               DITOLAK      cute       DITOLAK
neon         null               DITOLAK      cute       DITOLAK
```

Jalur import/backup juga menerima berkas lama: `validateEntityPayload('user_prefs', { style:'cute_pure', … })` → `ok:true, style:'cute-pure'`; `style:'neon'` → ditolak dengan pesan enum kanonik (`domain/entities/index.ts:76` memakai `userPrefsSchema`). Tidak ada tabel pemetaan kedua di web: `useAppearancePrefs.ts:51-65` memakai `normalizeAppStyle` dari core.

## 10.5 B3 — hitung ulang kontras (implementasi sendiri)

Saya menulis ulang rumus luminance/rasio WCAG (ambang linear 0.04045, bukan menyalin helper test), lalu menghitung 21 peran teks × 7 gaya × 3 tema:

```
TOTAL_PASANGAN 441
GAGAL_4_5 0
TERENDAH 4.5063  {"style":"kertas","theme":"ungu","fgKey":"placeholder",
                  "fg":"#6F6F6A","bg":"#F3F1F7"}
TERENDAH_PER_KELOMPOK
  11.74 teks utama di kartu      6.00 teks redup-2
  10.64 teks utama di halaman    4.54 caption
  11.04 teks utama di inset      4.93 tautan di kartu
   7.55 teks sekunder            4.54 tautan di halaman
   6.39 teks aksen gelap         4.93 teks tombol beraksen
   6.26 teks terpilih            4.51 placeholder
   4.86 teks redup di kartu      4.63/4.61/4.59 chip urgent/medium/low
   4.58 teks redup di halaman    4.59 sukses · 4.99 sukses-soft · 4.90 bahaya
```

Klaim **441 pasangan / 0 gagal / terendah 4.51:1 terbukti** (4.5063 dibulatkan 4.51). Catatan: margin placeholder hanya **0.006** di atas ambang — jangan turunkan token itu tanpa menghitung ulang; sebaiknya test memakai guard 4.6 supaya tidak flaky di batas.

Pemeriksaan tambahan (di luar test, karena AC berbunyi "kontras AA"): pasangan teks/latar lain yang benar-benar dipakai komponen. Yang **lulus**: logo putih di `--accent` (min 4.93), paper di `--deeper` (8.18), paper di `--deep` (6.39), ink di `--soft`/`--chip`/`--primary`, deep di `--soft` (4.89), danger di chip urgent (4.63), 6 chip kategori (4.81–6.31). Yang **masih gagal** → **B8**.

## 10.6 B4 — pre-paint (build 08:52)

Hasil `nuxt build` + `verify-precache OK: 145 entri`:

- **`/` (prerender):** `<script>` early-restore ada di byte **2725**, CSS/`<link>` pertama di byte **3091** → skrip dieksekusi sebelum stylesheet sempat dilukis. Hash skrip yang saya hitung (`sha256-edJmu2yld3sJ8GtsUASLwYyb6j60ldhBztmhpUmAr28=`) **ada di meta CSP**; `script-src` tidak memakai `'unsafe-inline'`.
- **`/login`, `/app` (ssr:false):** skrip ada di `<head>` sebelum CSS, memakai `nonce` yang **sama** dengan header `Content-Security-Policy` pada request yang sama.
- **Runtime, semua `*/_nuxt/*.js` diblokir** (app tidak pernah mount, `vueMounted:false`):

```
PREPAINT_NO_APP_JS /      {"theme":"ungu","style":"elegan","bgVar":"#f7f4ee","bodyBg":"rgb(247, 244, 238)","bodyFont":"Jost"}
PREPAINT_NO_APP_JS /login {"theme":"ungu","style":"elegan","bgVar":"#f7f4ee","bodyBg":"rgb(247, 244, 238)","bodyFont":"Jost"}
PREPAINT_NO_APP_JS /app   {"theme":"ungu","style":"elegan","bgVar":"#f7f4ee","bodyBg":"rgb(247, 244, 238)","bodyFont":"Jost"}
```

- **Validasi nilai (anti-XSS):** `ip-theme='"><script>alert(1)</script>'`, `ip-style='<img src=x onerror=alert(1)>'` → `theme=kuning style=cute`, `onerrorAttr:false`, `imgTags:0`, tidak ada eksekusi. Skrip hanya membandingkan nilai dengan array whitelist lalu `setAttribute`; tidak pernah menyisipkan nilai user ke markup. Whitelist memakai `indexOf` (bukan `includes`) dan tanpa `<`/`&&` sesuai catatan `shared/appearance.ts:31-50`.

## 10.7 B5 — Kertas per tema

Hitung token efektif (palette + theme + neutrals + brand) untuk `kertas`:

```
KERTAS_TOKEN_BERBEDA_PER_TEMA 19 dari 72
KERTAS_BG     kuning:#F7F4EC | hijau:#F0F4EE | ungu:#F3F1F7
KERTAS_ACCENT kuning:#3B2F1C | hijau:#25331F | ungu:#332B45
KERTAS_INK    kuning:#2A2418 | hijau:#1E2A1B | ungu:#292237
```

Probe browser (CSS hasil build, `getComputedStyle`): `bg` `rgb(247,244,236)` / `rgb(240,244,238)` / `rgb(243,241,247)`, `--accent` & `--ink` berbeda semua. Jadi tema tidak lagi no-op di gaya Kertas. Token yang sengaja tetap sama: ramp status/chip (`prio-*`, `success`) — itu global, bukan pelanggaran B5.

## 10.8 Catatan & bug sisa (tidak memblokir)

### B6 — Klaim "reflow 195 → 0 px" hanya benar untuk satu perbandingan — **Low**

**Reproduksi:** buka landing hasil build, ukur `document.documentElement.scrollHeight`, ganti `data-style`, tunggu `document.fonts.ready`, ukur lagi.

| Viewport | Cute | Elegan | Δ | Simple | Δ | Vintage | Δ |
|---|---|---|---|---|---|---|---|
| 390×844 | 5097 | 5040 | **−57** | 4872 | **−225** | 4930 | −167 |
| 768×1024 | 3644 | 3644 | **0** | 3528 | **−116** | 3614 | −30 |
| 1024×768 | 2821 | 2846 | +25 | 2746 | −75 | 2716 | −105 |
| 1280×900 | 2845 | 2879 | +34 | 2770 | −75 | 2763 | −82 |
| 1440×900 | 2845 | 2855 | +10 | 2770 | −75 | 2763 | −82 |

Cute→Elegan di 768 px memang **0 px** (klaim itu benar dan jauh lebih baik dari −190 px putaran 1), tetapi **bukan 0 untuk semua gaya**: di mobile Cute→Simple masih −225 px. Penyebab: `font-size-adjust: 0.51` (`apps/web/app/assets/css/main.css:25`) menyamakan x-height, bukan metrik ascent/descent semua keluarga font. Ini pergeseran yang dipicu interaksi user (tidak masuk CLS), jadi AC2 tetap lulus dengan catatan — tapi **jangan klaim "tanpa layout shift 0 px" secara umum**.

### B8 — Kontras teks di atas permukaan state masih < AA — **Medium (follow-up T16)**

441 pasangan test lulus, tetapi permukaan `--soft`, `--hover`, `--dash` (state terpilih/hover/badge) belum tercakup test dan masih gagal:

| Pasangan | Gagal | Terendah | Bukti |
|---|---|---|---|
| `--mute-3` (12 px) di atas `--soft` | **21/21** | **3.51:1** (cute-pure/ungu `#7C756D` di `#E6DEFB`); cute/kuning 4.16 | `apps/web/app/components/features/calendar/CalendarTimeGrid.vue:211` (`.head.selected{background:var(--soft)}`) + `:215-220` (`.dow{color:var(--mute-3)}`, `<span class="dow">` anak dari `.head`) |
| `--mute` di atas `--hover` | 4/21 | 4.29:1 (cute-pure/ungu) | `CalendarTimeGrid.vue:354-357` (`.slot:hover{background:var(--hover);color:var(--mute)}`) |
| `--ink-2` di atas `--dash` | 2/21 | 4.14:1 (kertas/ungu `#2A2A27` di `#8C86A0`) | `apps/web/app/components/features/pomodoro/PomodoroHistory.vue:110-113` (`.skipped .badge`) |
| `--accent` di atas `--soft` (angka "hari ini" 22 px, bobot 600) | 2 gaya | 4.07–4.21:1 | `CalendarTimeGrid.vue:227-229` (`.head.today .num{color:var(--accent)}`) — hanya Simple/Elegan (bobot < 700, jadi bukan large text) |

**Expected:** AC8 "kontras AA di semua kombinasi gaya × tema" — teks 12 px butuh 4.5:1. **Actual:** 3.51–4.29:1. **Severity Medium** (keterbacaan, bukan blocker fungsi). **Kenapa tidak memblokir T25:** surface 441 pasangan yang disepakati di putaran 1 sudah hijau, perbaikan ini menaikkan pasangan state dari ~2.2–4.0 menjadi 3.51–4.29 (bukan regresi), dan putaran 1 secara eksplisit menyerahkan kontras per-elemen ke T16 (axe). Rekomendasi: gelapkan `--mute-3` ~8–12% atau pakai `--mute-2` untuk caption di state terpilih, lalu tambahkan pasangan ini ke `contrast.qa.test.ts`.

### B9 — Layar terkunci bisa menampilkan cache tema akun sebelumnya — **Low**

**Reproduksi:** akun A memilih Ungu (cache `localStorage` terisi, owner=A) → tanpa logout penuh, akun B dipakai di browser yang sama (cookie sesi berganti) → buka ulang app saat data masih terkunci.
**Expected:** tampilan akun B (default sampai record B dibaca). **Actual:** skrip pre-paint hanya membaca cache tanpa memeriksa `ip-appearance-owner` (`shared/appearance.ts:44-51`); `hydrate()` belum bisa `adopt(B)` karena sesi data lokal masih `null` saat terkunci (`useAppearancePrefs.ts:147-153`), jadi warna A bertahan sampai unlock. Bukan kebocoran data (hanya nama tema/gaya), dan logout normal membersihkan cache (`useLogout.ts:43`). Severity Low.

### B10 — `Patrick Hand` tinggal konfigurasi tak terpakai — **Low (kerapian)**

`styles.ts:44-50` sekarang memakai Baloo 2 untuk `hand` (perbaikan B7), tetapi `nuxt.config.ts:332` masih mendaftarkan `Patrick Hand` dan `appearance.qa.test.ts:18` masih memasukkannya ke `DEFAULT_FONTS`. Efek performa nihil (probe: hanya **2 woff2** yang diunduh), tapi ini konfigurasi/dead reference yang membingungkan. Hapus dari `nuxt.config.ts` + perbarui daftar font QA setelah diputuskan.

## 10.9 Perintah & hasil (verbatim, putaran 2)

```bash
# 1) token: 3 file, 25 lulus / 0 gagal (putaran 1: 19/6)
cd packages/tokens && npx vitest run
#    Test Files 3 passed (3) · Tests 25 passed (25)

# 2) domain user_prefs: 9 lulus / 0 gagal
pnpm --filter @improve-personal/core exec vitest run src/domain/entities/user-prefs.qa.test.ts
#    Test Files 1 passed (1) · Tests 9 passed (9)

# 3) web, 5 file QA T25 (apa adanya): 28 lulus / 0 gagal (putaran 1: 26/2)
cd apps/web && npx vitest run \
  app/theme-vocabulary.qa.test.ts app/stores/appearance.qa.test.ts \
  app/components/features/appearance/AppearanceMenu.qa.test.ts \
  app/theme-loading.qa.test.ts app/app.qa.test.ts
#    Test Files 5 passed (5) · Tests 28 passed (28)

# 4) test QA baru putaran 2 (B1): 5 lulus / 0 gagal
cd apps/web && npx vitest run app/composables/useAppearancePrefs.round2.qa.test.ts
#    Test Files 1 passed (1) · Tests 5 passed (5)

# 5) regresi area tampilan: 21 lulus / 0 gagal
cd apps/web && npx vitest run app/composables/useAppearance.test.ts \
  app/composables/useAppearancePrefs.test.ts app/components/features/appearance
#    Test Files 3 passed (3) · Tests 21 passed (21)

# 6) lint 9 file test (8 lama + 1 baru): exit 0, --max-warnings 0
cd apps/web && npx eslint app/theme-vocabulary.qa.test.ts app/stores/appearance.qa.test.ts \
  app/components/features/appearance/AppearanceMenu.qa.test.ts app/theme-loading.qa.test.ts \
  app/app.qa.test.ts app/composables/useAppearancePrefs.round2.qa.test.ts --max-warnings 0   # exit 0
cd packages/tokens && npx eslint src/appearance.qa.test.ts src/contrast.qa.test.ts --max-warnings 0  # exit 0
cd packages/core && npx eslint src/domain/entities/user-prefs.qa.test.ts --max-warnings 0          # exit 0

# 7) typecheck: web exit 0 (catatan #36 sudah tidak berlaku — `uqr` sekarang dependency, tidak ada error)
cd apps/web && npx nuxt typecheck        # exit 0, tanpa output
cd packages/tokens && npx tsc -p tsconfig.json   # exit 0
cd packages/core && npx tsc -p tsconfig.json     # exit 0

# 8) build + probe (bukan production)
cd apps/web && NUXT_APP_ENV=development pnpm build   # exit 0, verify-precache OK: 145 entri
PORT=4321 HOST=127.0.0.1 NUXT_APP_ENV=development node .output/server/index.mjs
# probe CDP: PREPAINT_NO_APP_JS / /login /app, INITIAL_FONT_FILES 2, REFLOW 5 viewport, KERTAS_PER_TEMA
```

## 10.10 Perbandingan test putaran 1 vs 2 (bukti tidak dilemahkan)

| File QA | mtime | Jumlah test p1 → p2 | Assertion kunci |
|---|---|---|---|
| `packages/tokens/src/contrast.qa.test.ts` | 06:11:13 | 7 → 7 | `expect(violations(...)).toEqual([])` (tidak dilonggarkan) |
| `packages/tokens/src/appearance.qa.test.ts` | 06:20:16 | 11 → 11 | 7 gaya persis, 24 token/tema, token layout tidak berubah |
| `apps/web/app/theme-vocabulary.qa.test.ts` | 06:06:46 | 3 → 3 | `toEqual([...])` daftar identik |
| `apps/web/app/stores/appearance.qa.test.ts` | 06:20:16 | 10 → 10 | 14 nilai asing → default |
| `apps/web/app/components/features/appearance/AppearanceMenu.qa.test.ts` | 06:20:16 | 7 → 7 | 3 tema/7 gaya, `aria-*` |
| `apps/web/app/theme-loading.qa.test.ts` | 06:24:15 | 4 → 4 | `preload:false`, `CacheFirst`, routeRules |
| `apps/web/app/app.qa.test.ts` | 06:06:08 | 4 → 4 | atribut `<html>` + root tidak remount |
| `packages/core/src/domain/entities/user-prefs.qa.test.ts` | 06:09:00 | 9 → 9 | schema ketat + normalisasi |

Semua mtime test ≤ 06:24:15; report putaran 1 selesai 06:24:18; seluruh perubahan produk 07:52–08:48. Tidak ada file test yang saya edit — satu-satunya file test baru adalah `useAppearancePrefs.round2.qa.test.ts`. Hash sha256 file test saat putaran 2 (untuk perbandingan putaran berikutnya):

```
a03c16f2…dc840  packages/tokens/src/appearance.qa.test.ts
9e856159…bde1d  packages/tokens/src/contrast.qa.test.ts
dad46296…536eb  apps/web/app/theme-vocabulary.qa.test.ts
72d4feac…2f4d   apps/web/app/stores/appearance.qa.test.ts
679de2e6…f0982  apps/web/app/components/features/appearance/AppearanceMenu.qa.test.ts
e6529358…a517   apps/web/app/theme-loading.qa.test.ts
22516b6b…3b35   apps/web/app/app.qa.test.ts
873f3d65…7e9bd  packages/core/src/domain/entities/user-prefs.qa.test.ts
```

## 10.11 File yang ditambahkan/diubah QA di putaran 2

```
apps/web/app/composables/useAppearancePrefs.round2.qa.test.ts   (baru, 5 test B1)
reports/qa-t25-tema.md                                          (bagian Putaran 2 ini)
```

Tidak ada kode produk yang diubah. Skrip hitung kontras/reflow/font hanya di `/tmp/opencode/**` (tidak masuk repo). Tidak menyentuh area goals/account/daily/guide, tidak commit, tidak mengubah status Ergonio.
