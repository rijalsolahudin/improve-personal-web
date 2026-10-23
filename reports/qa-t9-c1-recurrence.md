# QA T9 / C1 — Perf ekspansi recurrence seri lama

**Verdict: LULUS.**

Fast-forward di `packages/core/src/recurrence/expand.ts` terbukti membuat biaya ekspansi **tidak lagi
tumbuh mengikuti umur seri**, dan target AC (< 100 ms cold untuk 500 kejadian) tercapai dengan
headroom besar. Paritas perilaku terhadap engine lama (HEAD) identik di semua kasus yang diuji
(≈1.600 kasus, `0` beda). Tidak ada bug baru yang ditemukan.

| | Sebelum (HEAD, terukur QA) | Sesudah (terukur QA) | Target |
|---|---|---|---|
| Core, 20 seri mingguan sejak 2020, 500 kejadian/grid (Sep) | **199,4–225,8 ms** | **6,0–7,0 ms** | < 100 ms |
| Core, grid Okt | 201,6–232,3 ms | 6,0–6,7 ms | < 100 ms |
| Core, grid Nov | 203,8–232,5 ms | 5,9–6,7 ms | < 100 ms |
| Web `schedule.ts` cold, Sep / Okt / Nov (500 kejadian) | 205,8 / 246 / 252 ms (baseline QA #23) | **8,8 / 14,2 / 16,2 ms** | < 100 ms |
| Seed 2000 (seri 25 tahun) | 1.162 ms | 7,2 ms (datar) | tidak linear umur |

Task: Ergonio #53 "Perf ekspansi recurrence untuk seri lama (C1 T9)" — `stackinnov/personal-productivity`
(status `review`; QA tidak memindahkan status, orchestrator yang memegang transisi).
Tanggal cek: 23 Okt 2026.

Rules dibaca: `CLAUDE.md` root, `.claude/rules/shared-security.md`,
`.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`,
`apps/web/AGENTS.md` + `apps/web/CLAUDE.md` + `apps/web/.claude/rules/{performance,code-quality}.md`
(aturan mobile tidak dimuat: task tidak menyentuh `apps/mobile`).

## 1. Lingkup

Perubahan yang diuji (working tree, belum commit):

- `packages/core/src/recurrence/expand.ts` — `DayPlan` + `seek()` fast-forward (harian/mingguan/bulanan),
  `daysFrom(startIndex)`, batas bawah `localDateOf(range.fromMs − durationMs)`, early-exit
  `until_date`/`after_count`.
- `packages/core/src/recurrence/expand.test.ts` — 6 test paritas baru.
- `packages/core/src/recurrence/expand.perf.test.ts` — benchmark permanen baru.
- Tidak ada perubahan lain di `packages/core/src/recurrence/**` (dicek `git status`); `exceptions.ts`,
  `calendar.ts`, `timezone.ts` tidak berubah. `apps/web/app/utils/schedule.ts` tidak berubah untuk task
  ini (mtime 06:05, sebelum fix 10:33).

**Diuji:**

1. Perf cold, metode QA #23 (warm-up dibuang, best-of-3, objek `Schedule`/`ExpansibleSchedule` **baru**
   tiap run) — 20 seri mingguan Sen–Jum sejak 2020-01-06, 500 kejadian, grid Sep/Okt/Nov 2025, di dua
   lapisan: core `expandOccurrenceTimes` dan web `monthDays` + `occurrencesOn`.
2. Skala terhadap umur seri: seed 2020 vs 2010 vs 2000, grid & jumlah kejadian sama.
3. Paritas perilaku HEAD vs baru (differential, output mentah `occurrenceAt/startAt/endAt/localDate`):
   600 kasus acak + ~1.000 kasus sistematis.
4. Exception di lapisan yang dipakai web (`exceptions: ['YYYY-MM-DD']`, `ends: until` hasil
   "ini & berikutnya") di seri lama.
5. Seluruh test yang diminta + regresi area terdampak + lint/typecheck core.
6. Benchmark permanen: kestabilan (5 run berurutan + 4 run paralel) dan ketatnya ambang.

**Tidak diuji (alasan):**

- E2E browser / Lighthouse: perubahan murni fungsi murni di core, tanpa UI, request, atau bundle baru.
  Angka INP tidak berubah struktural; yang berubah hanya durasi komputasi yang sudah diukur langsung.
- Mobile: tidak ada perubahan di `apps/mobile` dan engine ini dipakai lewat core yang sama.
- Tahun < 1970, tz non-IANA, tipe recurrence di luar enum: di luar validasi schema
  (`scheduleRecurrenceSchema` membatasi `intervalN`, `monthDay` 1–31, `weekOfMonth`, `byWeekdays` ≥ 1).
