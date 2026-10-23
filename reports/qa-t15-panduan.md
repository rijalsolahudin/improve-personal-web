# QA T15 — Halaman Panduan (F1–F16) + "Gimana data lo dijaga"

**Task:** Ergonio #29 `[T15] Halaman Panduan (F1–F16) + "Gimana data lo dijaga"`
**Tanggal:** 23 Okt 2026 · **QA:** Fajar
**Tree:** working tree bersama agent lain (QA tidak menyentuh kode produk selain file test + laporan ini)
**Environment:** Linux, Node `v24.18.0`, `vitest 5.0.3`, Nuxt `4.5.2`, `@nuxt/test-utils` (env `nuxt`)

Rules dibaca: `CLAUDE.md` root, `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`,
`.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md` → `apps/web/CLAUDE.md` →
`apps/web/.claude/rules/{security,performance,code-quality}.md`, `docs/PRD.md` §F9 (baris 380–412), §F10
(414–456), §F15/E2EE & pemulihan (785–1032), AC T15 (baris 1100).

---

## Verdict: **GAGAL (blocking)** — 1 AC tidak lulus

Enam dari tujuh acceptance criteria lulus dengan bukti test otomatis + cek silang ke kode. AC **"status
fitur jujur"** gagal pada **Import / Export (F10)**: Panduan menyatakan fitur ini *"Belum tersedia di versi
ini"* dan *"segera"*, padahal halaman `/app/import-export` sudah jalan (export + import, lulus QA T12
putaran 2) dan bisa dibuka dari menu akun (desktop) maupun menu HP. Ini bukan salah ketik: user yang
mencari cara backup data justru diberi tahu bahwa satu-satunya jalur backup data (selain kode pemulihan)
tidak ada, sehingga dia tidak memakainya.

Temuan kedua (Low, non-blocking): FAQ menjanjikan "menu Jadwal dan Sticker sudah ada di navigasi", padahal
keduanya tidak ada di sidebar maupun menu HP.

Sisa isi Panduan (E2EE, kunci utama, passkey, kode `iprk1.*`, berkas terenkripsi kata sandi, batas
percobaan, QR, pernyataan "semua pembuka hilang = data hilang") **akurat** dan cocok dengan konstanta kode
saat ini.

---

## Scope & test plan

**Diuji (test baru, 4 file / 24 test):**

| File | Level | Fokus |
|---|---|---|
| `apps/web/app/utils/guide.qa.test.ts` | unit isi + static scan | copy vs konstanta kripto/kebijakan nyata; status jujur; tidak ada `v-html`/markup |
| `apps/web/app/components/features/guide/GuidePage.qa.test.ts` | integrasi halaman (`mountSuspended`) | F1–F16 benar-benar dirender, anchor TOC hidup & unik, heading, `<details>` FAQ, `aria-labelledby` |
| `apps/web/app/components/features/shell/ShellNavGuide.qa.test.ts` | integrasi komponen | pintu masuk dari menu akun (desktop) & menu sheet (HP) |
| `apps/web/app/utils/guideRouting.qa.test.ts` | integrasi router | `/app/panduan` menang atas `[feature].vue`; `/app/jadwal` tetap placeholder |

Test lama `apps/web/app/utils/guide.test.ts` ikut dijalankan (6 test) sebagai regresi isi.

Tanpa test baru untuk komponen `GuideToc`/`GuideSecurity`/`GuideBackup`/`GuideFaq` secara terpisah: semuanya
dirender oleh test halaman, jadi test komponen terpisah hanya akan mengulang assertion yang sama.

**Tidak diuji (dengan alasan):**

- **Playwright/E2E + scroll anchor nyata.** Route `/app/**` `ssr: false`; menguji klik TOC → scroll butuh
  browser sungguhan. Diganti assertion struktural: setiap `href="#x"` punya elemen `#x` (kalau targetnya
  ada, browser yang scroll).
- **Screen reader & axe/Lighthouse.** Tidak ada budget alat itu di task ini; aksesibilitas diperiksa di
  level semantik (h1/h2/h3, `<details>`/`<summary>` native, `aria-labelledby`, teks tautan).
- **Full suite.** Instruksi task minta test terarah supaya tidak bentrok dengan agent lain.

---

## Hasil per acceptance criteria

