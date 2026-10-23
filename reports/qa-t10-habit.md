# QA verification — Task #24 [T10] Habit: CRUD, check-in, streak

Tanggal: 2026-10-22 · Reviewer: Fajar (QA) · Tree: `f8a9a5c` (working tree ada perubahan agent lain, tidak
disentuh QA) · Status task: `review` (tidak diubah, sesuai instruksi).

Rules dibaca: root `CLAUDE.md`, `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`,
`apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`.
Requirement: `docs/PRD.md` F7 (baris 274–316) + AC T10 (baris 1094).

Environment: Node `v24.18.0`, `vitest 5.0.3`, pnpm workspace, TZ host `Asia/Jakarta` (UTC+7).

**Tidak ada kode produk yang diubah QA.** Satu-satunya perubahan dari saya:
`?? apps/web/app/composables/useHabits.checkin-streak.qa.test.ts` (4 test, 251 baris).

---

## Verdict: **LULUS**

Semua acceptance criteria T10 terbukti lewat eksekusi test, termasuk AC inti "hari non-jadwal tidak
memutus streak" di empat lapisan (core calc, fungsi murni web, composable yang dipakai UI, dan perilaku
backfill). CRUD + check-in + persistensi lulus; tidak ada regresi di halaman Habit dan widget Daily.
Tidak ada bug blocking. Tiga catatan non-blocking ada di bagian akhir.

---

## Scope & test plan

Diuji (fokus T10, tanpa full suite supaya tidak bentrok dengan agent lain):

