# QA verification — Task #27 [T13] Halaman Overview (F11) dengan 5 rentang

Tanggal: 2026-10-23 · Reviewer: Fajar (QA) · Tree: `f8a9a5c` + working tree WIP agent lain (tidak disentuh QA)
· Status task: `review` (tidak diubah — orkestrator yang memindahkan).

Rules dibaca: `CLAUDE.md` root, `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`,
`apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{security,performance,code-quality}.md`.
Requirement: `docs/PRD.md` F11 (baris 457–534, termasuk "Perhitungan" baris 518–522) + AC T13 (baris 1098)
+ F7/F8/F13 bagian integrasi Overview.

Environment: Node `v24.18.0`, `vitest 5.0.3`, `@nuxt/test-utils 4.3.3`, TZ host `Asia/Jakarta` (UTC+7).

**Tidak ada kode produk yang diubah QA.** Perubahan dari saya hanya dua file test baru (plus report ini):

- `apps/web/app/pages/app/overview.range.qa.test.ts` (19 test: 4 AC1, 12 AC2, 2 AC3, 1 AC4)
- `apps/web/app/utils/overview.aggregation.qa.test.ts` (1 test benchmark AC3)

Sebagian test **sengaja merah**: itu spesifikasi target untuk AC yang belum terpenuhi, bukan test rusak.
Test hijau mengunci perilaku yang sudah benar (navigasi rentang, slot grafik pekanan/bulanan/tahunan,
streak aktif vs rekor, render halaman).

---

# Putaran 2 — verifikasi ulang setelah perbaikan `dimas`

Tanggal: 2026-10-23 05:16–05:22 WIB · Tree sama (`f8a9a5c` + working tree), task `review`
(tidak diubah QA). Fokus: membuktikan klaim perbaikan, bukan mempercayainya.

Rules dibaca ulang: `CLAUDE.md` root, `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`,
`apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{security,performance,code-quality}.md`.

## Verdict putaran 2: **LULUS (dengan catatan)**

20/20 test QA lulus **apa adanya**, tidak ada assertion yang dilemahkan, tidak ada recompute saat
tick 1 detik, dan satu pass agregasi terukur di bawah budget INP. Sisa catatan non-blocking ada di
bagian "Catatan putaran 2".

### Integritas file test (tidak diubah developer)

Kedua file QA masih **untracked** (belum pernah di-commit), jadi tidak bisa di-diff lewat git.
Bukti yang dipakai:

| File | SHA-256 | mtime terakhir |
|---|---|---|
| `apps/web/app/pages/app/overview.range.qa.test.ts` | `6ff936cd…45b4` | 2026-10-23 **04:27:25** |
| `apps/web/app/utils/overview.aggregation.qa.test.ts` | `01d32561…52e3` | 2026-10-23 **04:15:19** |

- Kedua mtime **lebih awal** dari semua file perbaikan (`overview.ts` 05:00, `useOverview.ts` 04:57,
  `persistence.ts` 05:00, `time.ts` 04:42) dan mendahului report putaran 1 (04:32). Tidak ada edit
  test setelah perbaikan.
- Semua nomor baris yang dikutip report putaran 1 (`:151`, `:167`, `:181`, `:195`, `:217`, `:233`,
  `:240`, `:255`, `:273`, `:297`, `:337`, `:342`, `:352`, `:360`, `:379`, `:427`) dan 20 nama test
  masih menunjuk baris/nama yang sama persis.
- Assertion tetap ketat: `toHaveLength(24)`, `toBe('0')`, `toEqual({ bars: 0, scheduled: 0 })`,
  `toBe(5)`, `toBeLessThan(200)`, `not.toBe('0%')`. Tidak ada `.only`, `.skip`, `.todo`, `try/catch`,
  atau `expect.soft`. `eslint --max-warnings 0` + `prettier --check` hijau.

### Perintah & hasil putaran 2 (exit code apa adanya, cwd `apps/web` kecuali disebut)

