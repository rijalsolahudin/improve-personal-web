# QA #53 — Perf ekspansi recurrence untuk seri lama (C1 T9)

**Task:** Ergonio #53 `Perf ekspansi recurrence untuk seri lama (C1 T9)` — `stackinnov/personal-productivity`
**Tanggal:** 23 Okt 2026 · **QA:** Fajar
**Status saat diuji:** `review` (orchestrator pemegang transisi status; QA tidak memindahkan/mengomentari)
**Commit yang diuji:** `6ed5a10` *perf(core): fast-forward ekspansi recurrence untuk seri lama* (ancestor HEAD
`765369d`). Isi `packages/core/src/recurrence/{expand.ts,expand.test.ts,expand.perf.test.ts}` **identik**
antara `6ed5a10` dan working tree (`git diff 6ed5a10 HEAD -- packages/core/src/recurrence` = kosong).
**Tree:** working tree bersama agent lain. Saat QA mulai sudah ada perubahan **bukan dari QA ini**
(`M apps/web/app/composables/useBackupImport.ts`, `M apps/web/app/utils/guide.qa.test.ts`,
`M packages/core/src/io/io.goal-invariants.test.ts`, + beberapa test/report baru). QA tidak menyentuhnya.
Satu-satunya file yang QA tulis di repo: report ini.
**Environment:** Linux, Node v24.18.0, pnpm 11.17.0, vitest 5.0.3, Nuxt 4.5.2 / `@nuxt/test-utils` 4.3.3.

Rules dibaca: `CLAUDE.md` root, `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`,
`apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{performance,code-quality}.md`.
Rules mobile **tidak** dimuat (task tidak menyentuh `apps/mobile`).

---

## Verdict: **LULUS**