| # | Acceptance criteria | Hasil | Bukti |
|---|---|---|---|
| 1 | Ada section untuk tiap fitur F1–F16 (boleh dikelompokkan) | **PASS** | `guide.test.ts:19` (kode F1–F16 tepat sekali) + `GuidePage.qa.test.ts:21` (tiap `guideAnchor` benar-benar ada di DOM, teks memuat judul & badge status). `guide.ts:38-275` berisi 16 entri; grup `GUIDE_GROUPS` terisi (`guide.test.ts:33`). |
| 2 | FAQ + bagian backup/import-export + penjelasan E2EE & pemulihan ada dan benar sesuai kode | **PASS** (keberadaan & akurasi teknis) | `guide.qa.test.ts:45-95` (7 test hijau): 32 byte = `MASTER_KEY_BYTES`, 24 kata = `RECOVERY_WORD_COUNT`, prefiks `iprk1.` = `BACKUP_CODE_PREFIX`, min 12 karakter = `MIN_PASSPHRASE_LENGTH`, 5 percobaan & 5 menit = `RECOVERY_MAX_ATTEMPTS`/`RECOVERY_LOCK_MS`, `KEY_SLOTS = ['passkey']` (server tidak menyimpan kode pemulihan), QR disebut belum ada, "semua pembuka hilang → tidak bisa dipulihkan". FAQ 10 item + backup 3 blok + security 4 lapis dirender (`GuidePage.qa.test.ts:129`). **Catatan:** status F10 di dalam bagian backup salah — lihat AC 4. |
| 3 | Daftar isi bisa diklik (anchor valid, target ada, unik) | **PASS** | `GuidePage.qa.test.ts:37` (20 tautan = 16 fitur + keamanan + backup + FAQ + balik ke atas; semua `href` unik & targetnya ada), `:56` (tidak ada `id` ganda di halaman), `:64` (tiap tautan punya teks; tautan F1 memuat "F1" + "Jadwal"). `GuideToc.vue:24-25` membentuk `#panduan-<id>`. |
| 4 | Status fitur jujur: fitur yang belum jadi tidak diklaim "siap dipakai" (cek silang ke kode) | **FAIL** | **BUG-T15-01.** F10 berstatus `soon` + "Belum tersedia di versi ini" (`guide.ts:219-231`), blok backup "3. Export & import data — segera" (`guide.ts:375-377`), FAQ "Export/import data juga belum tersedia" (`guide.ts:420-423`). Kenyataannya: halaman + 2 kartu (`pages/app/import-export.vue:14,53-54`), composable export/import (`composables/useBackupExport.ts:33`, `useBackupImport.ts:42`), route & pintu nav (`utils/features.ts:84,101`, `shell/ShellUserMenu.vue:20`), dan lulus QA T12 putaran 2 (`reports/qa-t12-import-export.md:6`). Test merah: `guide.qa.test.ts:104`, `:112`, `:119`. Status `partial` untuk Goals & Journal **benar**: keduanya masih in-memory (`composables/useGoals.ts:16-21`, `composables/useMemos.ts:43-47`), dan `via` untuk Jadwal/Sticker benar (tidak ada `pages/app/jadwal.vue`/`sticker.vue`). |
| 5 | Tidak ada `v-html`/`innerHTML` dari data user; konten statis aman | **PASS** | `guide.qa.test.ts:139` memindai `panduan.vue`, `utils/guide.ts`, dan semua `components/features/guide/*.vue`: tidak ada `v-html`, `innerHTML`, `eval(`, `new Function`. `:149` memastikan copy tidak memuat markup/`<script`/`javascript:`. Manual: `grep -rn "v-html\|innerHTML" …` → kosong. Semua teks statis (tanpa input user/API). |
| 6 | Aksesibilitas dasar: heading terstruktur, FAQ `<details>` keyboard, tautan TOC punya teks jelas | **PASS** | `GuidePage.qa.test.ts:80` (tepat satu `h1`; level heading tidak melompat), `:95` (10 `<details>` native, tiap `<summary>` memuat pertanyaan, `tabindex` tidak dimatikan), `:64` (teks tautan terbaca), `:113` (tiap `article[aria-labelledby]` menunjuk `h3` yang ada). `GuideFaq.vue:14-20` memakai `<details>/<summary>` native; `GuideToc.vue:30` `<nav aria-label="Daftar isi">`. |
| 7 | Tidak ada regresi: `/app/panduan` menang atas `[feature].vue`; nav/menu bisa membuka halaman | **PASS** | `guideRouting.qa.test.ts:28` — `router.resolve('/app/panduan').matched` = `['/app/panduan']` (bukan `/app/:feature()`), sedangkan `/app/jadwal` tetap `['/app/:feature()']`. `ShellNavGuide.qa.test.ts:26` (menu HP) & `:36` (menu akun sidebar) menemukan tautan `/app/panduan` berlabel "Panduan". |

---

## Bug

### BUG-T15-01 — Panduan bilang Import/Export "belum tersedia", padahal fitur sudah jalan (High, blocking)

**Langkah reproduksi:**