| # | Command | Exit | Hasil |
|---|---|---|---|
| 1 | `pnpm exec vitest run app/pages/app/overview.range.qa.test.ts app/utils/overview.aggregation.qa.test.ts --reporter=verbose` | **0** | 2 file, **20 passed (20)** — 4 AC1, 12 AC2, 2 AC3, 1 AC4, 1 benchmark |
| 2 | `pnpm exec vitest run app/utils/overview.test.ts app/utils/habits.test.ts app/utils/pomodoro.test.ts app/utils/schedule.test.ts app/composables/useHabits.consumers.test.ts app/composables/useDailyRoutine.test.ts` | **0** | 6 file, **104 passed** |
| 3 | `pnpm exec vitest run app/utils/tasks.test.ts app/utils/tasks/persistence.test.ts app/composables/useTasks.test.ts app/composables/useSchedules.test.ts app/composables/useGoals.test.ts` | **0** | 5 file, **37 passed** |
| 4 | `pnpm exec vitest run app/composables/usePomodoro.test.ts` | **0** | 1 file, **11 passed** |
| 5 | `pnpm exec vitest run app/utils/features.test.ts` | **0** | 1 file, **7 passed** |
| 6 | `pnpm exec nuxt typecheck` | **0** | tanpa error |
| 7 | `pnpm exec eslint --max-warnings 0 app/pages/app/overview.range.qa.test.ts app/utils/overview.aggregation.qa.test.ts` (+ file produk yang berubah) | **0** | bersih |
| 8 | `pnpm exec prettier --check` (QA + file produk) | **0** | "All matched files use Prettier code style!" |

### Acceptance criteria putaran 2

| # | AC | Status | Bukti |
|---|---|---|---|
| 1 | 5 rentang ada & bisa dipilih | **PASS** | `overview.range.qa.test.ts:151` lulus; label `Keseluruhan · sejak Jan 2026` / `Rabu, 14 Oktober 2026` / `12 Okt – 18 Okt 2026` / `Oktober 2026` / `Tahun 2026`. |
| 2 | prev/next jalan di tiap rentang | **PASS (4 rentang navigable)** | `:167`, `:181`, `:195` lulus. Keseluruhan tetap tanpa nav (all-time, `canNav=false` — keputusan produk yang konsisten dengan B11 putaran 1). |
| 3 | Metrik F11 benar per rentang | **PASS** | Harian 24 slot + sesi 00:00–05:59 (`:217`); kartu "tepat waktu" ada (`:233`); habit rate Keseluruhan >120 hari (`:240`); task selesai per rentang (`:255`); `completedAt` sampai UI (`:273`); goal difilter (`:297`); rekor hari produktif >365 hari (`:337`); rekor habit >120 hari (`:342`); window Keseluruhan = data terlama (`:352`); mood tahun lalu di Keseluruhan (`:360`). Semua lulus. |
| 4 | Unit test agregasi + streak | **PASS** | `utils/overview.test.ts` diperluas developer (104 test gabungan lulus): `windowFor` Keseluruhan, 24 slot, `activeGoals` per rentang, `taskTotals` per rentang, `onTimeRate`, `habitStreaks`, `bestDayStreak`, `earliestActivityStart`, `moodSeries`. |
| 5 | Agregasi sekali per ganti rentang | **PASS** | `overview.range.qa.test.ts:379` → probe `{ bars: 0, scheduled: 0 }` untuk 3 tick 1 detik; sanity `:413` membuktikan probe memang menyala saat rentang diganti (`bars > 0`). |
| 6 | Budget performa INP ≤ 200 ms | **PASS** | Benchmark QA lulus: 4 pass (warmup + 3) total 110 ms. Probe independen (fixture sama): tahunan cold **87,5 ms**, warm **6,2–8,3 ms** (median 7,8); Keseluruhan 2,5 tahun (20 jadwal sejak 800 hari lalu, 150 sesi, 250 memo, 20 habit × 400 hari, 150 task) cold **154,6 ms**, warm **15,7–21,2 ms**. |
| 7 | Regresi halaman & widget pemakai agregasi | **PASS** | `:427` (5 kartu statistik, streak habit, heatmap) lulus; 104 + 37 + 11 + 7 test regresi lulus; `nuxt typecheck` exit 0. |

### Verifikasi semantik (probe sementara, sudah dihapus — bukan file test permanen)

| Skenario | Hasil aktual | Penilaian |
|---|---|---|
| Task selesai 2024 + 3 task selesai hari ini (1 tanpa deadline) | Keseluruhan: `Task selesai = 4`, `Task tepat waktu = 67%` (2 dari 3 yang ber-deadline); Pekanan: `3`, `50%` | Benar: data lama masuk Keseluruhan, task tanpa deadline dikecualikan dari penyebut |
| 2 sesi berakhir 00:10 dan 05:30 | Harian: `50m`, `2` sesi | Benar, bucket 00:00–05:59 terisi |
| Goal chapter Okt 2026, goal tanpa chapter, goal chapter 2024 | Harian: 2 baris (overlap + tanpa chapter), goal 2024 tidak tampil | Benar sesuai PRD + keputusan "goal tanpa chapter tetap tampil" |
| `scheduledMinutes` baru vs algoritma lama (`occursOn` per hari) | Identik untuk 3 rentang (bulanan 2026, tahunan 2026, 2024-01→2026-10) termasuk weekly, daily interval 2, once, until, exception, dan all-day dikecualikan | Tidak ada regresi perhitungan jadwal |

