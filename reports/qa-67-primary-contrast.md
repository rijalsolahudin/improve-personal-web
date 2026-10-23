# QA #67 — Kontras teks & ikon di permukaan `--primary`

- **Task Ergonio:** #67 (project `personal-productivity`) — id `e5996a85-6ff3-4eeb-9d5d-add6c3e4a493`
- **Turunan dari:** sisa risiko #62 (`reports/qa-62-contrast.md` §3.4, §9)
- **Tanggal:** 2026-10-24
- **QA:** Fajar
- **Build diuji:** working tree (belum commit) di atas `765369d`. Diff #67 = 7 file (5 komponen + 2 file test) + **0 perubahan nilai token**.
- **Rules dibaca:** `CLAUDE.md` root · `.claude/rules/shared-code-quality.md` · `.claude/rules/ergonio-status-flow.md` · `apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{security,performance,code-quality}.md` · `reports/qa-62-contrast.md` · komentar handoff #67
- **Skrip QA (tidak di-commit):** `/tmp/opencode/qa67/{contrast,detail,scan,weather}.ts` + `backup/` (salinan file untuk uji mutasi). Rumus luminansi relatif WCAG 2.1 ditulis ulang sendiri; **tidak** memakai `contrastRatio()` milik repo dan **tidak** memakai satu pun angka dari handoff.

---

## Verdict

## **LULUS DENGAN CATATAN**

Kedua acceptance criteria #67 terpenuhi, diverifikasi ulang dari sumber token dan dari pemakaian nyata (bukan dari angka handoff):

1. **Teks yang dirender di permukaan `--primary` semuanya ≥ 4,5:1 di 21 kombinasi.** Dari 9 token teks × 21 kombinasi = **189 hitungan**, hanya `--ink` (min **7,722**) dan `--deeper` (min **5,088**) yang lulus; 7 token lain gagal (53/189 < 4,5). Pindai seluruh `apps/web/app/**/*.vue` + verifikasi manual tiap turunan: **semua teks di atas `--primary` memakai `--ink` atau `--deeper`** — tidak ada satu pun yang tersisa di `--deep`/`--mute*`/`--accent`/`--paper`.
2. **Pasangan `--primary` sudah masuk test kontras tokens** (`PRIMARY_PAIRS`, ambang `STATE_MARGIN` 4,62) dan **benar-benar menghitung**: menambahkan `deep` ke daftar itu memerahkan test dengan nilai asli 3,97/4,39.
3. **Anti-regresi identik baseline QA #62:** 441 pasangan permukaan utama min **4,506** (0 < 4,5), 525 pasangan state min **4,624** (0 < 4,5, 0 < 4,62). Semua 21 nilai per-pasangan sama dengan tabel #62 §3.2–3.3.
4. **Ikon cuaca (non-teks) 5,088–11,831:1** (ambang 1.4.11 = 3:1), dan jenis cuaca tetap terbaca lewat 4 bentuk ikon berbeda + `aria-label`/`title`/`aria-pressed`.
5. **Gerbang hijau:** tokens 33/33, web `ui`+`features` 40 file/177 test, `nuxt typecheck` exit 0, eslint & prettier bersih.