1. Jalankan app, login, buka `/app/panduan` → scroll ke kartu **F10 Import / Export**.
2. Baca badge: "Segera", ringkasan: "Belum tersedia di versi ini…".
3. Buka blok **Backup & pindah data** → butir 3: "Export & import data — segera".
4. Buka menu akun (desktop) atau menu HP → klik **Import / Export** → halaman `/app/import-export`
   menampilkan kartu **Export data** dan **Import data**, keduanya berfungsi (mengunduh JSON / memilih
   berkas + pratinjau + mode gabung/ganti).

**Expected:** Panduan menyatakan F10 **siap dipakai** (punya `href` ke `/app/import-export`), dan bagian
backup menjelaskan export/import sebagai cara pindah/backup data yang **sudah ada** — dengan peringatan
plaintext yang memang sudah ditampilkan di kartu export. FAQ soal sync tidak boleh menyimpulkan
"export/import belum tersedia".

**Actual:**

```
guide.ts:219  id: 'import-export'
guide.ts:223  status: 'soon'            // badge "Segera"
guide.ts:225  summary: 'Belum tersedia di versi ini. Rencananya: export semua data...'
              (tidak ada `href`)
guide.ts:375  title: '3. Export & import data — segera'
guide.ts:376  body: 'Belum tersedia. Rencananya export menghasilkan satu JSON...'
guide.ts:422  answer: '... Export/import data juga belum tersedia, jadi pindah perangkat
              belum bisa lewat aplikasi.'
```

**Kenapa ini bug, bukan sekadar teks:** halaman dan seluruh jalurnya sudah ada dan teruji —
`apps/web/app/pages/app/import-export.vue:14,53-54`; `apps/web/app/composables/useBackupExport.ts:33-63`;
`apps/web/app/composables/useBackupImport.ts:42`; pintu nav `apps/web/app/utils/features.ts:84,101` dan
`apps/web/app/components/features/shell/ShellUserMenu.vue:23-26`; hasil QA sebelumnya
`reports/qa-t12-import-export.md:6` ("Putaran 2: LULUS"). AC T15 sendiri menyebut cek silang ke
Import/Export yang baru diperbaiki (`docs/PRD.md:1100`).

**Dampak:** user yang ingin backup sebelum ganti perangkat diberi tahu fiturnya tidak ada, padahal justru
itu jalur yang menyelamatkan datanya (kode pemulihan hanya membuka kunci, bukan memindahkan isi). Severity
**High** karena menyangkut keputusan backup/kehilangan data; perbaikannya kecil (copy + `href`).

**Bukti test (merah, sengaja tidak dilemahkan):**

```
FAIL app/utils/guide.qa.test.ts > status fitur jujur terhadap kode >
     Import / Export tidak dilabeli "soon" karena halamannya sudah jalan
  AssertionError: expected 'soon' not to be 'soon'            (guide.qa.test.ts:107)

FAIL ... > bagian backup tidak menyebut export/import sebagai "segera"
  AssertionError: expected '3. Export & import data — segera' not to match /segera/i
                                                              (guide.qa.test.ts:115)

FAIL ... > tidak ada FAQ yang mengklaim export/import belum tersedia
  AssertionError: expected '... Export/import data juga belum tersedia ...'
                                                              (guide.qa.test.ts:123)
```

**Saran perbaikan (untuk `dimas`, bukan QA):** ubah entri F10 jadi `status: 'ready'`, tambahkan
`href: getFeature('import-export').path`, hapus "Belum tersedia/Rencananya", ubah blok backup #3 jadi
"Export & import data — sudah ada" (sebut berkas JSON plaintext + batas ukuran), dan perbaiki kalimat FAQ
sync. Setelah itu tiga test di atas otomatis hijau tanpa diubah.

---

### BUG-T15-02 — FAQ mengklaim menu Jadwal & Sticker ada di navigasi (Low, non-blocking)

**Langkah reproduksi:**

1. Buka `/app/panduan` → bagian FAQ → pertanyaan "Kenapa menu Jadwal dan Sticker tidak punya halaman?".
2. Jawabannya: "… **Menu keduanya sudah ada di navigasi**, tetapi halaman khususnya belum jadi."
3. Periksa sidebar desktop dan menu HP: tidak ada entri Jadwal maupun Sticker.

**Expected:** kalimat menyebut jadwal dibuat dari Kalender dan sticker lewat tombol "Hias" (keduanya
benar), tanpa mengklaim ada menu navigasi.

**Actual:** `guide.ts:427` menyatakan menu keduanya ada. Faktanya grup `lainnya` tidak dirender sidebar
(`utils/features.ts:89` → `NAV_GROUPS = ['utama','rencana','fokus']`; `components/features/shell/ShellSidebar.vue:6`)
dan tidak masuk menu HP (`utils/features.ts:101` → `MOBILE_MENU_EXTRA_IDS = ['import-export','panduan','akun']`;
`ShellMenuSheet.vue:12`). Kalimat serupa juga menyesatkan di kartu F1: "Menu Jadwal belum punya halaman
sendiri" (`guide.ts:136`) — tidak ada menu Jadwal sama sekali.