### Catatan putaran 2 (non-blocking)

1. **Rekor "sepanjang masa" tetap dibatasi jendela data yang dimuat** — pomodoro hanya memuat 180 hari
   (`apps/web/app/utils/pomodoro/persistence.ts:20`), habit 400 hari (`utils/habits.ts:84`). Fungsi
   `bestDayStreak`/`habitStreaks` sudah tidak memotong 365/120 hari, tetapi UI tidak bisa menampilkan
   rekor lebih tua dari data yang dimuat. Ini keterbatasan data-loading (area T7/T10), bukan regresi
   perbaikan ini. B8/B9 putaran 1 beres di level agregasi.
2. **Cold pass "Keseluruhan" multi-tahun = 154,6 ms** (masih < 200 ms, headroom ~23%), sedangkan klaim
   developer 62–80 ms berlaku untuk rentang tahunan. Tidak blocking, tapi kalau nanti ada data 5+ tahun
   perlu diukur ulang.
3. **`taskTotals.overdue` sekarang tidak dipakai** oleh kartu statistik (kartu "Task terlambat" diganti
   "Task tepat waktu" sesuai 5 metrik PRD F11; widget "Task terlambat" tetap ada). Sisa field/tipe tidak
   berbahaya, hanya dead-ish API.
4. **Label Keseluruhan hanya menyebut tahun** (`sejak Jan 2024`) walau window mulai Mei 2024. Kosmetik.
5. Test AC3 hanya mengintip `bars` + `scheduled`; secara arsitektur seluruh widget now membaca satu
   computed `aggregate`, tapi belum ada test yang menghitung pemindaian sumber (rekomendasi putaran 1
   tetap berlaku).

### Kesimpulan putaran 2

**LULUS.** Semua temuan High/Medium putaran 1 (B1–B10) terverifikasi beres lewat test QA yang tidak
diubah, regresi area terdampak hijau, dan klaim performa terbukti dengan pengukuran ulang. Tidak ada
bug blocking baru. Status Ergonio tidak diubah (`review`) — orkestrator yang memindahkan ke `done`.

---

## Verdict putaran 1: **GAGAL (blocking)**

AC1 lulus untuk 4 rentang navigable (Keseluruhan tidak punya tombol nav — lihat B11). **AC2 gagal** (metrik task, goal, "Keseluruhan",
rekor streak, habit rate tidak benar per rentang; satu metrik F11 tidak ada sama sekali). **AC3 gagal**
(agregasi dihitung ulang tiap tick 1 detik, dan satu pass agregasi saja 491 ms — di atas budget INP 200 ms).
AC4 tidak ada regresi yang ditemukan.

Perintah pembuktian (semua dijalankan di tree ini):

```
pnpm exec vitest run app/pages/app/overview.range.qa.test.ts app/utils/overview.aggregation.qa.test.ts
→ exit 1 · 12 failed | 8 passed (20)
```

---

## Scope & test plan

Diuji (terarah, bukan full suite):

| Area | Level | Alasan |
|---|---|---|
| `windowFor`, `focusBuckets`, `bestDayStreak`, `habitStreaks`, `activeGoals`, `taskTotals` | unit murni | AC "metrik & streak benar per rentang" |
| `useOverview` + halaman `overview.vue` (mountSuspended, state Nuxt nyata) | komponen + composable | AC navigasi, metrik yang tampil, biaya agregasi |
| `toTask` (`utils/tasks/persistence.ts`) | unit murni | akar masalah metrik task per rentang (`completedAt` dibuang) |
| Regresi primitif yang dipakai agregasi: `utils/habits`, `pomodoro`, `schedule`, `useHabits` consumer, `useDailyRoutine` | unit + composable | AC4 "widget yang memakai agregasi yang sama" |

Tidak diuji (dengan alasan):

- **E2E browser / Lighthouse**: semua data Overview lokal (IndexedDB/in-memory), tidak ada endpoint server;
  biaya render & agregasi diukur langsung di level komponen/fungsi (angka di bawah).
- **Dark mode / mobile viewport**: tidak ada perubahan styling pada scope T13.
- **Widget goal penuh (T18)**: integrasi goal di Overview milik T18; di sini hanya filter rentangnya.
- **Full suite**: dilarang oleh brief (banyak WIP agent lain di working tree).

---

## Acceptance criteria