| Area | Level | Alasan |
|---|---|---|
| `habitStreak` / `longestHabitStreak` (core) | unit murni | AC eksplisit: streak habit hari tertentu + unit test |
| `currentStreak`, `isScheduled`, `nextCount`, `completionRate` (web) | unit murni | rumus yang benar-benar dipakai UI Habit/Daily |
| `useHabits` (hydrate, save, remove, setArchived, toggleDay, toggleToday, streakOf) | composable + sesi memori | AC CRUD, check-in, persistensi, "check-in mengubah streak" |
| Grid Habit, form, arsip | komponen | regresi halaman Habit (#9) |
| `useDailyRoutine` + consumer Daily/Overview/Pomodoro | composable | regresi widget Daily |
| Persistensi core (record `habit` + `habit_checkin`) | unit + sesi | data tidak hilang setelah reload |

Tidak diuji (dengan alasan):

- **Lighthouse/CWV dan benchmark**: tidak ada perubahan produk pada putaran review ini (file habit bersih
  terhadap `HEAD`), dan menjalankan build/Lighthouse berisiko bentrok dengan agent lain. Angka performa
  jalur baca habit sudah diukur di `reports/t10-habit-qa/qa-report-2.md` (hydrate 1.800 baris = 22,3 ms;
  hapus 1 habit = 247 ms) — jalur baca masih ber-index dan berjendela tetap 400 hari.
- **E2E browser (Playwright)**: alur habit bersifat lokal (IndexedDB) dan sudah dibuktikan di level
  komponen + composable dengan sesi nyata; tidak ada endpoint server habit.
- **iOS/Android**: habit hanya ada di `apps/web` pada scope T10.

---

## Acceptance criteria

| # | AC | Status | Bukti |
|---|---|---|---|
| 1 | Streak benar untuk habit yang dijadwalkan hanya pada hari tertentu; hari non-jadwal tidak memutus | **PASS** | Core: `packages/core/src/calc/streak.ts:80-85` (hari non-jadwal `continue`, bukan break) + test `packages/core/src/calc/streak.test.ts:120` "habit Senin-Jumat TIDAK putus di akhir pekan" (10 hari kerja lintas 2 pekan → `current: 10`). Web: `apps/web/app/utils/habits.ts:123-132` + `app/utils/habits.test.ts:43` "Senin–Jumat: akhir pekan tidak memutus streak" (Sen 12, Jum 9, Kam 8 → 3). Composable: `app/composables/useHabits.consumers.test.ts:99` (Sen–Jum streak 6, pembanding habit harian streak 1). QA baru: `useHabits.checkin-streak.qa.test.ts:206` (Sabtu/Minggu 17–18 tidak bisa dicentang dan streak tetap 2). |
| 2 | Ada unit test streak untuk skenario itu | **PASS** | 8 test khusus di `packages/core/src/calc/streak.test.ts:119-208` (weekend exception, satu-hari-per-pekan, hari jadwal terlewat tetap memutus, habit akhir pekan) + 4 test di `apps/web/app/utils/habits.test.ts:33-55`. Keduanya lulus (lihat tabel command #1, #2). |
| 3 | CRUD habit (buat/edit/arsip/hapus) dan check-in jalan; check-in hari ini mengubah streak dengan benar; hari lampau sesuai aturan PRD | **PASS** | Check-in: `useHabits.ts:279-310` (`setDay` → `toggleDay` → `persistCheckin`); aturan klik satu untuk semua hari (`utils/habits.ts:155-157`) dibuktikan `useHabits.qa.test.ts:151` (hari lampau target 3 → 1,2,3,0) dan `useHabits.test.ts:282`. CRUD: `useHabits.ts:320-341` (save/create+edit), `:344-369` (remove + check-in ikut terhapus), `:372-385` (archive/unarchive); test `useHabits.qa.test.ts:294` (rename+target+check-in lama utuh), `:333` (hapus tanpa yatim), `:390` (arsip hilang dari aktif, tidak bisa check-in, bisa dikembalikan). **Streak berubah karena check-in** (celah yang saya tutup): `useHabits.checkin-streak.qa.test.ts:164` — streak 5 → check-in hari ini → **6** → batal → **5**; `:184` — backfill Rabu yang terlewat menyambung 1 → 4 → tambah hari ini → 5. |
| 4 | Data habit persisten (tidak hilang setelah reload) dan tidak ada regresi halaman Habit (#9) / widget Daily | **PASS** | Persistensi: `useHabits.checkin-streak.qa.test.ts:230` (6 check-in ditulis ke storage, sesi dibuka ulang → hari & streak 6 sama), `useHabits.qa.test.ts:376` (warna/arsip setelah sesi baru), `useHabits.test.ts:377` (hydrate riwayat tersimpan), `app/utils/habits/persistence.test.ts` + `habit-color.test.ts` (jalur kripto/IndexedDB asli, 27 test lulus). Regresi halaman: `app/pages/app/habit.test.ts` 2 test (arsip tidak di grid, error bukan "belum ada habit"), `HabitGrid.test.ts` 8 test, `HabitForm*.test.ts` 9 test, `HabitArchive.test.ts` 3 test. Regresi Daily: `useHabits.consumers.test.ts:168` (daftar habit hari ini + progres hanya habit aktif) dan `useDailyRoutine.test.ts` — semuanya lulus (command #4). |
| 5 | Tidak ada `any`/`console.log` baru; tidak ada `.only`/`.skip` | **PASS** | `grep -rn "it\.only\|describe\.only\|\.skip(\|console\.log"` pada seluruh file habit (sumber + test, web + core) → **kosong**. `eslint --max-warnings 0` pada file QA baru → exit 0. `prettier --check` → bersih. `any` tidak ditemukan di sumber habit (`useHabits.ts`, `utils/habits*`, `HabitGrid.vue`, `DailyHabitCard.vue`, `streak.ts`, `habit.ts`). |

---

## Bug

Tidak ada bug blocking. Tidak ada cacat yang bisa direproduksi lewat UI pada scope T10.

Tiga catatan **non-blocking** (bukan alasan GAGAL):

| # | Severity | Temuan | Bukti | Dampak |
|---|---|---|---|---|
| O1 | Low | `toggleToday` tidak memeriksa `isScheduled(today)`, sedangkan `toggleDay` memeriksa. Kalau kelak ada consumer yang memanggilnya untuk habit yang tidak dijadwalkan hari ini, akan tertulis check-in di hari non-jadwal. | `apps/web/app/composables/useHabits.ts:297-302` (guard lengkap) vs `:305-310` (hanya guard arsip) | Tidak terlihat user sekarang: satu-satunya pemanggil UI (`useDailyRoutine.ts:197`) hanya merender habit yang terjadwal hari ini (`:145-147`). Streak pun tidak terpengaruh karena hari non-jadwal dilewati. Rekomendasi: samakan guard sebelum menambah consumer. |
| O2 | Low | Check-in yang di-backdate lebih dari 400 hari tersimpan tapi tidak terbaca lagi setelah reload; navigasi bulan di halaman Habit tidak punya batas bawah. | `apps/web/app/utils/habits/persistence.ts:200-208` + `HABIT_LOOKBACK_DAYS` (`utils/habits.ts:84`); sudah tercatat sebagai trade-off di `reports/t10-habit-qa/qa-report-2.md` | Hanya jalur backfill ekstrem (>1 tahun); data tidak hilang dari storage, hanya di luar jendela baca UI. |
| O3 | Low (kerapian) | Ada tiga implementasi aturan streak: core `habitStreak`/`longestHabitStreak`, web `currentStreak`, dan `overview.habitStreaks` (best). Ketiganya **konsisten** mengabaikan hari non-jadwal saat ini, tapi duplikasi ini rawan divergen saat aturan PRD berubah. | `packages/core/src/calc/streak.ts:64,143`; `apps/web/app/utils/habits.ts:123`; `apps/web/app/utils/overview.ts:237` | Tidak ada gejala sekarang (semua diuji). Rekomendasi jangka panjang: jadikan core satu-satunya sumber, dipakai web + mobile. |

---

## Cek tiga pilar (checklist rules)

- **Keamanan — lulus.** Tidak ada route server habit (data lokal terenkripsi lewat `record-writer`); nama
  habit dirender sebagai teks, bukan HTML — dibuktikan `HabitGrid.test.ts:190` (`<b>`/`<img onerror>` tetap
  teks). Validasi input berlapis: `validateHabitDraft` (`utils/habits.ts:186-195`) + skema core strict
  (`packages/core/src/domain/entities/habit.ts:80-124`). Tidak ada `console.*`/PII di jalur habit.
- **Performa — lulus (tidak diukur ulang, tidak ada perubahan produk).** Streak berhenti saat putus dan
  dibatasi 400 iterasi/habit (`utils/habits.ts:125`); baca riwayat memakai index rentang berjendela tetap,
  bukan `listAll` (`persistence.ts:182-214`). Angka terukur ada di report #2. Biaya `removeHabit` O(n)
  dekripsi sudah didokumentasikan sebagai trade-off.
- **Kerapian — lulus dengan catatan O3.** Tidak ada `any`/`@ts-ignore`/`console.log` di kode habit; aturan
  klik check-in satu tempat (`nextCount`); komentar menjelaskan "kenapa". Duplikasi streak (O3) adalah
  utang struktur, bukan bug.

---

## Perintah & hasil (exit code apa adanya)

| # | Command (cwd) | Exit | Hasil |
|---|---|---|---|
| 1 | `pnpm exec vitest run src/calc/streak.test.ts src/domain/entities/habit.test.ts` (`packages/core`) | **0** | 2 file, **28 test lulus** |
| 2 | `pnpm exec vitest run app/utils/habits.test.ts app/utils/habits/persistence.test.ts` (`apps/web`) | **0** | 2 file, **27 test lulus** |
| 3 | `pnpm exec vitest run app/composables/useHabits.test.ts app/composables/useHabits.qa.test.ts app/composables/useHabits.consumers.test.ts app/pages/app/habit.test.ts app/components/features/habit/{HabitGrid,HabitForm,HabitForm.validation,HabitArchive}.test.ts` (`apps/web`) | **0** | 8 file, **63 test lulus** |
| 4 | `pnpm exec vitest run app/composables/useHabits.test.ts app/composables/useHabits.qa.test.ts app/composables/useHabits.consumers.test.ts app/composables/useHabits.checkin-streak.qa.test.ts app/composables/useDailyRoutine.test.ts app/pages/app/habit.test.ts app/components/features/habit/ app/utils/habits.test.ts app/utils/habits/ app/utils/overview.test.ts` (`apps/web`) | **0** | 15 file, **122 test lulus** |
| 5 | `pnpm exec eslint --max-warnings 0 app/composables/useHabits.checkin-streak.qa.test.ts` (`apps/web`) | **0** | tanpa output = bersih |
| 6 | `pnpm exec prettier --check apps/web/app/composables/useHabits.checkin-streak.qa.test.ts` (root) | **0** | "All matched files use Prettier code style!" |

Catatan kejujuran: run pertama file QA baru saya **gagal 2/4** karena kesalahan harness saya sendiri —
(1) jam global `useState('now')` tidak ikut dimajukan pada skenario hari Jumat, dan (2) `vi.waitFor`
menunggu state optimistis (sinkron) sehingga reload terjadi sebelum antrean tulis selesai. Keduanya
diperbaiki di test (bukan produk): jam di-set per skenario dan penantian dilakukan pada record yang
benar-benar tersimpan (`listAll`). Setelah itu 4/4 lulus.

---

## Coverage & celah yang tersisa

- Aturan streak non-jadwal kini terbukti di 4 lapisan: core (unit), web (unit), composable consumer, dan
  alur check-in → streak (QA baru). Regresi rumus akan tertangkap di lebih dari satu tempat.
- Celah yang masih ada (tidak blocking, bukan AC T10):
  1. Belum ada test yang mengunci **kesamaan hasil** ketiga implementasi streak (O3) — kalau salah satu
     diubah, tidak ada test yang membandingkan hasilnya lintas implementasi.
  2. Batas 400 hari (O2) belum punya test yang mendokumentasikan perilaku "tersimpan tapi tak terbaca";
     saat ini hanya komentar.
  3. `toggleToday` tanpa guard jadwal (O1) belum punya test — sengaja tidak saya kunci supaya guard-nya
     bisa diperbaiki tanpa mengubah test.
- Rekomendasi: (a) tambahkan guard `isScheduled` di `toggleToday` saat ada consumer baru; (b) konsolidasi
  rumus streak ke `packages/core` agar web & mobile memakai satu aturan; (c) pertimbangkan batas bawah
  navigasi bulan Habit atau perjelas hint backfill.

---

## Kesimpulan

**LULUS.** AC T10 ("streak benar untuk habit hari tertentu, hari non-jadwal tidak memutus, unit test
streak") terbukti dengan test yang dijalankan pada tree ini, ditambah bukti CRUD/check-in/persistensi dan
nol regresi di halaman Habit maupun widget Daily. Tidak ada perubahan kode produk dari QA; status Ergonio
tidak diubah (sesuai instruksi).