**Dampak:** user mencari menu yang tidak ada. Severity **Low** (informasi navigasi, bukan data).
**Saran:** ganti dengan "Jadwal dibuat dari Kalender; sticker dipasang lewat tombol Hias — keduanya tidak
punya menu sendiri."

---

## Cek tiga pilar

**Keamanan — PASS.** Tidak ada `v-html`/`innerHTML`/`eval` di halaman maupun komponen
(`guide.qa.test.ts:139`); seluruh copy statis tanpa input user/API, jadi tidak ada jalur XSS. Tidak ada
`$fetch`/`useFetch` sehingga tidak ada data user yang masuk payload; halaman di bawah `/app/**` yang sudah
`ssr: false` (`nuxt.config.ts:158`). Copy tidak membocorkan rahasia: yang disebut hanya *format* prefiks
`iprk1.` dan jumlah kata, bukan isi kode user. Klaim "server tidak menyimpan kode pemulihan" konsisten
dengan `KEY_SLOTS = ['passkey']` (`packages/contracts/src/keys.ts:27`, diuji `guide.qa.test.ts:68`).

**Performa — PASS (terbatas bukti statis).** Halaman statis: nol request data, nol gambar, nol dependency
baru; hanya string dari `utils/guide.ts` (modul sudah ada di bundel route ini). Tidak ada `console.*`.
Lighthouse/CWV tidak diukur (tidak ada perubahan jalur panas; budget tetap tanggung jawab PR perf).
Sticky TOC hanya CSS (`position: sticky`), tidak memicu layout shift tambahan yang terukur di sini.

**Kerapian — PASS.** Komponen guide 66–185 baris (di bawah ~200), satu tanggung jawab per komponen,
`v-for` ber-`:key` stabil (`id`/`question`), tidak ada `v-if`+`v-for` di elemen yang sama, tipe eksplisit
(`GuideFeature`, `GuideLayer`, `GuideFaqItem`), `satisfies readonly GuideLayer[]`. `guide.ts` panjang
karena berupa konten terstruktur (bukan logika) dan justru memungkinkan typecheck + test menjaga cakupan
F1–F16. `eslint --max-warnings 0` untuk 4 file test baru: bersih; `nuxi typecheck`: exit 0.

---

## Perintah & hasil

Dijalankan di `apps/web`:

```bash
npx vitest run app/utils/guide.test.ts app/utils/guide.qa.test.ts \
  app/components/features/guide/GuidePage.qa.test.ts \
  app/components/features/shell/ShellNavGuide.qa.test.ts \
  app/utils/guideRouting.qa.test.ts
```

```
Test Files  1 failed | 4 passed (5)
     Tests  3 failed | 27 passed (30)
  Duration  3.39s
```

Rincian: `guide.test.ts` 6/6 hijau · `guide.qa.test.ts` 10/13 (3 merah = BUG-T15-01) ·
`GuidePage.qa.test.ts` 8/8 · `ShellNavGuide.qa.test.ts` 2/2 · `guideRouting.qa.test.ts` 1/1.

```bash
npx eslint app/utils/guide.qa.test.ts app/components/features/guide/GuidePage.qa.test.ts \
  app/components/features/shell/ShellNavGuide.qa.test.ts app/utils/guideRouting.qa.test.ts
# (tanpa output) exit 0

npx nuxi typecheck
# exit 0
```

Cek manual tambahan (grep): `v-html|innerHTML|console.` di `pages/app/panduan.vue`,
`components/features/guide/**`, `utils/guide.ts` → kosong; `useFetch|useAsyncData|$fetch|<img` → kosong
(selain komentar di file test).

---

## Coverage & celah yang tersisa

- Cakupan AC: 6/7 PASS, 1 FAIL (BUG-T15-01).
- Anchor TOC diuji struktural (target ada & unik). Perilaku scroll/highlight `:target` di browser nyata
  belum diuji (butuh Playwright; `ssr:false`).
- Aksesibilitas diuji di level semantik, belum dengan axe/screen reader. Catatan: judul grup TOC
  (`<p class="group-title">`) bukan heading — wajar untuk daftar isi, tapi kalau nanti TOC dijadikan
  landmark navigasi bertingkat, pertimbangkan `aria-labelledby`.