Semua AC-A (#53.1 … #53.5) hijau dan saya buktikan sendiri, bukan mengutip handoff:

- Fast-forward benar-benar dipakai: `seek()` melompat langsung ke dekat rentang (`startIndex` harian 2.065
  untuk seri 2020 → Sep 2025; mingguan minggu ke-295; bulanan bulan ke-68), bukan walk dari seed.
- Cold path 500 kejadian turun **~194 → ~6 ms** (core), dan **datar terhadap umur seri**: seed 2020 = 6,5 ms,
  seed 2000 = 5,9 ms. Di engine lama angka yang sama naik 194 → 912 ms.
- Paritas **1.019 kasus / 24.009 kejadian / 6 timezone** (termasuk DST New York, Berlin, Sydney, Santiago)
  **identik byte-per-byte** dengan engine `6ed5a10^` — tanggal, urutan, durasi, `until_date`, `after_count`,
  `MAX_OCCURRENCES_PER_EXPANSION`, seri mingguan multi-hari, bulanan tgl 29–31.
- Tidak ada bug. Dua risiko AC-B dinilai **non-blocking** (terukur, di luar jalur render).
  Catatan non-blocking lain: angka "sebelum" di deskripsi task (240/477/471 ms) tidak bisa direproduksi —
  baseline terukur 194–212 ms. Arah & besaran perbaikan tidak berubah.

> Report pass sebelumnya untuk task yang sama sudah ada: `reports/qa-t9-c1-recurrence.md` (ditulis sebelum
> kode di-commit). Saya verifikasi ulang dari nol dengan harness baru; kesimpulannya sama, angka sedikit
> berbeda karena mesin/beban. Selisih yang saya temukan di report lama: jumlah test paritas baru adalah
> **7**, bukan 6, dan angka "sebelum" di deskripsi task tidak reproducible (detail §6).

---

## Scope & test plan

**Yang diuji**

| Area | Level | Alat |
|---|---|---|
| Klaim implementasi (`seek`/`DayPlan`, batas bawah, early-exit) | inspeksi kode + probe langsung | baca `expand.ts`, probe `buildDayPlan().seek()` di salinan `/tmp` |
| Cold path 20 seri mingguan sejak 2020, 500 kejadian, 3 grid | benchmark | harness sementara `/tmp` (7 run, median + best) + `expand.perf.test.ts` permanen |
| Skala terhadap umur seri (2025 vs 2020 vs 2000) | benchmark pembanding | harness yang sama, engine lama vs baru |
| Seri mingguan multi-hari & interval 2, bulanan tgl 29/30/31, bulanan minggu ke-5 | benchmark + paritas | `bench2.ts` + kasus ekstrem paritas |
| Paritas perilaku engine lama vs baru | differential test | 1.019 kasus deterministik, output mentah dibandingkan |
| `MAX_OCCURRENCES_PER_EXPANSION` | paritas + test permanen | kasus harian 40 tahun (10.000 kejadian) |
| Regresi unit/integration | test suite | core `src/recurrence`, core penuh, 4 file web wajib + 4 file area kalender tambahan |
| Kualitas kode | typecheck/lint/format | `tsc -p`, `eslint --max-warnings 0`, `prettier --check` |

**Tidak diuji (alasan)**

- Lighthouse/INP/E2E browser: perubahan murni fungsi murni di `packages/core`, tanpa UI/route/bundle baru.
  Yang berubah hanya durasi komputasi, dan itu diukur langsung (bukan proxy).
- Mobile: tidak ada file `apps/mobile` yang berubah; engine dipakai lewat core yang sama.
- Benchmark web end-to-end `schedule.ts` cold: sudah dicakup pass sebelumnya (8,8/14,2/16,2 ms) dan
  `calendar.perf.test.ts` tetap hijau; di sini saya fokus di lapisan core tempat perubahan berada.
- `splitForThisAndFollowing`/`slotsBefore` dari sisi fungsional: tidak berubah (fungsi di `exceptions.ts`
  tidak tersentuh, dan paritas `expandOccurrenceTimes` yang jadi dasarnya identik). Perf-nya dinilai di §5.

---

## 1. Bukti implementasi (bukan percaya komentar)

`packages/core/src/recurrence/expand.ts`:

| Klaim | Bukti |
|---|---|
| Tidak walk dari seed | `expandRawStartTimes` memanggil `byDay.seek(searchFromLocalDate)` lalu `byDay.daysFrom(cursor.startIndex)` — `expand.ts:165`, `expand.ts:173` |
| `DayPlan`/`seek` dipakai | tipe `DayPlan` (`expand.ts:228`), `dailyPlan` (`260`), `weeklyPlan` (`288`), `monthlyPlan`/`monthPlan` (`345`/`371`) |
| Harian O(1) | `startIndex = floor(offset/interval)`, `producedBefore = startIndex` (`expand.ts:265-271`) |
| Mingguan O(1) via index minggu | `startIndex = floor(offset/stride)`, `producedBefore = firstWeekCount + (startIndex-1)*weekSize` (`expand.ts:313-318`) |
| Bulanan per-bulan tanpa `Intl` | `countBefore` menelusuri **bulan** lewat `resolveMonthDay`/`nthWeekdayOfMonth` (`expand.ts:383-392`); `grep Intl packages/core/src/recurrence/*.ts` → hanya `timezone.ts` (cache formatter, tidak berubah) |
| Batas bawah `localDateOf(range.fromMs − durationMs, tz)` | `expand.ts:149-153`, lalu di-clamp ke `seedLocalDate` |
| `until_date` early-exit | `expand.ts:157-162` (keluar sebelum loop) + `181` (break di loop) |
| `after_count` early-exit | `expand.ts:168` (jatah habis sebelum rentang) + `179` (break saat jatah habis) |
| `MAX_OCCURRENCES_PER_EXPANSION` tetap | `expand.ts:82`, dipakai `expand.ts:194` |

**Probe `seek()` langsung** (salinan `/tmp`, `buildDayPlan` di-export hanya di salinan — repo tidak disentuh):

```
daily   seed 2020-01-06 → target 2025-09-01 : startIndex=2065 producedBefore=2065 first=2025-09-01
daily   seed 2000-01-03 → target 2025-09-01 : startIndex=9373 producedBefore=9373 first=2025-09-01
weekly  seed 2020-01-06 → target 2025-09-01 : startIndex=295  producedBefore=1475 first=2025-09-01
weekly  seed 2020-01-06 → target 2025-09-29 : startIndex=299  producedBefore=1495 first=2025-09-29
monthly seed 2020-01-31 (tgl 31) → 2025-09-01: startIndex=68 producedBefore=40 first=2025-10-31
monthly seed 2020-01-31 (tgl 31) → 2025-09-29: startIndex=68 producedBefore=40 first=2025-10-31
```

`producedBefore=40` untuk pola tgl 31 sejak Jan 2020 s/d Agu 2025 cocok dengan hitungan manual (7 bulan
bertanggal 31 × 5 tahun + Jan/Mar/Mei/Jul/Agu 2025 = 40), dan `first=2025-10-31` membuktikan September
(tidak punya tgl 31) **dilewati**, bukan digeser ke 1 Okt.

---

## 2. Hasil per acceptance criteria

| AC | Hasil | Bukti |
|---|---|---|
| **53.1** Cold `calendar.perf.test.ts` < 100 ms untuk 500 kejadian, ≥3 run, angka sebelum/sesudah | **PASS** | Core best-of-7: Sep **6,06 ms**, Okt **5,86 ms**, Nov **5,85 ms** (median 6,47/5,95/5,91). Engine lama: **193,75/196,60/207,56 ms**. Web `calendar.perf.test.ts` 3/3 lulus. Tabel lengkap §3 |
| **53.2** Tidak linear umur seri | **PASS** | 500 kejadian/grid sama: seed 2025 = 5,88 ms, seed 2020 = 6,47 ms, seed 2000 = 5,85 ms (datar). Engine lama pada beban sama: 8,35 → 194,06 → 912,51 ms. Lihat §3.2 |
| **53.3** Perilaku tetap (tanggal, urutan, durasi, DST, `until_date`, `after_count`, MAX) | **PASS** | Paritas 1.019 kasus / 24.009 kejadian / 6 tz → output identik (termasuk urutan & `startAt/endAt/localDate`). Kasus MAX harian 40 thn = 10.000 kejadian di kedua engine. §4 |
| **53.4** Regresi (core recurrence 38/38, `calendarViews.qa`, `kalender`, `calendar.perf`, `schedule`); `schedule.ts` tidak berubah | **PASS** | core `src/recurrence` **38/38**; core penuh **371/371**; 4 file web **68/68**; 4 file area kalender tambahan **19/19**. Commit `6ed5a10` hanya menyentuh 3 file core — `apps/web/app/utils/schedule.ts` **tidak** ada di commit itu (`git show --name-only 6ed5a10`) |
| **53.5** Bukti angka + daftar test | **PASS** | Report ini + komentar orchestrator |
| **B-53.1** `after_count` bulanan ekstrem | **Non-blocking** | Terukur: seed 1900 = **0,205 ms**, seed 1800 = **0,313 ms** (≈1.200–2.700 iterasi aritmetika bulan, tanpa `Intl`). Bandingkan budget 100 ms |
| **B-53.2** `splitForThisAndFollowing`/edit masih O(n) | **Non-blocking** | `exceptions.ts` tidak berubah; jalur edit sekali per aksi, bukan render. Perilaku identik HEAD |

---

## 3. Benchmark (sebelum vs sesudah, angka mentah)

Metode identik dengan test permanen: 20 seri mingguan Sen–Jum, **objek jadwal baru tiap run** (cache
ekspansi dingin), warm-up dibuang, 7 run, dilaporkan median + best + worst. Harness di
`/tmp/opencode/qa53/{new,old}/bench.ts` (sementara, tidak masuk repo). `old` = `git show 6ed5a10^:…/expand.ts`,
`new` = working tree.

### 3.1 Cold path — 20 seri sejak 2020, 500 kejadian/grid (ms)

| Grid | Sebelum best / median / worst | Sesudah best / median / worst | Speed-up (best) |
|---|---|---|---|
| Sep 2025 (`2025-09-01`) | **193,75 / 194,06 / 197,43** | **6,06 / 6,47 / 7,92** | 32,0× |
| Okt 2025 (`2025-09-29`) | **196,60 / 197,14 / 220,75** | **5,86 / 5,95 / 6,24** | 33,6× |
| Nov 2025 (`2025-10-27`) | **207,56 / 212,23 / 336,20** | **5,85 / 5,91 / 6,03** | 35,5× |

Jumlah kejadian tiap grid = **500** (diverifikasi harness, bukan asumsi).

### 3.2 Skala umur seri (grid Sep 2025, 500 kejadian, seed digeser)

| Seed seri | Sebelum (best) | Sesudah (best) | Rasio |
|---|---|---|---|
| 2025-08-04 (seri baru, ±2 bulan) | 8,11 ms | 5,82 ms | 1,4× |
| 2020-01-06 (6,7 tahun) | 193,75 ms | 6,06 ms | 32× |
| 2000-01-03 (25,7 tahun) | 905,19 ms | 5,82 ms | **155×** |

Sesudah: 5,82 / 6,06 / 5,82 ms → **datar** (variasi < 5 %). Sebelum: naik sebanding umur seri.

### 3.3 Pola lain (20 seri, grid bulan/35 hari, ms — best-of-5)

| Kasus | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| Mingguan 3 hari, interval 2, seed 2000, grid Okt 2025 | 260,73 | **2,35** | 120 kejadian |
| Mingguan 7 hari, seed 2015, grid 35 hari | 508,21 | **7,42** | 700 kejadian |
| Bulanan tgl 31, seed 2000-01-31 | 23,65 | **1,01** | 20 kejadian (bulan pendek dilewati) |
| Bulanan tgl 29, seed 1990-01-29 | 51,62 | **1,20** | 20 kejadian |
| Bulanan minggu ke-5 Sabtu, seed 2000 (0 kejadian di Okt 2025) | 15,71 | **1,80** | kasus "tidak ada kandidat" |

### 3.4 B-53.1 — `countBefore` bulanan ekstrem

| Kasus | Median |
|---|---|
| Bulanan seed **1900** + `after_count 10000`, rentang Okt 2026 | 0,205 ms |
| Bulanan seed **1800** + `after_count 10000` | 0,313 ms |
| Bulanan seed 1800 tanpa `after_count` | 0,296 ms |
| Harian seed 1900 (kontrol O(1)) | 0,433 ms |

Kesimpulan B-53.1: benar ada O(jumlah bulan), tetapi biayanya 3 orde di bawah budget dan **tidak** di
jalur render per-hari (dipanggil sekali per jadwal per ekspansi).

---

## 4. Paritas (differential test vs engine lama)

Harness: `/tmp/opencode/qa53/old` (salinan `packages/core/src` + `expand.ts` dari `6ed5a10^`) vs
`/tmp/opencode/qa53/new` (salinan + `expand.ts` working tree). Keduanya memakai helper `calendar.ts`/
`timezone.ts`/`domain/**` yang **sama** (versi HEAD), jadi perbedaan yang terukur murni dari `expand.ts`.
Output per kasus: `occurrenceAt:startAt:endAt:localDate` **dalam urutan hasil**, dibandingkan `diff` baris
per baris.

```
1019 kasus · 24.009 kejadian · 6 timezone
diff out-old3.txt out-new3.txt  ->  (kosong)
```

Cakupan (deterministik, PRNG ber-seed; angka dari `stats.ts`):

| Dimensi | Sebaran |
|---|---|
| Timezone | Jakarta 188, Kolkata 180, Santiago 169, Berlin 166, New York 159, Sydney 157 |
| Tipe | weekly 360, daily 312, monthly 311, once/`null` 36 |
| `end_mode` | `never` 643, `until_date` 193, `after_count` 147, tanpa recurrence 36 |
| Rentang mulai > 90 hari setelah seed (jalur fast-forward) | **755** kasus |
| Rentang seluruhnya sebelum seed | **180** kasus |
| Kasus menghasilkan ≥1 kejadian | **523** kasus |

Selain acak, 19 kasus ekstrem eksplisit: harian 40 tahun (memaksa `MAX_OCCURRENCES_PER_EXPANSION` =
**10.000** di kedua engine), bulanan tgl 29/30/31 lintas dekade & tahun kabisat, mingguan 7 hari interval 2,
DST New York (seed 02:30) & Berlin (seed 01:30), `after_count` habis sebelum rentang, `until_date` tepat di
hari kejadian / sebelum seed, rentang sebelum seed, jadwal `once`, `by_weekdays` kosong, durasi 10 hari,
`intervalN` rusak (0 / 999), `monthMode` null, serta `after_count 10000` pada seri harian.

**Contoh hasil yang sekaligus menguji risiko yang diminta:**

```
max-occurrences-daily-40y           10000  (cap dihormati, identik kedua engine)
monthly-31-across-years                56  (tgl 31 dilewati di bulan pendek, tidak digeser)
monthly-29-leap                       112
weekly-7-days-interval-2               59
dst-new-york-spring                    46
dst-berlin-fall-daily                  22
after-count-exhausted-before-range      0
until-date-before-seed                  0
```

---

## 5. Hasil test & kualitas kode (verbatim)

```
$ pnpm --filter @improve-personal/core exec vitest run src/recurrence
 RUN  v5.0.3 /media/DATA/Development/stackinnov/products/improve-personal/packages/core
 Test Files  2 passed (2)
      Tests  38 passed (38)

$ pnpm --filter @improve-personal/core exec vitest run src/recurrence/expand.perf.test.ts --reporter=verbose
 ✓ ... > 20 seri sejak 2020, grid September 2025: < 100 ms cold 50ms
 ✓ ... > 20 seri sejak 2020, grid Oktober 2025: < 100 ms cold 30ms
 ✓ ... > 20 seri sejak 2020, grid November 2025: < 100 ms cold 29ms
 Test Files  1 passed (1)
      Tests  3 passed (3)

$ pnpm --filter @improve-personal/core exec vitest run
 Test Files  20 passed (20)
      Tests  371 passed (371)

$ pnpm --filter @improve-personal/web exec vitest run \
    app/utils/calendarViews.qa.test.ts app/pages/app/kalender.test.ts \
    app/components/features/calendar/calendar.perf.test.ts app/utils/schedule.test.ts
 Test Files  4 passed (4)
      Tests  68 passed (68)

# tambahan regresi area kalender (di luar daftar wajib)
$ pnpm --filter @improve-personal/web exec vitest run \
    app/utils/calendarGrid.test.ts app/composables/useTimeGrid.test.ts \
    app/composables/useSchedules.test.ts app/composables/dailyCalendar.qa.test.ts
 Test Files  4 passed (4)
      Tests  19 passed (19)

$ pnpm --filter @improve-personal/core exec tsc -p tsconfig.json          # exit 0
$ pnpm --filter @improve-personal/core exec eslint src/recurrence --max-warnings 0   # exit 0
$ pnpm exec prettier --check packages/core/src/recurrence/expand.ts \
    packages/core/src/recurrence/expand.test.ts \
    packages/core/src/recurrence/expand.perf.test.ts apps/web/app/utils/schedule.ts
 All matched files use Prettier code style!

$ grep -rn "\.only(\|\.skip(\|it\.todo\|describe\.skip" <semua file test terkait>
 NO .only/.skip/todo
```

Catatan path: handoff menulis `app/utils/calendar.perf.test.ts`, tetapi file itu **tidak ada** di path
tersebut; yang benar `app/components/features/calendar/calendar.perf.test.ts`. Saya jalankan path yang
benar. `app/pages/app/kalender.test.ts` memang ada.

Perbandingan jumlah test: klaim "core penuh 353" dan "recurrence 38/38". Saat ini core penuh **371**
(18 test bertambah dari task lain setelah commit #53 — bukan regresi); recurrence tetap **38/38** sesuai
klaim.

---

## 6. Bug

**Tidak ada bug** (Critical / High / Medium / Low) yang bisa direproduksi.

Dua temuan **dokumentasi/observasi** (non-blocking, bukan cacat perilaku):

1. **Angka "sebelum" di deskripsi task tidak reproducible.** Deskripsi menulis Sep 240,3 / Okt 477,6 /
   Nov 471,8 ms. Dengan metode yang sama di mesin ini, engine `6ed5a10^` terukur **193,8 / 196,6 /
   207,6 ms** (core) dan pass QA sebelumnya mencatat 199–233 ms. Angka "sesudah" juga lebih tinggi dari
   yang saya ukur (8,5/14,0/13,4 vs 6,0/5,9/5,9 core). Arah dan besaran perbaikan tidak berubah
   (32–35×), tetapi angka di deskripsi jangan dipakai sebagai baseline dokumen lain.
   Bukti: §3.1.
2. **Komentar angka acuan di `expand.perf.test.ts:22`** menulis "Sep 2025 = 7,4 ms; Okt = 14,2 ms;
   Nov = 13,5 ms" — di mesin ini core datar 5,9–6,5 ms untuk ketiga bulan (14 ms cocok untuk lapisan web,
   bukan core). Kosmetik; tidak memengaruhi assertion.

---

## 7. Cek tiga pilar

| Pilar | Status | Bukti / catatan |
|---|---|---|
| **Keamanan** | PASS | Fungsi murni tanpa I/O, tanpa input eksternal, tanpa dependency baru, tanpa log. `MAX_OCCURRENCES_PER_EXPANSION` (`expand.ts:82`) tetap membatasi loop; `hardStopDay` tetap ada. Tidak ada permukaan auth/data yang tersentuh |
| **Performa** | PASS | §3: cold 500 kejadian 5,85–6,06 ms (budget 100 ms, headroom ~16×), datar terhadap umur seri (2000 vs 2020 vs 2025). Tidak ada regresi jalur panas: jumlah `fromLocalDateTime` per ekspansi kini mengikuti lebar rentang, bukan umur seri |
| **Kerapian** | PASS | Diff menambah struktur bernama (`DayPlan`, `DayCursor`, `seek`, `daysFrom`) + komentar "kenapa"; tanpa `any`/`@ts-ignore`/`console.log`/`.only`/`.skip`; `tsc`, `eslint --max-warnings 0`, `prettier --check` hijau. 7 test paritas + 1 benchmark permanen baru menguji perilaku (tanggal/instan/count), bukan detail implementasi. Satu komentar angka acuan sudah basi (non-blocking, §6.2) |

---

## 8. Coverage & sisa risiko (semua non-blocking)

1. **`monthPlan.countBefore` selalu dihitung**, termasuk saat `end_mode` bukan `after_count`
   (`expand.ts:395-399`). Jadi bulanan = O(umur dalam bulan), bukan O(1). Terukur 1,0–1,3 ms untuk 20 seri
   seed 1990–2000 (§3.3) dan 0,3 ms untuk seed 1800 (§3.4) — aman. Optimasi opsional: hitung
   `producedBefore` lazy hanya bila `countLimitOf(recurrence) !== null`.
2. **`splitForThisAndFollowing` (core) & `slotsBefore` (web) masih O(umur seri)** — keduanya
   mengekspansi `fromMs: 0` / `fromMs: startAt`, sehingga `seek` mulai dari seed. Ini **perilaku lama**
   (bukan regresi), hanya di jalur edit "ini & berikutnya" (sekali per aksi, bukan render). Kalau nanti
   ada keluhan edit lambat pada seri 10+ tahun, ini titiknya.
3. **Guard perf di lapisan web lemah untuk kasus aslinya.** `calendar.perf.test.ts` test ke-3 hanya
   memakai **2** seri mingguan lama (terukur 4 ms) — dengan engine lama pun test itu tetap lulus, jadi ia
   **tidak** akan menangkap regresi 20-seri. Guard yang benar-benar mengunci adalah
   `packages/core/src/recurrence/expand.perf.test.ts` (20 seri, 500 kejadian). Saran opsional: naikkan
   jumlah seri di test web atau cukup andalkan guard core (jangan duplikasi ambang waktu).
4. **Ambang benchmark berbasis wall-clock.** 100 ms vs 6 ms = headroom ~16×; tetap bisa flaky di runner
   CI yang sangat lambat/oversubscribed. Alternatif machine-independent (opsional, berisiko flaky sendiri):
   assertion rasio seed 2000 vs 2020 < 3×.
5. **`hardStopDay` = akhir hari rentang + 1** (`expand.ts:140`) → loop bisa memproses satu hari ekstra di
   luar rentang; hasilnya disaring `overlapsRange`, jadi benar, hanya kerja mikro yang sia-sia.
6. **Belum ada test permanen** untuk `after_count` + mingguan `intervalN > 1`; kasus itu hanya ada di probe
   paritas QA (lulus). Bukan blocker, tapi kandidat test tambahan bila file itu disentuh lagi.
7. Perubahan pada `apps/web/app/utils/schedule.ts` di HEAD berasal dari commit **lain** setelah `6ed5a10`
   (fitur Goals dkk.), bukan task ini. Sudah diverifikasi commit #53 tidak menyentuhnya.

---

## 9. File yang QA ubah/tambah

- **Tambah:** `reports/qa-53-recurrence-perf.md` (file ini).
- **Tidak ada** perubahan kode produk, test, fixture, config, atau lockfile dari QA ini.
- Harness benchmark/paritas/probe hanya di `/tmp/opencode/qa53/**` (di luar repo, tidak di-commit):
  `cases.ts`, `run.ts`, `bench.ts`, `bench2.ts`, `risk.ts`, `seek.ts`, `stats.ts`, plus salinan
  `old/` (engine `6ed5a10^`) dan `new/` (working tree).