- `splitForThisAndFollowing`/`slotsBefore` (jalur edit "ini & berikutnya") tidak diukur perf-nya —
  keduanya memang masih O(umur seri) dan tidak di jalur render; lihat §5.

Metode persis seperti QA #23 (`reports/qa-t9-kalender.md` §3 & §9.4): satu pemanasan dibuang, 3 kali
ukur, diambil nilai **terbaik** (paling ramah implementasi), dan tiap run membangun objek jadwal baru
supaya cache `WeakMap` di `schedule.ts` dingin.

## 2. Hasil per acceptance criteria

| AC | Hasil | Bukti |
|---|---|---|
| Ekspansi seri lama tidak lagi linear terhadap umur seri | **PASS** | Core, grid Sep 2025, 20 seri, 500 kejadian: seed 2020 = **7,0 ms**, seed 2010 = **7,5 ms**, seed 2000 = **7,2 ms** (datar). Engine HEAD pada beban sama: 226,0 → 659,0 → 1.162,3 ms (linear). `expand.ts:313-318` (mingguan), `expand.ts:260-278` (harian), `expand.ts:395-399` (bulanan) |
| Benchmark cold `calendar.perf.test.ts` < 100 ms untuk 500 kejadian | **PASS** | Web `schedule.ts` cold: Sep **8,8 ms**, Okt **14,2 ms**, Nov **16,2 ms**; tiap grid `count=500`. Core: 6,0–7,0 ms. Baseline QA #23: 205,8 / 246 / 252 ms. Headroom ≥ 6× |
| Tidak ada regresi recurrence | **PASS** | Paritas HEAD vs baru: 600 kasus acak (5 tz, 4 tipe pola, `never`/`until_date`/`after_count`, 0–26 jam, all-day, rentang sebelum seed / 1 hari jauh / setahun / prefix epoch) + 6 grup sistematis (semua posisi hari seed, subset hari tak terurut & duplikat, interval 1–3, tanggal 29–31, `week_of_month` 1–5, batas rentang ±1 ms, DST NY/Berlin/Sydney) → **0 beda**. Core `src/recurrence` **38/38**, web terkait **71–90/90** |

### 2.1 Paritas yang saya jalankan sendiri (bukan percaya klaim)