- Kebenaran status hanya diuji untuk F10 (yang terbukti menyimpang). `partial` Goals/Journal dan `via`
  Jadwal/Sticker diverifikasi manual dengan `path:line`; belum ada test yang mengikat klaim "in-memory"
  ke kode, karena source of truth-nya adalah composable yang butuh konteks Nuxt.
- Risiko sisa: copy Panduan mudah tertinggal saat fitur selesai (persis yang terjadi pada F10). Saran
  proses: jadikan `guide.qa.test.ts` bagian dari gate PR fitur — setiap kali status fitur berubah,
  test ini memaksa Panduan ikut diperbarui.

## Rekomendasi

1. **Blocking:** perbaiki tiga tempat di `apps/web/app/utils/guide.ts` (F10, blok backup, FAQ) → BUG-T15-01.
2. Non-blocking: perbaiki klaim menu Jadwal/Sticker → BUG-T15-02.
3. Setelah copy diperbarui, jalankan ulang 5 file test di atas; target 30/30 hijau tanpa mengubah test.

---

# Putaran 2 — verifikasi perbaikan (23 Okt 2026)

**Verdict: LULUS (dengan catatan non-blocking).**

Perbaikan `dimas` menutup dua bug putaran 1 dan tidak menyentuh test QA sama sekali. Semua acceptance
criteria T15 lulus terhadap kode di working tree saat review: 34/34 test hijau, F10 kini jujur dan
mengarah ke halaman yang benar-benar jalan, klaim menu Jadwal/Sticker sudah dikoreksi, dan status `ready`
yang dipakai (F2–F7, F9–F12, F16) terbukti sesuai kode.

Tiga temuan baru bersifat **copy** (bukan regresi T15): integrasi Goals (`#goal`, persistensi, progres
otomatis) baru mendarat di working tree dari task T18, sehingga Panduan yang baru diperbaiki kini basi ke
arah **sebaliknya** — menyebut goal masih in-memory padahal sudah persist. Rincian di §5.

Rules dibaca putaran 2: `CLAUDE.md` root, `.claude/rules/shared-security.md`,
`.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md` →
`apps/web/CLAUDE.md` → `apps/web/.claude/rules/{security,performance,code-quality}.md`, `docs/PRD.md`
F9/F10/F12/F13/F8 + baris AC T15 (`docs/PRD.md:1099`).

## 1. Perintah & hasil

Dijalankan di `apps/web` (Node `v24.18.0`, vitest `5.0.3`):

```bash
npx vitest run app/utils/guide.test.ts app/utils/guide.qa.test.ts \
  app/components/features/guide/GuidePage.qa.test.ts \
  app/components/features/shell/ShellNavGuide.qa.test.ts \
  app/utils/guideRouting.qa.test.ts
```

```
Test Files  5 passed (5)
     Tests  34 passed (34)
  Duration  3.37s
```

Rincian per file (reporter verbose): `guide.test.ts` **10/10** · `guide.qa.test.ts` **13/13** ·
`GuidePage.qa.test.ts` **8/8** · `ShellNavGuide.qa.test.ts` **2/2** · `guideRouting.qa.test.ts` **1/1**
= **34/34**. Tiga test yang merah di putaran 1 (`guide.qa.test.ts:104`, `:112`, `:119`) sekarang hijau
tanpa diubah.

```bash
npx eslint app/utils/guide.test.ts app/utils/guide.qa.test.ts \
  app/components/features/guide/GuidePage.qa.test.ts \
  app/components/features/shell/ShellNavGuide.qa.test.ts app/utils/guideRouting.qa.test.ts
# (tanpa output) exit 0

npx prettier --check app/utils/guide.ts app/utils/guide.test.ts \
  app/utils/guide.qa.test.ts app/components/features/guide/GuidePage.qa.test.ts \
  app/components/features/shell/ShellNavGuide.qa.test.ts app/utils/guideRouting.qa.test.ts
# All matched files use Prettier code style!
```

Bukti tambahan untuk klaim status (dijalankan karena `guide.ts:62`/`:439` menyebut Goals in-memory):

```bash
npx vitest run app/composables/useGoals.persistence.test.ts \
  app/composables/useGoals.source.qa.test.ts app/utils/goals.parity.qa.test.ts \
  app/utils/goals.links.qa.test.ts app/components/features/daily/dailyWidgets.qa.test.ts
# Test Files 5 passed (5) · Tests 24 passed (24)
```

## 2. Bukti test QA putaran 1 tidak dilemahkan

Keempat file test QA dibandingkan **byte-per-byte** dengan versi final putaran 1 (snapshot sesi QA
putaran 1 di `~/.local/share/opencode/snapshot/…/1fb94973:apps/web/app/…`, `git cat-file -p`):