| # | AC | Status | Bukti |
|---|---|---|---|
| 1 | 5 rentang (Keseluruhan/Harian/Pekanan/Bulanan/Tahunan) ada dan bisa dipilih | **PASS** | `overview.range.qa.test.ts:151` "kelima rentang bisa dipilih dan label rentang ikut berubah" → label berurutan `Keseluruhan · sejak Jan 2026` / `Rabu, 14 Oktober 2026` / `12 Okt – 18 Okt 2026` / `Oktober 2026` / `Tahun 2026`. Sumber: `utils/overview.ts:22-28`, `pages/app/overview.vue:71-79`. |
| 2 | prev/next jalan di tiap rentang | **PASS (parsial)** | Harian/pekanan/bulanan/tahunan: `overview.range.qa.test.ts:167` (13 Okt ⇄ 14 Okt, next disabled di hari ini), `:181` (5–11 Okt ⇄ 12–18 Okt), `:195` (September ⇄ Oktober, 2025 ⇄ 2026). **Keseluruhan tidak punya tombol nav** — `useOverview.ts:54` (`canNav = range !== 'keseluruhan'`) + `overview.vue:65` (`v-if="canNav"`). Lihat B11. |
| 3 | Semua metrik F11 benar per rentang | **FAIL** | 10 test merah: metrik "% task selesai tepat waktu" tidak ada (`:233`), habit rate Keseluruhan (`:240`), task selesai (`:255`), `completedAt` dibuang (`:273`), goal tidak difilter (`:297`), harian 0:00–23:00 (`:217`), rekor hari produktif (`:337`), rekor habit (`:342`), window Keseluruhan (`:352`), tren mood Keseluruhan (`:360`). |
| 4 | Ada unit test agregasi + streak | **FAIL (sebagian)** | Yang ada hanya `utils/overview.test.ts` (14 test: `windowFor`, `focusBuckets` harian/status, `currentDayStreak`, `bestDayStreak` 3 hari, `habitRate`, `habitHeatmap`, `scheduledMinutes`, `moodCorrelation`, `taskTotals`, `activeGoals`). **Tidak ada** test untuk `habitStreaks` (fungsi yang justru dipakai widget streak), tidak ada test filter rentang untuk task/goal, tidak ada test "Keseluruhan = semua data", tidak ada test agregasi-sekali. |
| 5 | Agregasi dihitung satu kali per ganti rentang, bukan per widget re-scan | **FAIL** | Syarat PRD: `docs/PRD.md:521` "Kalkulasi sekali per **ganti rentang**, bukan per widget re-scan". `overview.range.qa.test.ts:379` "tick jam 1 detik tidak menghitung ulang agregasi" → **3 recompute untuk 3 tick** di dua widget (fokus=3, jadwal=3; expected 0/0). `overview.aggregation.qa.test.ts:126` → satu pass agregasi **491 ms** (budget INP 200 ms). |
| 6 | Tidak ada regresi halaman Overview (#13) & widget pemakai agregasi | **PASS** | `overview.range.qa.test.ts:427` (5 kartu statistik, baris streak habit, heatmap tetap render). Regresi primitif: 6 file / **92 test lulus** (lihat perintah #2). `nuxt typecheck` exit 0. `gap`/`late`/`countdown` widget render dari data kosong tanpa error. |

---

## Bug (urut severity)

Semua reproduksi dijalankan dari `apps/web`:

```bash
pnpm exec vitest run app/pages/app/overview.range.qa.test.ts -t "<nama test>"
```

### B1 — High — "Keseluruhan" bukan semua data: window mulai 1 Januari tahun berjalan

- **Reproduksi**: `-t "Keseluruhan mencakup data sebelum tahun berjalan"` dan `-t "tren mood Keseluruhan memuat mood dari tahun lalu"`.
- **Expected**: PRD F11 "Keseluruhan — semua data sepanjang akun ada"; window mencakup memo 10 Mei 2024 → grafik mood mulai `1 Mei`.
- **Actual**: `windowFor('keseluruhan', 0, 2026-10-14).start = 2026-01-01`; mood axis = `1 Okt hari ini` (mood 2024 hilang); grafik fokus Keseluruhan hanya punya slot Jan–Okt 2026 (`date.getMonth()+1` slot).
- **Bukti**: `apps/web/app/utils/overview.ts:72-77` (start `new Date(year, 0, 1)`), `:128-135` (slot = bulan tahun berjalan), label i18n `overview.range.allTime` = "Keseluruhan · sejak Jan {year}" (`apps/web/i18n/locales/id.json`), pemakaian `win` di `useOverview.ts:53,74,258,313`. Dampak: jurnal/mood, jadwal rutin, goal, dan task dari tahun lalu tidak pernah masuk statistik "Keseluruhan".
- **Catatan**: sebagian data memang dibatasi jendela muat (pomodoro 180 hari `utils/pomodoro/persistence.ts:20`, habit 400 hari `utils/habits.ts:84`), tapi memo/goal/jadwal/task tidak — jadi bug ini nyata untuk fitur tersebut.

### B2 — High — Task selesai tidak per rentang; `completedAt` dibuang saat record dibaca UI

- **Reproduksi**: `-t "task selesai mengikuti rentang"` dan `-t "penyimpanan task"`.
- **Expected**: di rentang Harian, task yang selesai 10 Mei 2024 tidak dihitung → `0`; `toTask()` membawa `completedAt` supaya agregasi bisa memfilter.
- **Actual**: kartu "Task selesai" tetap `1` di Harian/Pekanan/Keseluruhan (`sub` = "total saat ini"); `toTask()` mengembalikan objek tanpa `completedAt` → `undefined`.
- **Bukti**: `apps/web/app/utils/overview.ts:176-182` (`taskTotals` tanpa parameter rentang), `apps/web/app/composables/useOverview.ts:127` (`taskTotals(tasks, now)`), `apps/web/app/utils/tasks/persistence.ts:96-109` (`toTask` hanya 7 field; `completedAt` hilang). Ironisnya `persistence.ts:64-67` sudah menulis komentar bahwa `completedAt` dipertahankan justru karena "Overview akan menghitung 'selesai hari ini' dari timestamp basi" — tapi nilainya tidak pernah sampai ke UI.

### B3 — High — Metrik F11 "% task selesai tepat waktu" tidak ada

- **Reproduksi**: `-t "ringkasan angka memuat"`.
- **Expected**: PRD F11 "Ringkasan Angka" butir 2: `% task selesai tepat waktu`.
- **Actual**: hanya 5 kartu — `menit fokus | sesi fokus | habit tercapai | task selesai | task terlambat`. Tidak ada kode/i18n untuk "tepat waktu".
- **Bukti**: `apps/web/app/composables/useOverview.ts:139-180`; `apps/web/i18n/locales/id.json` blok `overview.stat` (baris 479–490) tidak punya key tersebut; `grep -rn "tepat waktu"` di `apps/web/app` + i18n → kosong.

### B4 — High — Grafik & statistik fokus Harian kehilangan jam 00:00–05:59

- **Reproduksi**: `-t "harian: grafik fokus mencakup 0:00–23:00"`.
- **Expected**: PRD F11 "Grafik Fokus — Harian: per jam (0:00–23:00)" → 24 slot; sesi selesai 05:30 masuk (25 menit).
- **Actual**: 18 slot (06:00–23:00) dan sesi 05:30 tidak masuk bucket mana pun (`bucket === undefined → continue`), sehingga **menit fokus, jumlah sesi, dan grafik** untuk sesi dini hari hilang dari rentang Harian.
- **Bukti**: `apps/web/app/utils/overview.ts:101-107` (`for (let hour = 6; ...)`), `:142-145` (`buckets.find` → `continue` kalau tidak ketemu). Test lama justru mengunci 18 slot: `apps/web/app/utils/overview.test.ts:60-70` (assert `toHaveLength(18)`) — harus ikut diperbaiki.

### B5 — High — Agregasi dihitung ulang setiap tick 1 detik (bukan per ganti rentang)

- **Reproduksi**: `-t "tick jam 1 detik tidak menghitung ulang agregasi"`.
- **Expected**: AC eksplisit "agregasi dihitung satu kali per ganti rentang"; menaikkan `now` 1 detik di hari yang sama tidak mengubah window sehingga tidak boleh menghitung ulang.
- **Actual**: 3 tick → **3 recompute pada dua widget** (`fokus=3, jadwal=3`; expected `0,0`).
- **Bukti**: `useOverview.ts:53` (`win` bergantung pada `now`), `apps/web/app/plugins/ticker.client.ts:8-10` (`setInterval(tick, MS_PER_SECOND)`), lalu semua widget turunan `win` (`useOverview.ts:74-79, 127-136, 258-289, 313-319`) ikut invalid karena `windowFor` mengembalikan objek baru tiap evaluasi. Selain itu agregasi memang dipecah per widget (re-scan): sesi fokus dipindai 3× — `overview.ts:139` (`focusBuckets`), `:192` (`focusDaySet`), `:308` (`focusMinutesByDay`) dipanggil dari computed berbeda (`useOverview.ts:74, 183, 258`); memo 2× (`:200`, `:322`); task 3× (`:177`, `:185`, `:389`).

### B6 — High — Satu pass agregasi 491 ms; `scheduledMinutes` mendominasi karena `Intl` per hari×jadwal

- **Reproduksi**: `pnpm exec vitest run app/utils/overview.aggregation.qa.test.ts`.
- **Expected**: satu pass agregasi ≤ 200 ms (budget INP, `apps/web/.claude/rules/performance.md:11`).
- **Actual**: **491 ms** (best of 3) untuk fixture wajar: 20 jadwal mingguan, 20 habit (400 hari check-in), 150 sesi, 250 memo, 150 task.
- **Bukti/atribusi**: `apps/web/app/utils/overview.ts:363-385` — untuk tiap jadwal, loop semua hari di rentang dan panggil `occursOn` per hari (`:372-373`). `occursOn` → `occurrencesOn` → `expansionOf` dengan `tz = deviceTimeZone()` yang **membuat `Intl.DateTimeFormat()` baru tiap panggilan** (`apps/web/app/utils/time.ts:99-105`). Pengukuran mikro (harness sementara): 0,033 ms per `occursOn`, ~0,030 ms di antaranya `deviceTimeZone()`; skala per pass: 5 jadwal ≈ 125 ms, 10 ≈ 266 ms, 20 ≈ 531 ms, 40 ≈ 1039 ms (linear terhadap jumlah jadwal × hari). Fungsi lain kecil: `habitRate` 3,4 ms, sisanya < 1 ms.
- **Dampak gabungan B5+B6**: main thread diblokir ~0,5 detik **setiap detik** selama halaman Overview terbuka.

### B7 — Medium — Progress goal tidak difilter rentang

- **Reproduksi**: `-t "progress goal difilter rentang"`.
- **Expected**: PRD F11 "Progress Goal — Filter rentang: tampil goal yang ada chapter/item di rentang terpilih" → goal dengan chapter 1 Jan–31 Mar 2024 tidak tampil saat rentang Harian (14 Okt 2026).
- **Actual**: goal tetap tampil (`Goal lama 0% Tidak ada chapter berjalan`).
- **Bukti**: `apps/web/app/utils/overview.ts:413-426` (`activeGoals` hanya filter `status === 'aktif'`, tanpa window), dipanggil `useOverview.ts:322`.

### B8 — Medium — Rekor "hari produktif" dipotong 365 hari

- **Reproduksi**: `-t "rekor hari produktif"`.
- **Expected**: PRD "Rentang Keseluruhan: rekor sepanjang masa"; streak 5 hari yang berakhir 400 hari lalu → `5`.
- **Actual**: `0`.
- **Bukti**: `apps/web/app/utils/overview.ts:215` (`count = 365`), dipakai `useOverview.ts:186-188`. Catatan: riwayat pomodoro hanya dimuat 180 hari (`utils/pomodoro/persistence.ts:20`), jadi tanpa perbaikan jendela data, "rekor sepanjang masa" tak akan pernah > 180 hari.

### B9 — Medium — Rekor streak habit dipotong 120 hari (padahal data 400 hari tersedia)

- **Reproduksi**: `-t "rekor streak habit"`.
- **Expected**: rekor 5 hari yang terjadi 200 hari lalu → `best: 5`.
- **Actual**: `0`.
- **Bukti**: `apps/web/app/utils/overview.ts:237-242` (`count = 120`), sementara `HABIT_LOOKBACK_DAYS = 400` (`apps/web/app/utils/habits.ts:84`) dan `habitHeatmap` memakai 20 minggu.

### B10 — Medium — Habit completion rate "Keseluruhan" hanya 120 hari terakhir

- **Reproduksi**: `-t "habit completion rate Keseluruhan"`.
- **Expected**: check-in yang tercapai 200–229 hari lalu ikut dihitung → rate ≠ 0%.
- **Actual**: `0%`.
- **Bukti**: `useOverview.ts:27` (`HABIT_HISTORY_DAYS = 120`) + `:128-136` (`Math.max(win.start, now-120h)`), padahal data 400 hari dimuat. Untuk rentang Harian/Pekanan/Bulanan/Tahunan perilaku ini wajar (window lebih pendek), hanya "Keseluruhan" yang salah.

### B11 — Low — Tombol prev/next tidak ada di rentang Keseluruhan

- **Expected (literal AC)**: "5 rentang … + prev/next jalan di tiap rentang".
- **Actual**: `canNav=false` untuk `keseluruhan`, jadi seluruh grup nav tidak dirender.
- **Bukti**: `apps/web/app/composables/useOverview.ts:54`, `apps/web/app/pages/app/overview.vue:65`.
- **Penilaian**: bisa dibela kalau "Keseluruhan" benar-benar all-time (tidak ada yang bisa dinavigasi). Tapi karena implementasi sekarang = year-to-date (B1), user tidak punya cara melihat tahun sebelumnya sama sekali. Perbaiki B1 dulu, lalu putuskan: nav per tahun, atau hapus opsi Keseluruhan dari navigasi secara eksplisit di PRD.

### B12 — Low (ambigu) — Distribusi Eisenhower & heatmap tidak mengikuti rentang

- **Actual**: `eisenhowerCounts(tasks)` dan `habitHeatmap(..., weeks = 20)` tidak menerima window (`overview.ts:184-188`, `:279-303`; `useOverview.ts:230-255, 292-305`). Ganti rentang tidak mengubah kedua widget.
- **Penilaian**: PRD tidak menyebut filter rentang untuk kedua widget ini secara eksplisit (berbeda dengan goal). AC "semua metrik per rentang" bisa dibaca mencakup keduanya. Tidak saya jadikan test merah; perlu keputusan produk.

### O1 — Low (deviasi PRD, bukan blocker) — Chart library

- PRD `docs/PRD.md:534` menyebut "Chart library: Recharts atau similar (lite)". Implementasi memakai bar CSS + SVG inline (`pages/app/overview.vue:101-116, 190-201`).
- **Penilaian**: deviasi ini justru menguntungkan pilar performa (nol dependency chart, JS awal tidak bertambah) dan konsisten dengan `performance.md:46` (library berat wajib dynamic import). Tidak perlu diubah; cukup dicatat sebagai trade-off.

### B13 — Medium (integritas test) — Test lama mengunci perilaku yang bertentangan dengan PRD

- `apps/web/app/utils/overview.test.ts:60-70` mengunci 18 slot (06:00–23:00) — bertentangan dengan PRD "per jam (0:00–23:00)" dan akan gagal setelah B4 diperbaiki. Test ini harus diubah bersama perbaikannya, bukan dihapus.
- Tidak ada test sama sekali untuk `habitStreaks` (fungsi yang punya bug B9), untuk filter rentang `activeGoals` (B7), dan untuk "Keseluruhan = semua data" (B1). Itu sebabnya `vitest run` hijau walau AC gagal.

---

## Cek tiga pilar

- **Keamanan — lulus.** Overview hanya membaca state lokal; tidak ada server route, `$fetch`, `v-html`, atau `innerHTML`. Semua teks user (judul task/goal/habit, memo) dirender lewat interpolasi Vue; heatmap memakai atribut `title` (teks, bukan HTML). Tidak ada `console.*` di `utils/overview.ts`, `composables/useOverview.ts`, `pages/app/overview.vue`. Tidak ada data sensitif yang dikirim ke client lain/SSR payload (semua data milik user sendiri).
- **Performa — gagal.** B5 (recompute tiap 1 detik) + B6 (491 ms per pass; `scheduledMinutes` O(hari × jadwal × Intl)). Budget INP 200 ms (`apps/web/.claude/rules/performance.md:11`) terlampaui 2,5×, setiap detik. Tidak ada dependency baru; bundle tidak berubah.
- **Kerapian — lulus dengan catatan.** `eslint --max-warnings 0` dan `prettier --check` hijau untuk file QA; `nuxt typecheck` exit 0; tidak ada `any`/`@ts-ignore`/`.only`/`.skip` di file QA. Catatan: (a) `useOverview.ts` 397 baris dengan 10+ computed yang masing-masing memindai sumbernya sendiri — justru akar AC3; (b) `habitStreaks` memakai `HABIT_COLORS` yang **tidak di-import** di `utils/overview.ts:259` dan hanya hidup karena auto-import Nuxt (terbukti `typecheck` lolos dan halaman render, tapi file util ini tidak bisa dipakai di luar konteks Nuxt — harness `tsx` saya gagal dengan `ReferenceError`); (c) `HABIT_HISTORY_DAYS`, `count = 365`, `count = 120` adalah tiga angka ajaib berbeda untuk konsep "riwayat" yang sama.

---

## Perintah & hasil (exit code apa adanya, cwd `apps/web` kecuali disebut)

| # | Command | Exit | Hasil |
|---|---|---|---|
| 1 | `pnpm exec vitest run app/pages/app/overview.range.qa.test.ts app/utils/overview.aggregation.qa.test.ts` | **1** | 2 file, **12 failed \| 8 passed (20)** |
| 2 | `pnpm exec vitest run app/utils/overview.test.ts app/utils/habits.test.ts app/utils/pomodoro.test.ts app/utils/schedule.test.ts app/composables/useHabits.consumers.test.ts app/composables/useDailyRoutine.test.ts` | **0** | 6 file, **92 test lulus** (regresi primitif agregasi) |
| 3 | `pnpm exec nuxt typecheck` | **0** | tanpa output error |
| 4 | `pnpm exec eslint --max-warnings 0 app/pages/app/overview.range.qa.test.ts app/utils/overview.aggregation.qa.test.ts` | **0** | bersih |
| 5 | `pnpm exec prettier --check apps/web/app/pages/app/overview.range.qa.test.ts apps/web/app/utils/overview.aggregation.qa.test.ts` (root) | **0** | "All matched files use Prettier code style!" |

Angka tambahan (harness sementara, tidak di-commit — fixture: 20 jadwal mingguan, 20 habit 400 hari, 150 sesi, 250 memo, 150 task):

| Pengukuran | Hasil |
|---|---|
| 1 pass agregasi penuh (tahunan) | 491–531 ms |
| `scheduledMinutes` 5 / 10 / 20 / 40 jadwal | 125 / 266 / 531 / 1039 ms |
| `occursOn` per panggilan (`start` 30 / 300 / 1000 hari lalu) | 0,033 / 0,033 / 0,034 ms |
| `deviceTimeZone()` per panggilan | 0,030 ms (≈90% biaya `occursOn`) |
| `habitRate` (20 habit × 287 hari) | 3,4 ms |
| Fungsi lain (fokus, mood, task, streak) | < 1 ms masing-masing |

Catatan kejujuran: percobaan pertama saya memakai `tsx` di luar Nuxt dan gagal karena `HABIT_COLORS`
mengandalkan auto-import (lihat kerapian). Setelah pindah ke harness Vitest `environment: nuxt`, semua
angka valid. Saya juga sempat salah memasang probe AC3 (counter hanya diperbarui saat render) sehingga
test tick sempat hijau palsu; sudah diperbaiki (counter di dalam `watch` computed).

---

## Coverage & celah test yang tersisa

- AC1 terkunci untuk 4 rentang navigable (label + prev + next + disabled di rentang berjalan). Keseluruhan
  sengaja tidak diuji karena keputusan produknya belum jelas (B11).
- AC2: 12 test; 10 merah = daftar bug B1–B4, B7, B8, B9, B10. Yang hijau mengunci slot 7/31/12 dan
  semantik streak aktif vs rekor (perilaku yang sudah sesuai PRD).
- AC3: bukti arsitektural (jumlah recompute per tick) + bukti biaya (ms per pass). Belum ada test yang
  menghitung **jumlah pemindaian sumber** per ganti rentang — akan berguna setelah refactor: usulkan
  satu fungsi agregasi tunggal (`aggregateOverview(state, range, off, now)`) yang dipanggil sekali dan
  dikembalikan sebagai satu objek, lalu test menghitung `panggilan === 1` per ganti rentang.
- Rekomendasi perbaikan (untuk `dimas`):
  1. Satu `computed` agregasi per `(range, off)` yang **tidak** bergantung pada `now` per detik; `now`
     dipakai hanya untuk nilai "berjalan" (mis. sisa waktu) atau dibulatkan ke menit/hari.
  2. `scheduledMinutes` pakai ekspansi sekali per rentang (`occurrencesBetween(schedules, fromDay, toDay)`)
     + oper `tz` yang di-cache, bukan `occursOn` per hari × jadwal.
  3. Kembalikan `completedAt` dari `toTask` dan filter task selesai/on-time dengan window.
  4. Tetapkan window "Keseluruhan" dari data terlama yang dimuat (atau seluruh riwayat) dan pakai untuk
     semua widget + filter goal.
  5. Naikkan jendela rekor ke seluruh data yang dimuat; samakan konstanta riwayat.
  6. Tambah metrik "% task selesai tepat waktu" + test-nya.
  7. Perbaiki `overview.test.ts:60-70` (24 slot) bersama B4, dan tambah unit test `habitStreaks`.

---

## Kesimpulan

**GAGAL.** Navigasi 5 rentang bekerja, tetapi AC inti T13 belum terpenuhi: metrik F11 tidak dihitung per
rentang (task, goal, habit rate, rekor streak, "Keseluruhan"), satu metrik wajib belum ada sama sekali, dan
agregasi justru dihitung ulang tiap detik dengan biaya ~0,5 s per pass. Status Ergonio tidak diubah
(`review`) dan tidak ada komentar handoff dari developer di task #27 (0 komentar) — orkestrator perlu
memposting verdict ini beserta daftar bug di atas.