Harness sementara (dihapus setelah dijalankan, sama seperti praktik QA #23):

- **Differential vs HEAD**: menyalin `git show HEAD:…/expand.ts` ke file probe, lalu membandingkan
  output `expandOccurrenceTimes` HEAD vs baru untuk input identik.
  - 600 kasus acak ber-seed (PRNG deterministik) — lulus, 0 beda.
  - Sistematis: mingguan (3 posisi seed × 8 subset hari × interval 1/2/3 × `after_count` 1/2/3/5/10 ×
    3 bentuk rentang), bulanan (seed 29/30/31/29-Feb/31-Des × `monthDay` 28–31 × count 1–12 +
    `by_nth_weekday` week 1/2/5), harian (interval 1–6 × count 1–400 × 3 rentang), `until_date`
    (akhir sebelum seed / tepat di hari kejadian / setelah rentang), batas rentang (mulai & akhir tepat
    di occurrence, ±1 ms, durasi 26 jam), DST 3 tz — **semua lulus, 0 beda**.
- **Exception di lapisan web** (seri mingguan sejak 2020):
  - `exceptions: ['2025-09-08']` → hanya 8 Sep yang hilang, sisa hari kerja tetap.
  - "Ini & berikutnya": pola lama `ends.until = 2025-09-07` + pola baru mulai 2025-09-08 10:00 →
    1–30 Sep tepat 22 hari kerja, tanpa duplikat, 8 Sep hanya dari pola baru (10:00).
  - Hasil ini identik dengan ekspektasi manual (oracle dihitung ulang di test, bukan dari engine).
- Angka perf "sebelum" saya ukur ulang dari implementasi HEAD di mesin yang sama, bukan mengutip.

### 2.2 Catatan angka klaim (Info, non-blocking)

- Angka **sesudah** di deskripsi task (Sep 8,5 / Okt 14,0 / Nov 13,4 ms) konsisten dengan pengukuran
  saya di lapisan web (8,8 / 14,2 / 16,2 ms). Beda kecil = noise mesin.
- Angka **sebelum** di deskripsi (Sep 240,3 / Okt 477,6 / Nov 471,8 ms) **tidak bisa saya reproduksi**
  dengan metode QA #23: HEAD terukur **199–233 ms** (core) untuk ketiga grid, dan baseline QA #23
  yang terdokumentasi adalah 205,8 / 246 / 252 ms (web, cold). Angka 477/471 tidak mengubah kesimpulan
  (arah & besaran perbaikan sama), tapi jangan dipakai sebagai baseline di dokumen lain.
- Komentar acuan di `expand.perf.test.ts:22` menulis "Okt = 14,2 ms; Nov = 13,5 ms" untuk pengukuran
  **core**; di mesin ini core justru datar **6,0–7,0 ms** untuk ketiga bulan (angka 14 ms cocok untuk
  lapisan web). Bukan bug, hanya komentar yang bisa menyesatkan; sebaiknya diperbaiki saat menyentuh
  file itu lagi.

## 3. Bug

**Tidak ada bug** (Critical/High/Medium/Low) yang bisa direproduksi. Tidak ada perilaku recurrence yang
berubah, tidak ada test yang kehilangan cakupan, dan target performa tercapai.

## 4. Cek tiga pilar

| Pilar | Status | Bukti / catatan |
|---|---|---|
| **Keamanan** | PASS | Fungsi murni tanpa I/O, tanpa input eksternal, tanpa dependency baru, tanpa log. Pengaman `MAX_OCCURRENCES_PER_EXPANSION` (`expand.ts:82`) tetap dipakai; loop tetap berhenti pada `hardStopDay`. Tidak ada permukaan auth/data yang tersentuh |
| **Performa** | PASS | §2. Datar terhadap umur seri (7 ms untuk seri 6, 16, dan 25 tahun). Headroom ≥ 6× terhadap budget 100 ms. Biaya tambahan yang diketahui: `monthPlan.countBefore` O(jumlah bulan) walau `after_count` tidak dipakai — terukur tidak signifikan (20 seri bulanan seed 1970 = 1,9 ms vs seed 2000 = 1,7 ms) |
| **Kerapian** | PASS | Core `eslint --max-warnings 0` hijau, `tsc -p tsconfig.json` hijau, 369/369 test core hijau. Diff hanya menambah struktur `DayPlan`/`seek`/`daysFrom` + komentar "kenapa"; tidak ada `any`, `@ts-ignore`, `console.log`, `.only`, `.skip`, atau test yang dihapus. Assertion test baru menguji perilaku (tanggal/instan), bukan detail implementasi |

## 5. Coverage & sisa risiko (bukan blocker)

1. **`after_count` seri bulanan ekstrem** — `monthPlan.countBefore` menelusuri bulan dari seed; seri
   >100 tahun menambah ~1.200 iterasi aritmetika. Di luar jalur render dan tidak terukur signifikan
   pada data realistis. Sudah dicatat developer.
2. **Edit "ini & berikutnya" pada seri ber-`count`** — `slotsBefore` dan
   `splitForThisAndFollowing` masih mengekspansi dari seed (`fromMs: 0`), jadi biayanya tetap O(umur
   seri) saat user mengedit. Bukan jalur panas (satu kali per aksi), tapi kalau nanti ada keluhan edit
   lambat pada seri 10+ tahun, ini tempatnya. Perilakunya tidak berubah dari HEAD.
3. **Benchmark bergantung kecepatan mesin** — `expand.perf.test.ts` memakai ambang 100 ms (= budget
   PRD) dengan headroom 14–17× di mesin ini; stabil 5/5 run berurutan dan 4/4 run paralel. Kalau CI
   nanti pindah ke runner yang jauh lebih cepat, benchmark tetap benar (ambangnya AC, bukan angka
   mesin). Untuk membuktikan invarian "tidak linear umur seri" secara machine-independent, saran
   opsional: tambah assertion rasio seed 2000 vs 2020 (mis. < 3×) — tapi ini berisiko flaky di CI
   yang sibuk, jadi tidak saya anggap wajib.
4. **Test QA #23 tidak berubah/melemah** — `calendar.perf.test.ts` (mtime 22 Okt 23:35, sebelum fix
   10:33) masih memakai `BUDGET_MS = 100`, warm-up dibuang, best-of-3, 500 kejadian, termasuk test
   "seri lama". `calendarViews.qa.test.ts` 17 test, `kalender.test.ts` 9 test, `kalender.paging.test.ts`
   3 test → total **29 = 17 + 9 + 3**, sama dengan hitungan di `reports/qa-t9-kalender.md`; assertion
   utamanya (tanggal, DST, exception, grid 35 sel, batas `until`) masih utuh; tidak ada `.only`/`.skip`.
   Catatan keterbatasan: file-file itu belum di-commit (`??`), jadi "tidak diubah" tidak bisa dibuktikan
   lewat `git diff` — bukti yang dipakai adalah jumlah test + isi assertion + mtime.