| File | Hasil `diff -u` |
|---|---|
| `app/utils/guide.qa.test.ts` | IDENTIK |
| `app/components/features/guide/GuidePage.qa.test.ts` | IDENTIK |
| `app/components/features/shell/ShellNavGuide.qa.test.ts` | IDENTIK |
| `app/utils/guideRouting.qa.test.ts` | IDENTIK |

Jumlah test juga tidak berubah (13/8/2/1). Satu-satunya perubahan pada file itu setelah report putaran 1
ditulis adalah refactor path `process.cwd()` → `import.meta.url` lalu **dikembalikan lagi** oleh QA
putaran 1 sendiri (bukan oleh developer); tidak ada assertion yang dihapus, dilonggarkan, atau di-skip.
`grep -n "it.only\|it.skip\|describe.only"` di kelima file → kosong.

Test developer (`guide.test.ts`) bertambah 4 test (6 → 10) dan mengunci perilaku baru: F10 `ready` +
`href`, Daily `deadline akhir hari ini` + `Lihat N lagi` + larangan copy lama, dan larangan klaim menu
Jadwal/Sticker.

## 3. Bug putaran 1 — status akhir

### BUG-T15-01 — Import/Export "belum tersedia" → **FIXED**

`apps/web/app/utils/guide.ts:219-233`: F10 `status: 'ready'`, `href: getFeature('import-export').path`
(→ `/app/import-export`), ringkasan menyebut JSON terbaca + pratinjau + gabung/ganti semua + peringatan
tidak terenkripsi; tips menyebut batas 32 MB dan konfirmasi mode ganti. Blok backup
`guide.ts:377-378` "3. Export & import data — sudah ada" + batas 32 MB + pratinjau + konfirmasi. FAQ
`guide.ts:424` kini menyuruh pindah perangkat lewat Export → Import.

Cek silang ke kode (semua masih benar): halaman `pages/app/import-export.vue:14,53-54`; composable
`useBackupExport.ts:33`, `useBackupImport.ts:42`; batas `packages/core/src/io/backup.ts:45`
(`BACKUP_MAX_BYTES = 32 * 1024 * 1024`); ukuran diperiksa **sebelum** berkas dibaca
`utils/io/read-file.ts:21-31`; konfirmasi "ganti semua" `useBackupImport.ts:56-65`; pintu nav
`utils/features.ts:84,101` + `shell/ShellUserMenu.vue:25-26`.

### BUG-T15-02 — klaim menu Jadwal/Sticker → **FIXED**

`guide.ts:429`: "Keduanya tidak punya menu maupun halaman sendiri." `guide.ts:137` (kartu F1): "Jadwal
tidak punya menu maupun halaman sendiri". Konsisten dengan `utils/features.ts:97-101` (komentar:
`jadwal` & `sticker` sengaja tidak masuk menu) dan tidak adanya `pages/app/jadwal.vue`/`sticker.vue`.

## 4. Hasil per acceptance criteria (putaran 2)

| # | Acceptance criteria | Hasil | Bukti |
|---|---|---|---|
| 1 | Section untuk tiap F1–F16 | **PASS** | `guide.test.ts:19` (10/10 hijau) + `GuidePage.qa.test.ts:21` (tiap `guideAnchor` ada di DOM, memuat judul + badge status). |
| 2 | FAQ + backup/import-export + E2EE & pemulihan benar | **PASS** | `guide.qa.test.ts:45-95` (8 test) mengikat copy ke konstanta asli: `MASTER_KEY_BYTES`, `RECOVERY_WORD_COUNT`, `BACKUP_CODE_PREFIX='iprk1.'`, `MIN_PASSPHRASE_LENGTH`, 5 percobaan/5 menit, `KEY_SLOTS=['passkey']`, QR & sync "belum". FAQ 10 item, backup 3 blok, security 4 lapis (8/8 `GuidePage.qa.test.ts`). |
| 3 | Daftar isi bisa diklik (anchor valid & unik) | **PASS** | `GuidePage.qa.test.ts:37` (20 tautan = 16 fitur + keamanan + backup + FAQ + balik ke atas, semua `href` unik & targetnya ada), `:56` (tidak ada `id` ganda), `:64` (tautan F1 memuat "F1" + "Jadwal"). |
| 4 | Status fitur jujur; yang belum jadi tidak diklaim siap | **PASS** | Semua klaim `ready` diverifikasi ke kode: F2/F3 (`utils/tasks/persistence.ts`, `pages/app/eisenhower.vue:16,47-59`), F4 (`utils/pomodoro/persistence.ts`), F5 (`utils/countdown/persistence.ts`), F6 (`useCalendarData.ts:36-102`), F7 (`utils/habits/persistence.ts`), F9/F10/F11/F12/F16 (§4a di bawah). F8 tetap `partial` (benar: `useMemos.ts:42-46` in-memory), F13 `partial` (badge masih masuk akal, tapi kalimat rincinya basi → BUG-T15-03), F1/F14 `via` & F15 `partial` sesuai kode. |
| 5 | Tanpa `v-html`/`innerHTML` dari data user | **PASS** | `guide.qa.test.ts:140` memindai `panduan.vue`, `utils/guide.ts`, semua `components/features/guide/*.vue` untuk `v-html`/`innerHTML`/`eval(`/`new Function`; `:150` memastikan copy tanpa markup/`<script`/`javascript:`. Verifikasi manual `grep -rn "v-html\|innerHTML"` → kosong. |
| 6 | A11y dasar: heading, FAQ keyboard, tautan berteks | **PASS** | `GuidePage.qa.test.ts:80` (satu `h1`, tanpa lompatan level), `:95` (10 `<details>`/`<summary>` native, `tabindex` tidak dimatikan), `:64` (teks tautan), `:113` (tiap `article[aria-labelledby]` → `h3` yang ada). `GuideToc.vue:30` `<nav aria-label>`. |
| 7 | Tidak ada regresi route/nav | **PASS** | `guideRouting.qa.test.ts:28` (`/app/panduan` → `['/app/panduan']`, `/app/jadwal` → `['/app/:feature()']`), `ShellNavGuide.qa.test.ts:26,36` (menu HP + menu akun). |