**Catatan non-blocking (semua P3/Low, tidak menahan `done`):**
- Penjaga statis `primarySurface.qa.test.ts` **parsial**: hanya 1 aturan yang punya `background: var(--primary)` + `color` dalam rule yang sama (`DailyWeatherPicker .option.on`); 11 kontainer `--primary` lain dijaga lewat 5 entri allowlist turunan. Teks turunan lain (`.now-title`, `.lead-text`, `.heading`, `.next-title`, `.date`, `.hand`, `.swap`) saya verifikasi **manual** = warisan `--ink` (aman hari ini), tapi regresi barunya tidak akan tertangkap test. Rekomendasi §8.
- Bar warna cuaca di `DailyWeatherPicker` 1,14–5,38:1 (warna "cerah" `#E6A800` < 3:1 di 21/21 kombinasi) → **dekoratif & redundan**, jadi bukan pelanggaran 1.4.11, tapi di cute/ungu bar itu praktis tak terlihat (1,14:1).
- `StatTile` dan `Card variant="primary"` **tidak dipakai** di app (dead code pre-existing, sudah tercatat di #62). Dua test mount-nya berguna sebagai jaring, bukan bukti regresi UI nyata.
- `.marker-tile` (`CalendarDayPanel.vue:289`) masih `--paper` di atas warna kategori solid (2,03–4,45) — pre-existing #62 §4.4, `aria-hidden`, teks label membawa maknanya.

---

## 1. Scope & test plan

**Diuji (dengan eksekusi):**

| # | Yang diuji | Metode |
|---|---|---|
| 1 | 21 kombinasi (7 gaya × 3 tema) token efektif `palette` + `themes[tema]` + `uiStyles[gaya].neutrals` + `brand[tema]` | skrip sendiri, WCAG 2.1 ditulis ulang |
| 2 | 9 token teks @ `--primary` (189 hitungan), ambang 4,5 **dan** 4,62 | idem |
| 3 | Anti-regresi 441 permukaan utama + 525 state vs baseline #62 | idem, banding per pasangan |
| 4 | Pemakaian nyata: pindai `var(--primary)` di seluruh `apps/web/app/**` (`.vue`, `.css`, `.ts`) + telusuri tiap turunan yang merender teks | replikasi regex penjaga + baca kode |
| 5 | Ikon cuaca non-teks (1.4.11) + cara jenis cuaca dikomunikasikan | hitung + baca template/`aria-*` |
| 6 | Kualitas test: menghitung vs hardcode, `.only`/`.skip`, cakupan pemindaian | baca kode + 3 uji mutasi |
| 7 | Klaim "0 nilai token diubah" | `git diff -U0` pada `colors.ts`/`styles.ts` |

**Tidak diuji (dan alasannya):**
- **Render piksel / axe di browser** — kontras diukur di level token + aturan CSS yang benar-benar dipakai, bukan screenshot. Butuh server; axe juga lemah pada `color-mix`/`opacity`. Kandidat penguatan berikutnya.
- **Mobile (React Native)** — token dipakai bersama, tapi tidak ada perubahan layout mobile di #67.
- **`--dash` sebagai latar teks, pola `opacity` state selesai, `paper` di warna kategori solid** — sudah dianalisis di #62 dan tetap di luar lingkup #67.

---

## 2. Hasil per acceptance criteria

| AC #67 | Status | Bukti |
|---|---|---|
| Semua teks di permukaan primary ≥ 4,5:1 di 21 kombinasi | **PASS** | §3.1 (token) + §4 (pemakaian): hanya `ink`/`deeper` yang dipakai; min 5,088 |
| Pilih `--deeper`/token teks yang tepat di komponen | **PASS** | §4: `.dow`, `.kicker`, `.next-label`, `.next-time`, `StatTile .label`, ikon cuaca → `--deeper`; judul → `--ink` |
| Ikon cuaca non-teks ≥ 3:1 & jenis tetap terbaca | **PASS** | §4.2: ikon 5,088 min; 4 bentuk ikon + `aria-label`/`title`/`aria-pressed` |
| Tambah pasangan ke test kontras tokens | **PASS** | §6.1: `PRIMARY_PAIRS` + ambang 4,62; mutation membuktikan menghitung |
| Tanpa menurunkan pasangan lama | **PASS** | §5: 441 min 4,506 / 525 min 4,624 identik #62; 0 nilai token berubah |

---

## 3. Angka ukur sendiri — token @ `--primary`

Rumus: luminansi relatif WCAG 2.1, `(L_terang+0,05)/(L_gelap+0,05)`. Ambang teks normal = 4,5:1 (SC 1.4.3); ambang tambahan repo `STATE_MARGIN` = 4,62:1. Semua teks di primary berukuran 9,5–28px, jadi ambang "large text" 3:1 tidak dipakai.

### 3.1 Ringkasan per token (21 kombinasi × 9 token = 189 hitungan)

| Token teks | Min | Terendah di | < 4,5 | < 4,62 | Status |
|---|---|---|---|---|---|
| `--ink` | **7,722** | cute/ungu | 0/21 | 0/21 | **LULUS** (dipakai untuk judul) |
| `--deeper` | **5,088** | cute/hijau | 0/21 | 0/21 | **LULUS** (dipakai untuk label/caption/ikon) |
| `--ink-2` | 4,589 | cute/ungu | 0/21 | **1/21** | Lulus AA, sengaja **tidak** diizinkan (margin tipis) |
| `--mute-2` | 4,149 | cute/ungu | **2/21** | 2/21 | gagal — 0 pemakaian di primary |
| `--deep` | 3,975 | cute/hijau | **2/21** | 3/21 | gagal — **sudah dipindah semua** |
| `--mute` | 3,824 | cute/ungu | **3/21** | 6/21 | gagal — 0 pemakaian |
| `--accent` | 3,575 | cute/ungu | **15/21** | 16/21 | gagal — 0 pemakaian |
| `--mute-3` | 3,573 | cute/ungu | **10/21** | 15/21 | gagal — 0 pemakaian |
| `--paper` | 1,015 | kertas/hijau | **21/21** | 21/21 | gagal (teks putih di pastel) — 0 pemakaian |

**Total: 53/189 hitungan < 4,5** dan **64/189 < 4,62**. Dua token yang diizinkan menyisakan **≥ 0,47** di atas AA.

### 3.2 Kombinasi yang gagal (ambang 4,62, dipakai sebagai pagar)

```
ink        0/21
deeper     0/21
ink-2      1/21  cute/ungu 4,59
mute-2     2/21  cute/hijau 4,34 · cute/ungu 4,15
deep       3/21  cute/kuning 4,55 · cute/hijau 3,97 · cute/ungu 4,39
mute       6/21  cute/kuning 4,31 · cute/hijau 4,10 · cute/ungu 3,82 ·
                 cute-pure/ungu 4,53 · simple/ungu 4,55 · tegas/ungu 4,52
accent    16/21  cute/kuning 3,96 · cute/hijau 3,78 · cute/ungu 3,57 ·
                 cute-pure/kuning 4,28 · cute-pure/hijau 4,35 · cute-pure/ungu 4,21 ·
                 simple/kuning 4,28 · simple/hijau 4,35 · simple/ungu 4,21 ·
                 elegan/kuning 4,52 · elegan/ungu 4,42 · vintage/kuning 4,43 ·
                 vintage/hijau 4,37 · tegas/kuning 4,28 · tegas/hijau 4,35 · tegas/ungu 4,21
mute-3    15/21  cute/kuning 3,98 · cute/hijau 3,81 · cute/ungu 3,57 ·
                 cute-pure/kuning 4,55 · cute-pure/ungu 4,20 · simple/kuning 4,56 ·
                 simple/ungu 4,21 · elegan/kuning 4,55 · elegan/hijau 4,48 ·
                 elegan/ungu 4,42 · vintage/kuning 4,48 · vintage/hijau 4,53 ·
                 vintage/ungu 4,33 · tegas/kuning 4,54 · tegas/ungu 4,19
paper     21/21  1,015 (kertas/hijau) … 1,776 (cute/ungu)
```

Nilai ini **sama persis** dengan §3.4 / komentar test hasil #62 → tidak ada token yang bergerak, dan perbaikan #67 memang harus di sisi pemakaian.

---

## 4. Pemakaian nyata

### 4.1 Pindai seluruh app

`grep "var(--primary)"` pada `apps/web/app/**` (semua `.vue`/`.css`/`.ts`) → **12 aturan berlatar `--primary`**, 0 pemakaian `color: var(--primary)`. Tiap turunan yang merender teks saya telusuri manual:

| Lokasi | Teks / elemen | Warna efektif | Min @ 21 kombinasi | Status |
|---|---|---|---|---|
| `CalendarDayPanel.vue:258` `.dow` | eyebrow hari (11px) | `--deeper` | **5,088** | aman (sebelumnya `--deep` 3,975) |
| `CalendarDayPanel.vue:263` `.date` | tanggal (28px) | warisan body `--ink` | **7,722** | aman |
| `CalendarDayPanel.vue:270` `.counts` | hitungan (14px) | `--deeper` | **5,088** | aman |
| `CalendarDayPanel.vue:277` `.marker` | teks penanda (13px) | `--ink` di atas putih 55% + primary | **10,957** | aman (saya blend kanal: 21/21 ≥ 10,95) |
| `CalendarDayPanel.vue:289` `.marker-tile` | glyph `aria-hidden` di warna kategori | `--paper` @ `--cat-*`/schedule | 2,03–4,45 | pre-existing #62 §4.4 — dekoratif, makna dibawa teks `p.marker` |
| `DailyNowStrip.vue:111` `.now-title` | judul blok (22px) | warisan `--ink` | **7,722** | aman |
| `DailyNowStrip.vue:118` `.now-meta` | meta 12,5px | `--deeper` | **5,088** | aman |
| `DailyNowStrip.vue:161` `.hand` | tulisan tangan | warisan `--ink` | **7,722** | aman |
| `DailyWeatherPicker.vue:56` `.option.on` | ikon cuaca 18px (non-teks) | `--deeper` | **5,088** | aman (1.4.11: ≥ 3) |
| `DailyWeatherPicker.vue:37,52` `.option`, `:hover` (tidak terpilih) | ikon di `--paper`/`--hover` | `--mute-2` | 6,969 / 5,732 | aman |
| `DailyWeatherPicker.vue:66` `.option.on::after` | bar warna cuaca 3px | `--weather-color` | 1,14–5,38 | **dekoratif/redundan** (§4.2) |
| `JournalIntentions.vue:129` `.lead-text` | kalimat pembuka (20px) | warisan `--ink` | **7,722** | aman |
| `LandingSteps.vue:45` `.kicker` | kicker caption | `--deeper` | **5,088** | aman (sebelumnya `--deep`) |
| `LandingSteps.vue:53` `.heading` | judul 34–52px | warisan `--ink` | **7,722** | aman |
| `LandingPreviewCard.vue:124` `.next-label` | label uppercase kecil | `--deeper` | **5,088** | aman (sebelumnya `--deep`) |
| `LandingPreviewCard.vue:130` `.next-title` | judul kartu | warisan `--ink` | **7,722** | aman |
| `LandingPreviewCard.vue:137` `.next-time` | caption | `--deeper` | **5,088** | aman |
| `LandingPreviewCard.vue:218` `.done .box` | kotak centang 22px (✓) | warisan `--ink` | **7,722** | aman |
| `DecoStickerItem.vue:200` `.swap` | glyph tombol 28px `⇄` | warisan `--ink` | **7,722** | aman |
| `StatTile/index.vue:77` `.value` | angka | `--deeper` | **5,088** | aman (sudah begitu sebelumnya) |
| `StatTile/index.vue:96` `.label` | label 13–19px | `--deeper` | **5,088** | aman (sebelumnya `--deep` 3,975) |
| `Card/index.vue:56` `.card-primary` | isi slot | warisan `--ink` | **7,722** | aman (komponen tak dipakai) |
| `BrandMark/index.vue:58` `.tile-primary` | huruf logo | `--logo-fg` `#FFF` @ `--logo-bg` `var(--accent)`; fallback `--ink`@`--primary` | **5,545** / 7,722 | aman — bukan permukaan primary di gaya berdekorasi |

Teks yang duduk di atas permukaan lain **di dalam** kontainer primary (Input `--paper`, `.step`/`.next` `--paper-2`, tombol `--accent`, kartu `#fffbf4`) tidak dihitung sebagai teks di atas primary.

### 4.2 Ikon cuaca — 1.4.11 dan keterbacaan jenis

- **Ikon terpilih**: `color: var(--deeper)` (`DailyWeatherPicker.vue:56-65`) → **5,088–11,831:1** di 21 kombinasi (min cute/hijau). Sebelumnya `#E6A800` 1,14 · `#E07A10` 1,64 · `#6B7A90` 2,37 · `#0A55E6` 3,30 (cute/ungu) — gagal 3:1 untuk 3 dari 4 jenis.
- **Jenis cuaca tidak bergantung warna**: `WEATHER_META` memberi 4 ikon berbeda (`sun`, `cloud-sun`, `cloud`, `cloud-rain`), tombol punya `:title`, `:aria-label` (`daily.weather.<kind>`), dan `:aria-pressed`. Bar `::after` hanya pengulang warna.
- **Bar warna** (`DailyWeatherPicker.vue:66-77`) 1,14–5,38:1. Rincian: `cerah #E6A800` 1,14–1,87 (gagal 3:1 di **21/21**), `berawan #E07A10` 1,64–2,67 (21/21 gagal), `mendung #6B7A90` 2,37–3,87 (gagal di **6/21**: cute ×3 + vintage ×3), `hujan #0A55E6` 3,30–5,38 (21/21 lulus). Karena informasi warna **redundan** (bentuk ikon 4 macam + `aria-label`/`title` + `aria-pressed`), 1.4.11 tidak menuntutnya ≥ 3:1. Trade-off ditulis eksplisit di komentar komponen. Catatan Low: di cute/ungu bar `#E6A800` (1,14) praktis tak terlihat → warna sebagai *signature* hilang di kombinasi itu; kalau desain ingin warna tetap terbaca, beri outline `--outline` atau naikkan ukuran bar.

### 4.3 Klaim "0 nilai token diubah" — diverifikasi

`git diff -U0 packages/tokens/src/{colors,styles}.ts` → hanya 20 deklarasi (19 pasangan nilai) milik #62: `mute-3`×10, `accent`×7, `ink-2`×2. **Tidak ada baris `primary` yang berubah** (grep `^[+-].*primary` → kosong). Jadi perbaikan #67 memang murni di komponen + test.

---

## 5. Anti-regresi vs baseline QA #62

| Matriks | Total hitungan | Min | Terendah di | < 4,5 | < 4,62 | Baseline #62 | Identik? |
|---|---|---|---|---|---|---|---|
| 441 permukaan utama (21 pasangan × 21) | 441 | **4,506** | `placeholder`@`paper`, kertas/ungu | **0** | 66 (informasi baru) | min 4,506, 0 < 4,5 | **ya** |
| 525 state (25 pasangan × 21) | 525 | **4,624** | `accent`@`soft`, cute-pure/hijau | **0** | **0** | min 4,624, 0 < 4,5, 0 < 4,62 | **ya** |

Per-pasangan (21 nilai) juga sama dengan tabel #62 §3.2–3.3, mis. `mute-3`@paper 5,389 · `mute-3`@bg 5,175 · `accent`@bg 5,124 · `ink-2`@dash 4,627 · `mute-3`@soft 4,636 · `accent`@soft 4,624. **Tidak ada satu pun pasangan lama yang turun** — sesuai AC "tanpa menurunkan pasangan lama".

---

## 6. Uji mutasi (bukti test benar-benar menjaga)

Mutasi dilakukan dengan **backup + restore byte-identik** (`sha256sum` dibandingkan sebelum/sesudah); tidak ada perubahan yang tertinggal.

| # | Mutasi | Hasil | Bukti |
|---|---|---|---|
| 1 | `CalendarDayPanel.vue` `.dow`: `--deeper` → `--deep` (diminta task) | **MERAH** seperti diharapkan | `primarySurface.qa.test.ts:101` → `/components/features/calendar/CalendarDayPanel.vue · .dow · color: --deep`; 1 failed / 3 passed. Dipulihkan (sha256 `f251b51…` sama) → 4/4 hijau |
| 2 | `Card/index.vue` `.card-primary` + `color: var(--deep)` (menguji jalur SAME_RULE, bukan allowlist) | **MERAH** | `/components/ui/Card/index.vue · .card-primary · color: --deep`; dipulihkan (sha256 `ada8f78…` sama) |
| 3 | Salinan `packages/tokens` di `/tmp`, tambah `{ fg: 'deep', bg: 'primary' }` ke `PRIMARY_PAIRS` | **MERAH** dengan nilai asli | `cute/hijau … deep (#2F6A24) di primary (#A8D69A) = 3.97:1`, `cute/ungu … = 4.39:1`; salinan lulus 32/33 selain itu. Repo tidak disentuh |

Kesimpulan: gerbang `contrast.qa.test.ts` **menghitung** token efektif (bukan hardcode), dan penjaga `primarySurface.qa.test.ts` menangkap kedua pola (rule sama & turunan ber-allowlist).

---

## 7. Perintah & hasil (apa adanya)

| # | Perintah | Hasil |
|---|---|---|
| 1 | `pnpm --filter @improve-personal/tokens exec vitest run` | **exit 0** — `Test Files 3 passed (3) · Tests 33 passed (33)` (207 ms) |
| 2 | `pnpm --filter @improve-personal/web exec vitest run app/components/ui app/components/features` | **exit 0** — `Test Files 40 passed (40) · Tests 177 passed (177)` (12,8 s) |
| 2b | `… vitest run app/components/features/primarySurface.qa.test.ts` (sebelum/sesudah mutasi) | 4 passed → **1 failed** (mutasi #1) → 4 passed setelah dipulihkan |
| 3 | `npx nuxt typecheck` (cwd `apps/web`) | **exit 0**, tanpa output |
| 4 | `npx eslint app/components/ui app/components/features --max-warnings 0` (cwd `apps/web`) | **exit 0** |
| 4b | `npx eslint src/contrast.qa.test.ts --max-warnings 0` (cwd `packages/tokens`) | **exit 0** |
| 5 | `npx prettier --check <7 file terkait>` | **exit 0** — "All matched files use Prettier code style!" |
| 6 | `grep -nE "\.(only|skip)\(" contrast.qa.test.ts primarySurface.qa.test.ts` | kosong (exit 1) |
| 7 | `tsx /tmp/opencode/qa67/{contrast,detail,scan,weather}.ts` | tabel §3–§5 |
| 8 | `git diff -U0 packages/tokens/src/{colors,styles}.ts` | hanya 20 deklarasi #62; 0 baris `primary` |

Tidak ada test yang saya longgarkan, hapus, atau `skip`. Tidak ada file produk yang berubah (dua file yang dimutasi dipulihkan byte-identik).

---

## 8. Temuan (urut severity)

| # | Severity | Temuan | Bukti | Dampak |
|---|---|---|---|---|
| F1 | **Low (P3)** | Penjaga statis parsial: `SAME_RULE` hanya menemukan **1** aturan (`.option.on`); dari 12 kontainer `--primary`, 11 tidak dijaga test dan hanya 5 turunan masuk `DESCENDANT_TEXT`. Teks turunan lain aman **karena warisan `--ink`**, bukan karena dijaga. | `primarySurface.qa.test.ts:58-83`, replikasi pindai `/tmp/opencode/qa67/scan.ts`; `DailyNowStrip.vue:111,118,161`, `JournalIntentions.vue:129`, `LandingSteps.vue:53`, `LandingPreviewCard.vue:130`, `CalendarDayPanel.vue:263` | Regresi baru (mis. `.strip .hand { color: var(--mute) }`) lolos CI. Tidak memblokir #67 karena pemakaian sekarang bersih. Saran: tambahkan 7 selector itu ke `DESCENDANT_TEXT`, atau pindai turunan per-kontainer (selector yang mengandung kelas kontainer primary + `color:`). |
| F2 | **Low** | Bar warna cuaca 1,14–5,38:1; di cute/ungu `#E6A800` = 1,14 → warna "cerah" tak terlihat. Sah secara 1.4.11 karena redundan (bentuk ikon + `aria-label`), tapi hilang sebagai isyarat visual. | `DailyWeatherPicker.vue:66-77`, tabel §4.2 | Kosmetik/desain; trade-off sudah ditulis di komentar. Kalau ingin warna terbaca: outline `--outline` pada bar atau perbesar. |
| F3 | **Low (P3)** | `StatTile` dan `Card variant="primary"` tidak dipakai di app → dead code. Test mount keduanya menjaga komponen yang tidak dirender user. | `grep "<StatTile"` kosong; `grep variant="primary"` pada `<Card` kosong; `StatTile/index.vue:1-26`, `Card/index.vue:56-59` | Tidak ada risiko user; kandidat hapus/keeper keputusan produk. Sudah tercatat #62 §4.4.3. |
| F4 | **Low (P3)** | `.marker-tile` (`--paper` di atas warna kategori solid 2,03–4,45) ada di dalam blok primary. `aria-hidden` dan makna dibawa teks `p.marker`. | `CalendarDayPanel.vue:289-299` | Pre-existing, di luar lingkup #67; bagian dari audit kontras kategori (calon task #62 §4.4.1). |

Tidak ada temuan Critical/High/Medium. Tidak ada bug yang perlu reproduksi langkah UI — semua terukur di level token/CSS.

---

## 9. Tiga pilar

| Pilar | Penilaian |
|---|---|
| **Keamanan** | Netral. Tidak ada permukaan baru: hanya nilai `color` di komponen + 1 file test statis. Tidak menyentuh auth/input/secret/`v-html`. |
| **Performa** | Netral, sedikit positif: 0 byte JS/CSS tambahan (satu properti `color` diganti nama token, satu `position: relative` + pseudo-element 3px), 0 dependency baru. `primarySurface.qa.test.ts` membaca ~40 `.vue` sekali saat import; suite `ui`+`features` tetap 12,8 s dan tokens 207 ms. Tidak ada render tambahan (bar `::after` hanya muncul pada opsi terpilih). |
| **Kerapian** | Baik. Perbaikan di titik pemakaian (bukan menambal token), alasan "kenapa" ditulis di tiap komentar (`--deep` 3,98 vs `--deeper` 5,09), ambang diekstrak (`STATE_MARGIN`), daftar token yang diizinkan jadi konstanta (`ALLOWED_ON_PRIMARY`), matriks di-loop. Sisa: penjaga statis parsial (F1) + dead code pre-existing (F3). |

---

## 10. Celah test yang tersisa & rekomendasi

1. **Perluas `DESCENDANT_TEXT`** (paling murah, 7 entri) supaya teks turunan yang sekarang hanya "aman karena warisan" ikut dijaga: `DailyNowStrip .now-title/.now-meta/.hand`, `JournalIntentions .lead-text`, `LandingSteps .heading`, `LandingPreviewCard .next-title`, `CalendarDayPanel .date`. Aturan yang diharapkan: `--ink` **atau** `--deeper`.
2. **Pindai turunan, bukan allowlist**: deteksi aturan yang selectornya mengandung kelas kontainer (``.summary `, `.strip `, `.board `, `.section `, `.next `, `.tile-primary `, `.card-primary `) lalu wajibkan `color` ∈ allowlist. Lebih tahan terhadap penambahan elemen baru, tapi butuh parser CSS sederhana (bukan regex satu rule).
3. **Verifikasi browser sekali** (opsional): axe/Playwright pada `/` dan `/app` di cute × 3 tema untuk menangkap efek `dot-grid`, `opacity`, dan warna kategori yang tidak terlihat dari token.
4. **`ink-2` sebagai teks di primary**: sekarang dilarang allowlist walau lulus AA (4,589). Keputusan ini benar (margin 0,011 ke 4,5 terlalu tipis), tapi kalau nanti ada kebutuhan kontras di primary, naikkan `--deeper`/token-nya, jangan turunkan ambang.
5. **Tutup F3** (StatTile/Card primary dead code) dan **F4** (paper di warna kategori solid) lewat task terpisah yang sudah diusulkan #62 §9.

---

## 11. Ringkasan bukti untuk komentar task

- Primary: `ink` 7,722 · `deeper` 5,088 · `ink-2` 4,589 · `mute-2` 4,149 · `deep` 3,975 · `mute` 3,824 · `accent` 3,575 · `mute-3` 3,573 · `paper` 1,015 (min 21 kombinasi). Hanya `ink`/`deeper` dipakai nyata.
- Anti-regresi: 441 min **4,506** (0 < 4,5) · 525 min **4,624** (0 < 4,5, 0 < 4,62) — identik #62. 0 nilai token berubah.
- Mutasi: `.dow` → `--deep` = merah; `Card .card-primary` + `--deep` = merah; `PRIMARY_PAIRS` + `deep` = merah (3,97/4,39). Semua dipulihkan.
- Gerbang: tokens 33/33 · web ui+features 40 file/177 test · `nuxt typecheck` exit 0 · eslint & prettier bersih · tanpa `.only`/`.skip`.
- Catatan: penjaga statis parsial (F1), bar warna cuaca dekoratif (F2), dead code `StatTile`/`Card primary` (F3), `.marker-tile` pre-existing (F4).