5. **Celah test yang tersisa** (rekomendasi, bukan blocker): belum ada test yang mengunci invarian
   "biaya tidak ikut umur seri" selain benchmark waktu; belum ada test `after_count` untuk
   `intervalN` mingguan > 1 di suite permanen (hanya ada di probe QA saya).

## 6. Perintah & hasil (dijalankan di repo ini)

```
$ pnpm --filter @improve-personal/core exec vitest run src/recurrence
Test Files  2 passed (2)
     Tests  38 passed (38)

$ pnpm --filter @improve-personal/web exec vitest run \
    app/utils/calendarViews.qa.test.ts app/pages/app/kalender.test.ts \
    app/pages/app/kalender.paging.test.ts \
    app/components/features/calendar/calendar.perf.test.ts app/utils/schedule.test.ts
Test Files  5 passed (5)
     Tests  71 passed (71)

# regresi lebih luas (schedule + calendarGrid + composable kalender/daily)
$ pnpm --filter @improve-personal/web exec vitest run <9 file area kalender>
Test Files  9 passed (9)
     Tests  90 passed (90)

$ pnpm --filter @improve-personal/core exec vitest run
Test Files  20 passed (20)
     Tests  369 passed (369)

$ pnpm --filter @improve-personal/core lint        # eslint --max-warnings 0   -> exit 0
$ pnpm --filter @improve-personal/core typecheck   # tsc -p tsconfig.json     -> exit 0

# benchmark permanen: kestabilan
$ for i in 1..5: vitest run src/recurrence/expand.perf.test.ts        -> 3/3 lulus tiap run
$ 4 proses paralel vitest run src/recurrence/expand.perf.test.ts      -> 3/3 lulus di keempatnya
```

Probe perf/paritas (sementara, sudah dihapus — tidak ada file QA yang tertinggal di repo):

```
Core, cold, best-of-3, 20 seri mingguan sejak 2020, 500 kejadian/grid:
  Sep 2025: HEAD 199,4 ms (199,6/199,4/199,6) | baru 6,0 ms (6,2/6,2/6,0) | 33,2x
  Okt 2025: HEAD 201,6 ms                    | baru 6,0 ms                 | 33,8x
  Nov 2025: HEAD 203,8 ms                    | baru 5,9 ms                 | 34,4x
  putaran kedua (beban mesin lain): HEAD 225,8/232,3/232,5 | baru 7,0/6,7/6,7

Skala umur (grid & 500 kejadian sama, seed digeser):
  seed 2020-01-06: HEAD 226,0 ms -> baru 7,0 ms
  seed 2010-01-04: HEAD 659,0 ms -> baru 7,5 ms
  seed 2000-01-03: HEAD 1.162,3 ms -> baru 7,2 ms

Web schedule.ts, cold, objek Schedule baru tiap run:
  Sep 2025: 8,8 ms (12,0/9,1/8,8)  count=500
  Okt 2025: 14,2 ms (14,8/14,4/14,2) count=500
  Nov 2025: 16,2 ms (16,8/16,6/16,2) count=500
```

Lingkungan: Linux 7.2.10, Node v24.18.0, pnpm 11.17.0, Intel i7-14700 (28 thread), 28 core.

### Catatan proses (transparansi)

- Selama QA berjalan ada sesi/agent lain yang mengubah `packages/tokens/src/{colors,styles}.ts`,
  `packages/tokens/src/contrast.qa.test.ts`, dan `CalendarTimeGrid.vue` (task tema). Modul yang diuji
  di sini tidak terpengaruh; kalau ada beban CPU tambahan, metode best-of-3 membuat angka yang
  dilaporkan lebih konservatif (bukan lebih cepat).
- `pnpm --filter … exec` memicu auto-install pnpm (verify-deps), yang menulis ulang `pnpm-lock.yaml`
  (file itu memang sudah berstatus `M` sebelum QA ini mulai, berisi perubahan dependency dari task lain
  seperti `uqr` & override `@nuxt/devtools`). QA tidak bermaksud mengubah lockfile; jangan revert ke
  HEAD karena akan membuang perubahan task lain.
- Semua probe perf/paritas saya adalah file sementara dan **sudah dihapus**; `git status` untuk
  `packages/core/src/recurrence` hanya menyisakan 3 file milik developer (`expand.ts`,
  `expand.test.ts`, `expand.perf.test.ts`).

**Kesimpulan:** perbaikan sah, terukur, dan tidak mengubah perilaku. C1 (Medium, non-blocking) dari
QA #23 **tertutup** untuk jalur cold render bulan. Tidak ada alasan menahan task.