### 4a. Cek F10 & F12 terhadap kode sekarang

- **F10 Import/Export — `ready` benar.** Halaman + 2 kartu (`pages/app/import-export.vue:14,53-54`),
  export/import nyata (`useBackupExport.ts:33-63`, `useBackupImport.ts:42-160`), batas 32 MB ditegakkan
  sebelum baca (`read-file.ts:21-31`), pratinjau + mode gabung/ganti + konfirmasi
  (`useBackupImport.ts:47-65`), pintu nav desktop & HP (`ShellUserMenu.vue:25`, `features.ts:101`).
- **F12 Daily — copy cocok dengan fix #28.** Quick add memakai deadline akhir hari
  (`useDailyRoutine.ts:153` + `utils/tasks.ts:26` `END_OF_DAY='23:59'`), task telat ikut tampil
  (`utils/dailyRoutine.ts:175-177`), daftar dilipat "Lihat N lagi" di Prioritas & To-do
  (`DailyPriorityList.vue:9-11,41-49`, `DailyTodoCard.vue:38-40,78-88`, `i18n/locales/id.json:173,182`),
  progres dari seluruh item (`DailyTodoCard.vue:25-26`), state harian persist per tanggal
  (`useDailyRoutine.ts:22-38`).

## 5. Temuan baru (non-blocking, copy vs kode)

### BUG-T15-03 — Panduan bilang data Goals hilang setelah reload, padahal sudah tersimpan (Medium)

**Langkah reproduksi:** buka `/app/panduan` → kartu **F13 Goals** ("Masih tahap awal: … datanya belum
tersimpan permanen dan progres dari task/habit/jadwal belum tersambung otomatis") → FAQ "Kenapa isi
jurnal dan goal hilang setelah reload?" ("Journal dan Goals … datanya baru bertahan selama sesi").
Lalu buat goal, isi task/habit/jadwal bertaut, reload → goal, chapter, dan progresnya tetap ada.

**Expected:** F13 berstatus `ready` (atau kalimatnya diperbarui: tersimpan terenkripsi + progres task/
habit/jadwal otomatis), dan FAQ memisahkan Journal (masih sesi) dari Goals (persist).

**Actual:** `apps/web/app/utils/guide.ts:62` dan `:439` masih menyatakan Goals in-memory. Kode sekarang
menyimpan goal/chapter ke repository terenkripsi (`useGoals.ts:35-49`, `:95-140`, `:196-235`;
`utils/goals/persistence.ts:1-40`), menghitung progres dari tautan nyata
(`utils/goals/persistence.ts:360,392`), memasang penanda goal/chapter di Kalender
(`useCalendarData.ts:74-100`), dan `composables/goals/mock.ts` sudah dihapus. Test persistensi/paritas/
tautan lulus 24/24 (§1).

**Dampak:** user diberi tahu datanya akan hilang, padahal aman — memicu keraguan, entri ulang, atau
menghindari Goals. Severity Medium. **Catatan penting:** perbaikan ini berasal dari task T18 yang belum
merge/QA; kalau integrasi Goals di-revert, temuan ini gugur. Jadi **selaraskan copy ini bersamaan dengan
merge T18**, jangan dulu sebelum itu. Ini bukan regresi perbaikan T15.

### BUG-T15-04 — Panduan Journal belum menyebut mention `#goal` (Low)

`apps/web/app/utils/guide.ts:184` hanya mengajari `@` untuk jadwal. Kode sekarang juga mendukung `#`
untuk goal: parser `utils/memo.ts:55`, query saran `utils/memo.ts:81,90`, picker
`MemoEditor.vue:70,181-183`, chip navigasi `MemoGoalMention.vue`. Tambahkan satu kalimat ("`#` untuk
menyebut goal"). Penghalangnya: test developer `apps/web/app/utils/guide.test.ts:101-106` mengunci
`expect(tips).not.toMatch(/tulis #/i)` — test itu perlu diubah bersamaan, kalau tidak, dokumentasi `#goal`
justru akan membuat test merah. (Test QA putaran 1 tidak mengunci ini.)

### BUG-T15-05 — Dua kalimat lain yang ikut basi karena integrasi Goals (Low)

- `guide.ts:170`: "perhitungan progres goal otomatis masih disiapkan" — sudah jalan
  (`packages/core/src/calc/goal.ts:99`, `utils/goals/persistence.ts:360`, form habit punya pemilih goal
  `HabitForm.vue:221-234`).
- `guide.ts:77`: Kalender disebut "tiga lapis data" (jadwal, task, countdown); sekarang juga menampilkan
  penanda goal/akhir chapter (`useCalendarData.ts:74-100`) dan memo/mood (`:104-114`).

Keduanya tidak menyesatkan soal keselamatan data, tapi membuat Panduan tertinggal dari fitur — persis
pola yang harus dicegah menurut rekomendasi putaran 1.

## 6. Cek tiga pilar (putaran 2)

**Keamanan — PASS.** Tidak ada `v-html`/`innerHTML`/`eval`, seluruh copy statis, nol `$fetch`/`useFetch`
di halaman (`grep` kosong; `guide.qa.test.ts:140,150` hijau). Copy hanya menyebut *format* kode
(`iprk1.`, 24 kata), bukan isi kode user. Klaim "server tidak menyimpan kode pemulihan" tetap konsisten
dengan `KEY_SLOTS = ['passkey']` (`packages/contracts/src/keys.ts`, diuji `guide.qa.test.ts:68-73`).

**Performa — PASS (statis).** Halaman statis: nol request data, nol gambar, nol dependency baru; hanya
string dari `utils/guide.ts` (modul di bundel route ini). Tidak ada `console.*`. Lighthouse/CWV tidak
diukur (tidak ada perubahan jalur panas pada perbaikan ini).

**Kerapian — PASS.** `guide.ts` 441 baris = konten terstruktur bertipe, komponen guide 66–185 baris
(< ~200), `v-for` ber-`:key` stabil, tanpa `v-html`, tanpa `console.*`. `eslint --max-warnings 0` dan
`prettier --check` hijau untuk kelima file test + `guide.ts`. Catatan kecil: `guide.qa.test.ts:151`
memakai `GUIDE_COPY` tanpa import eksplisit (mengandalkan auto-import Nuxt); berfungsi, tapi lebih jelas
kalau diimpor seperti simbol guide lain — tidak mengubah kekuatan assertion.

## 7. Coverage & rekomendasi

- Cakupan AC: **7/7 PASS**; bug putaran 1: **2/2 tertutup**; 3 temuan copy non-blocking (§5).
- Yang belum diuji: perilaku scroll/`:target` TOC di browser nyata (route `/app/**` `ssr: false`, butuh
  Playwright) dan axe/screen reader — sama seperti putaran 1, diganti assertion struktural.
- Celah yang terbukti: tidak ada test yang mengikat **klaim negatif** Panduan ke kode (Panduan bilang
  "belum tersimpan", kode sudah menyimpan). Ini yang lolos di putaran 2. Saran: tambahkan satu test di
  `guide.qa.test.ts` yang membaca penanda sumber (mis. `composables/goals/mock.ts` tidak ada + modul
  persistensi goals ada) atau, lebih tahan lama, jadikan `guide.test.ts`/`guide.qa.test.ts` bagian dari
  gate PR setiap task yang mengubah status fitur — termasuk T18.
- **Rekomendasi orchestrator:** T15 layak `done` (semua AC + bug putaran 1 beres, 34/34 hijau). Sisihkan
  BUG-T15-03/04/05 sebagai **satu task copy** yang dieksekusi bersamaan dengan merge T18 (F13 → `ready`,
  FAQ dipisah Journal vs Goals, `#goal`, "tiga lapis" → daftar penanda), atau subtask T18 bila lebih
  rapi. Jangan biarkan temuan ini hilang di komentar.
- File yang diubah QA putaran 2: **hanya report ini**. Tidak ada kode produk, test, fixture, config, atau
  status Ergonio yang disentuh; tidak ada commit.
