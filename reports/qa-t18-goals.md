# QA Report — T18: Halaman Goals + field "Untuk goal" + integrasi

- **Task:** Ergonio #32 (personal-productivity). Status putaran 1: `review`; status putaran 2 saat dicek: `prog` (lihat bagian Putaran 2).
- **Tanggal:** 2026-10-23 (putaran 1 & 2)
- **Commit:** `f8a9a5c` + working tree (putaran 2 mencakup perubahan T18 di `apps/web/app/**`; tidak ada commit dari QA)
- **Environment:** Linux, Node v24.18.0, pnpm 11.17.0, Vitest 5.0.3, `@nuxt/test-utils` (env `nuxt`)

---

# Putaran 2 — Verdict: **LULUS**

- **Tanggal:** 2026-10-23 (putaran 2, setelah perbaikan `dimas`)
- **Status Ergonio saat dicek:** `prog` (progress 50), **bukan** `review` seperti yang diinformasikan orchestrator. QA **tidak mengubah status**; orchestrator perlu memindahkan sendiri ke `review` → `done`.
- **Hasil utama:** 4 file test QA T18 dijalankan **apa adanya** → **19/19 lulus**. Ditambah 7 file goal/QA pendukung + regresi terarah: **377 test web** dan **89 test core** hijau. `typecheck`, ESLint, dan Prettier untuk 4 file QA hijau.
- **Tidak ada bug blocking.** B1–B6 putaran 1 terverifikasi lewat test; B7 (countdown) terverifikasi lewat inspeksi kode karena belum ada test-nya. Sisa risiko non-blocking di §3.

## 1. Test QA putaran 1 vs putaran 2

Tidak ada test QA yang diubah/dilemahkan. Bukti: `mtime` keempat file (05:40–05:43) **lebih awal** dari report putaran 1 (05:46) dan dari seluruh perubahan produk (mulai 07:17); jumlah `it()` tetap 9 + 6 + 2 + 2 = 19, tanpa `.only`/`.skip`.

| File | `it()` | mtime | sha256 (16 char) | Putaran 1 | Putaran 2 |
|---|---|---|---|---|---|
| `app/utils/goals.parity.qa.test.ts` | 9 | 05:41:14 | `2674c87d9d616a25` | 5 gagal / 4 lulus | **9 lulus** |
| `app/utils/goals.links.qa.test.ts` | 6 | 05:40:10 | `9a51779fcf084161` | 4 gagal / 2 lulus | **6 lulus** |
| `app/composables/useGoals.source.qa.test.ts` | 2 | 05:43:53 | `3bf28e001876b2af` | 2 gagal | **2 lulus** |
| `app/components/features/habit/HabitForm.goal.qa.test.ts` | 2 | 05:40:33 | `194b5bf5c1019281` | 1 gagal / 1 lulus | **2 lulus** |

Catatan: hash di atas adalah hash **sekarang** (tidak ada baseline hash tersimpan dari putaran 1). Argumen "tidak berubah" bersandar pada `mtime` yang mendahului report & semua edit produk, serta isi test yang identik dengan kutipan report putaran 1.

## 2. Acceptance criteria

| # | Acceptance criteria | Hasil | Bukti |
|---|---|---|---|
| 1 | Stepper chapter + progress tampil benar; angka **sama dengan `goalProgressReport` core** (per tipe, 1 desimal, Sepanjang goal, chapter kosong, `terlewat`/`ditutup`) | **PASS** | `app/utils/goals.parity.qa.test.ts` 9/9: `2 task (1 selesai) + 1 habit 100% -> core rata-rata per tipe` (75), `3 task (1 selesai) -> pembulatan 0.1 desimal` (33.3), `chapter berisi + chapter kosong: bobot sama` (37.5), `Sepanjang goal` (75). Implementasi memakai primitif core: `apps/web/app/utils/goals.ts:123-126` (`clampPercent`), `:140-166` (`taskProgressPercent`/`chapterProgressPercent`), `:182-195` (`coreChapterStatus`), `:198-201` (`mainGoalProgressPercent`). Dataset campuran (task+habit+jadwal) → **83.3** di keduanya: `app/utils/goals.lifecycle.qa.test.ts:309-442`. |
| 2 | Dropdown "Untuk goal" = Sepanjang goal + chapter; tersedia di form task/habit/jadwal; tautan dua arah; pindah chapter = record yang sama; hapus goal/chapter tidak meninggalkan tautan yatim | **PASS** | `app/utils/goals.links.qa.test.ts` 6/6 (habit & jadwal kembali dengan `goalId`, draft task punya `goalId`). `HabitForm.goal.qa.test.ts` 2/2. `app/utils/goals.lifecycle.qa.test.ts` 6/6: pindah chapter tetap **1** tautan, hapus chapter → `chapterId: null`, hapus goal → tautan `[]` & item tetap ada, goal/chapter basi tidak dihidupkan. Kode: `app/utils/goals/links.ts:76-140` (`attachGoalLink`+`checkGoalLinksUnique`), `:181-200` (opsi picker); form `TodoForm.vue:119-132`, `ScheduleForm.vue:156-169`, `HabitForm.vue:221-234`; persistensi `useTasks.ts:171-188`, `useHabits.ts:346-352`, `useSchedules.ts:157-163`; hapus item `:245`/`:378`/`:198`; hapus chapter `utils/goals/persistence.ts:174-192`; hapus goal `:194-204`. |
| 3 | Kartu review Daily muncul saat chapter berakhir/terlewat & akhir pekan; jawaban masuk jurnal | **PASS** | `app/components/features/daily/DailyGoalReviewCard.qa.test.ts` 5/5: muncul saat chapter terlewat & berakhir hari ini, tidak muncul saat berjalan/non-weekend atau goal selesai, jawaban masuk jurnal hari itu dengan mention goal lalu kartu tertutup. Pemicu: `utils/goals.ts:235-279` (terlewat/berakhir/akhir pekan; weekend diuji `utils/goals.test.ts:125-149`). Simpan: `DailyGoalReviewCard.vue:59-66` → `useMemos.append` (`useMemos.ts:100-118`), token `#[goalId]`. Kartu dipasang di Daily: `pages/app/index.vue:44`. |
| 4 | Teks goal (judul/deskripsi) dirender aman (escape, tanpa `v-html` data user) | **PASS** | `grep -rn "v-html" apps/web/app` → **0**; `innerHTML`/`eval(`/`new Function` → 0 di kode produksi (hanya muncul di file test). Chip jurnal memakai `v-text`: `components/features/memo/MemoGoalMention.vue:18-32`. Picker & hero memakai interpolasi teks (`GoalPicker.vue:19-35`, `GoalHero.vue:42-43`). |
| 5 | Integrasi jurnal `#goal`, countdown, kalender, Overview, Daily tidak error | **PASS** | Jurnal: `app/components/features/memo/MemoGoalMention.qa.test.ts` 2/2 (chip bisa dibuka; goal dihapus → label redup tanpa navigasi), parser `utils/memo.ts:38-61,90-93`, render `JournalNote.vue:16-22,81-86` + `MemoEntry.vue:48-49`. Countdown: `GoalHero.vue:59-64` membawa `title`+`date`; `pages/app/countdown.vue:23-36` memvalidasi ISO & memotong judul (B7, inspeksi kode — belum ada test). Kalender/Overview membaca `useGoals` repository: `useCalendarData.ts:30,74-95`, `useOverview.ts:72,90,151`; regresi 150 test hijau. |
| 6 | Persistensi nyata: goal bertahan setelah reload (bukan cache modul), tanpa 5 goal contoh, ganti akun tidak menampilkan data akun lama | **PASS** | `app/composables/useGoals.storage.qa.test.ts` 2/2 membuang state **dan cache modul** lalu membaca ulang dari penyimpanan memory; sesi kosong = `[]`. Mock dihapus (`app/composables/goals/mock.ts` = `D` di git status; `grep createGoalsMock` → 0). `useGoals.ts:73` default `[]`, hydrate dari `loadGoalRecords` (`:103-151`). Ganti akun: `useGoals.accountSwitch.qa.test.ts` 1/1 + watcher `useGoals.ts:306-318` dan `useGoalLinks.ts:56-67`. |

## 3. Bug & temuan

**Tidak ada bug blocking.** B1–B7 putaran 1 sudah tidak reproducible (test yang sebelumnya merah sekarang hijau tanpa mengubah ekspektasi).

Temuan non-blocking / risiko yang wajib dicatat:

### N1 — [Low] Jawaban review hilang setelah reload karena jurnal/memo masih in-memory
**Lokasi:** `apps/web/app/composables/useMemos.ts:42-44` (komentar "Fase 1: in-memory"), `:100-118` (`append` hanya menulis `useState`), `DailyGoalReviewCard.vue:59-66`.
**Dampak:** AC3 "jawaban jadi bagian jurnal" terpenuhi dalam sesi (dan terverifikasi test), tetapi setelah reload jawaban hilang. Ini keterbatasan F8 yang **sudah ada sebelum T18**, bukan regresi T18.
**Rekomendasi:** follow-up task persistensi jurnal (enkripsi via `packages/core`), lalu tambah test reload untuk jawaban review.

### N2 — [Low] WeakMap mapper bisa diam-diam membuang tautan bila dipanggil satu argumen
**Lokasi:** `apps/web/app/utils/habits/persistence.ts:118-155` (`goalPlaceByPayload`), `apps/web/app/utils/schedules/persistence.ts:99-110`.
**Dampak:** `fromCoreHabit(payload)`/`toSchedule(payload, tz)` tanpa argumen `place` mengembalikan `NO_GOAL_PLACE`. Jalur produksi saat ini benar (`habits/persistence.ts:210`, `schedules/persistence.ts:214`), tetapi pemanggil baru bisa kehilangan tautan tanpa error.
**Rekomendasi:** jadikan `place` parameter wajib untuk jalur baca, atau baca `goal_link` di repository (bukan WeakMap).

### N3 — [Low] `goalId` di state item tetap basi sampai reload setelah goal dihapus
**Lokasi:** `apps/web/app/composables/useGoals.ts:234-248` (hanya membersihkan cermin `goalLinks`), `useHabits.ts:173`/`useTasks.ts:88`/`useSchedules.ts:56` (tidak ada watcher balik ke state item).
**Dampak:** setelah hapus goal tanpa reload, `GoalPicker` tidak menandai opsi apa pun (goal sudah tidak ada di opsi, "Tidak ada" juga tidak aktif). Simpan ulang aman (tautan dibersihkan oleh `syncItemGoalLink`), jadi tidak ada tautan yatim — hanya UI yang bisa membingungkan.
**Rekomendasi:** turunkan tempat goal item dari `goalLinks` (single source) atau `apply(null)` juga ke state item.

### N4 — [Info] Test reload di file QA putaran 1 masih bisa lulus lewat cache modul
`useGoals.source.qa.test.ts` hanya `clearNuxtState(['goals'])`, sedangkan `useGoals` punya `cachedGoals` module-level (`useGoals.ts:51`). Bukti persistensi nyata ada di `useGoals.storage.qa.test.ts:126-146` yang juga me-reset cache modul. Jangan memakai test pertama sebagai satu-satunya bukti persistensi.

### N5 — [Info] Celah test yang tersisa
Kartu weekend diuji di level util (`goals.test.ts:125-149`), belum di level komponen Daily. Sinkronisasi tautan dari dua tab bersamaan (race) belum diuji.

## 4. Perintah & hasil (putaran 2)

```bash
# 1) 4 file test QA T18, apa adanya
pnpm --filter @improve-personal/web exec vitest run \
  app/utils/goals.parity.qa.test.ts app/utils/goals.links.qa.test.ts \
  app/composables/useGoals.source.qa.test.ts \
  app/components/features/habit/HabitForm.goal.qa.test.ts
# → Test Files 4 passed (4) · Tests 19 passed (19) · 3.29s

# 2) Goal: QA tambahan + regresi halaman Goals lama + persistensi + ganti akun + Daily + chip jurnal
pnpm --filter @improve-personal/web exec vitest run \
  <4 file di atas> app/utils/goals.test.ts app/composables/useGoals.test.ts \
  app/utils/goals.lifecycle.qa.test.ts app/composables/useGoals.storage.qa.test.ts \
  app/composables/useGoals.accountSwitch.qa.test.ts \
  app/components/features/daily/DailyGoalReviewCard.qa.test.ts \
  app/components/features/memo/MemoGoalMention.qa.test.ts
# → Test Files 11 passed (11) · Tests 52 passed (52)

# 3) Regresi form/persistensi task, habit, jadwal
pnpm --filter @improve-personal/web exec vitest run \
  app/utils/tasks.test.ts app/utils/tasks/persistence.test.ts app/composables/useTasks.test.ts \
  app/utils/habits.test.ts app/utils/habits/persistence.test.ts app/utils/habits/habit-read-path.test.ts \
  app/composables/useHabits.test.ts app/composables/useHabits.qa.test.ts \
  app/composables/useHabits.consumers.test.ts app/composables/useHabits.checkin-streak.qa.test.ts \
  app/components/features/habit/HabitForm.test.ts app/components/features/habit/HabitForm.validation.test.ts \
  app/components/features/habit/HabitArchive.test.ts app/components/features/habit/HabitGrid.test.ts \
  app/utils/schedule.test.ts app/utils/schedules/persistence.test.ts app/composables/useSchedules.test.ts \
  app/composables/useGoals.persistence.test.ts
# → Test Files 18 passed (18) · Tests 175 passed (175)

# 4) Regresi Daily, jurnal/memo, Overview, kalender
pnpm --filter @improve-personal/web exec vitest run \
  app/utils/dailyRoutine.test.ts app/utils/dailyRoutine.qa.test.ts \
  app/composables/useDailyRoutine.test.ts app/composables/useDailyRoutine.qa.test.ts \
  app/composables/dailyCalendar.qa.test.ts \
  app/components/features/daily/DailyTodoCard.test.ts app/components/features/daily/dailyWidgets.qa.test.ts \
  app/utils/memo.test.ts app/composables/useMemos.test.ts app/composables/useMemos.upsert.qa.test.ts \
  app/composables/useMemoDraft.test.ts app/pages/app/memo.qa.test.ts \
  app/utils/overview.test.ts app/utils/overview.aggregation.qa.test.ts \
  app/pages/app/overview.range.qa.test.ts app/pages/app/kalender.test.ts \
  app/pages/app/kalender.paging.test.ts app/utils/calendarViews.qa.test.ts
# → Test Files 18 passed (18) · Tests 150 passed (150)

# 5) Core (kontrak progress/status yang dipakai web)
pnpm --filter @improve-personal/core exec vitest run \
  src/calc/goal.test.ts src/domain/entities/goal.test.ts
# → Test Files 2 passed (2) · Tests 89 passed (89)

# 6) Kualitas
pnpm --filter @improve-personal/web exec eslint <4 file QA> --max-warnings 0   # exit 0
pnpm exec prettier --check <4 file QA>                                          # All matched files use Prettier code style
pnpm --filter @improve-personal/web typecheck                                   # exit 0
```

Full suite web **tidak** dijalankan (banyak task paralel), sesuai batas tugas.

## 5. Cek tiga pilar

| Pilar | Hasil | Bukti/catatan |
|---|---|---|
| **Keamanan** | **PASS** | 0 `v-html`/`innerHTML`/`eval` di kode produksi; chip goal `v-text` (`MemoGoalMention.vue:18-32`). `goalId`/`chapterId` dari form divalidasi terhadap record yang ada sebelum ditautkan (`utils/goals/links.ts:85-93`), mencegah tautan ke goal/chapter asing atau yang sudah dihapus. `localStorage` hanya menyimpan kunci review (tanggal + id goal/chapter), bukan isi jurnal (`DailyGoalReviewCard.vue:18-57`). Tidak ada server route/secret baru; ganti akun membersihkan state (`useGoals.ts:306-318`). |
| **Performa** | **PASS (terbatas)** | Tidak ada dependency/route baru; kartu Daily hanya `computed` dari goal + filter `answered`, tanpa fetch/N+1. Satu `watch` deep pada data goal/item (`useGoals.ts:282-297`) sudah dibatasi `records.goals.length > 0`, tapi tetap menghitung ulang presentasi saat check-in/task berubah — untuk dataset besar perlu diukur. Lighthouse/CWV tidak diukur karena T18 fitur lokal dan tidak mengubah route; tidak ada klaim angka. |
| **Kerapian** | **PASS** | Kalkulasi progress/status memakai primitif core (tidak ada definisi kedua), mock goal dihapus, komentar menjelaskan alasan. Test lama disesuaikan ke angka core (47→45, 67→66.7) dan **tidak ada assertion yang dihapus** (`git diff apps/web/app/utils/{goals,composables/useGoals}.test.ts`). 0 `console.log`, 0 `.only`/`.skip`. ESLint/Prettier/typecheck hijau. |

## 6. Coverage & rekomendasi

- **Ditambah/dijalankan:** 4 file QA T18 (19 test) + 7 file goal/QA pendukung (33 test) + 325 test regresi terarah web (175 task/habit/jadwal + 150 Daily/jurnal/Overview/kalender) + 89 test core. Semua hijau (377 test web total).
- **Celah:** kartu weekend di level komponen; race dua tab; persistensi jurnal (N1); UI state tautan setelah hapus goal (N3).
- **Rekomendasi sebelum merge:** (1) jalankan full suite `apps/web` sekali oleh orchestrator saat task lain tidak berjalan; (2) buat follow-up persistensi jurnal agar jawaban review tidak hilang; (3) pertimbangkan `place` wajib di mapper habit/jadwal.

## 7. Catatan proses (putaran 2)

- **Rules dibaca:** `CLAUDE.md` root, `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{security,performance,code-quality}.md`, `docs/PRD.md` F8/F12/F13.
- **File diubah QA:** hanya `reports/qa-t18-goals.md` ini. Tidak ada kode produk/test yang diubah, tidak ada commit, area tema/account/guide tidak disentuh.
- **Status Ergonio:** tidak diubah. Kondisi teramati: `prog`, `progressPct: 50`, description masih memuat verdict GAGAL putaran 1. Orchestrator perlu memindahkan ke `review` (atau langsung `done` bila mengikuti verdict ini) + `progressPct: 100` + ringkasan LULUS.

---

# Putaran 1 (riwayat) — Verdict: **GAGAL (blocking)**

Halaman Goals **masih memakai model + data mock** dan **belum terhubung ke `goalProgressReport` core**. Angka progress yang dilihat user berbeda dari angka yang dipakai core/mobile (67 vs 75, 33 vs 33.3, 34 vs 37.5), tautan "Untuk goal" **tidak tersimpan** (habit & jadwal kembali `null` setelah muat ulang, form task tidak punya field-nya), kartu review di Daily **tidak ada**, dan jurnal **belum mengenal `#goal`**.

Catatan QA #31 (N5/B6: "halaman Goals masih mock `useGoals.ts:21`", "model web 67% per-item vs 75% per-tipe core") **terverifikasi masih terjadi** — sesuai instruksi task, kondisi ini = **GAGAL**.

Yang **lulus**: rendering teks goal aman (tidak ada `v-html`/`innerHTML`/`eval` di seluruh `apps/web/app`), chapter kosong 0% dan status `terlewat`/`ditutup` sudah konsisten dengan core, serta halaman kalender/Overview/Daily tidak error (73 test regresi hijau).

Bukti utama: **19 test QA baru → 12 gagal, 7 lulus**, semuanya kegagalan assertion (bukan error runtime), dijalankan di `apps/web`.

---

## 1. Scope & test plan

**Diuji:**

| Area | Level | File |
|---|---|---|
| Paritas progress & status chapter web vs `goalProgressReport` core (per tipe, pembulatan, Sepanjang goal, chapter kosong, `terlewat`/`ditutup`, selesai manual) | unit lintas paket | `app/utils/goals.parity.qa.test.ts` (9 test) |
| Tautan "Untuk goal" bertahan setelah simpan+muat ulang (habit, jadwal) + draft task punya tempat untuk tautan | unit (mapper persistensi) | `app/utils/goals.links.qa.test.ts` (6 test) |
| Sumber data Goals: bukan data contoh, bertahan setelah reload | composable | `app/composables/useGoals.source.qa.test.ts` (2 test) |
| Pilihan "Untuk goal" di form item: "Sepanjang goal" + chapter, hanya goal aktif | komponen (`mountSuspended`) | `app/components/features/habit/HabitForm.goal.qa.test.ts` (2 test) |
| Regresi: halaman Goals lama, jurnal, Overview, kalender, Daily | unit + komponen | `app/utils/goals.test.ts`, `app/composables/useGoals.test.ts`, `app/utils/journal.test.ts`, `app/utils/overview{,.aggregation.qa}.test.ts`, `app/utils/dailyRoutine.test.ts`, `app/composables/useDailyRoutine.qa.test.ts`, `app/pages/app/{overview.range.qa,kalender}.test.ts` |
| Keamanan rendering teks goal | statis (grep) | seluruh `apps/web/app` |

**Tidak diuji (alasan):**
- E2E browser (Playwright) halaman Goals → tidak ada alur yang bisa diuji end-to-end karena data masih mock dan tautan tidak dipersist; hasilnya akan sama dengan unit test di atas dengan biaya jauh lebih besar.
- Mobile (`apps/mobile`) → T18 pemilik `fe`; model mobile belum mengonsumsi goal.
- Lighthouse/CWV terukur → tidak ada route/komponen baru dari T18 (halaman tidak berubah), jadi tidak ada yang bisa dibandingkan; lihat §5.
- Import/export & sync goal → area T12/T21, dilarang untuk task ini.

---

## 2. Hasil per acceptance criteria

| # | Acceptance criteria | Hasil | Bukti |
|---|---|---|---|
| 1 | Stepper chapter + progress tampil benar, angka konsisten dengan `goalProgressReport` core (per tipe, chapter kosong 0%, status `terlewat`/`ditutup`) | **FAIL** | 5 test merah: `expected 67 to be 75`, `expected 33 to be 33.3`, `expected 34 to be 37.5`, `expected 67 to be 75` (Sepanjang goal), `expected 'belum-mulai' to be 'selesai'` → `apps/web/app/utils/goals.ts:104-128` vs `packages/core/src/calc/goal.ts:277-317`. Lulus: chapter kosong = `terlewat` (`goals.ts:105,119`), `ditutup` (`:117`), selesai manual in-range. Lihat **B1, B2, B6**. |
| 2 | Dropdown "Untuk goal" berisi "Sepanjang goal" + chapter, tersedia di form task/habit/jadwal, tautan tersimpan dua arah & tidak duplikat | **FAIL** | `app/utils/goals.links.qa.test.ts` 4 merah (`expected null to be '<goalId>'` untuk habit & jadwal, `expected [... ] to include 'goalId'` untuk draft task); `HabitForm.goal.qa.test.ts` merah (`expected ['Tiap hari','Hari tertentu',…] to include 'Sepanjang goal'`). Tidak ada penyimpanan `goal_link` di web sama sekali. Lihat **B3**. |
| 3 | Kartu review muncul saat chapter berakhir/terlewat & akhir pekan; jawabannya jadi bagian jurnal | **FAIL** | Tidak ada satu pun referensi goal di `components/features/daily/**`, `composables/useDailyRoutine.ts`, `utils/dailyRoutine.ts` (`grep -c goal` → 0). `needsReview` hanya dipakai badge daftar goal (`GoalListCard.vue:45`). Jurnal tidak punya `#goal` (**B5**). Lihat **B4**. |
| 4 | Teks goal (judul/deskripsi) dirender aman (escape, tanpa `v-html` data user) | **PASS** | `grep -rn "v-html" apps/web/app` → 0; `innerHTML` → 0; `eval(`/`new Function` → 0. Judul/alasan dirender interpolasi teks: `GoalHero.vue:42-43`, `GoalDetail.vue:99`, `GoalListCard.vue` (judul). Sticker sampul lewat komponen registry (`GoalHero.vue:38`), bukan HTML user. |
| 5 | Integrasi jurnal `#goal`, countdown, kalender, Overview, Daily tidak error | **FAIL (sebagian)** | Kalender/Overview/Daily **tidak error**: 6 file regresi hijau (73 test). Tapi: jurnal `#goal` **tidak ada** (`utils/journal.ts` hanya `Intention.goalId` di `:22,54`, tanpa parser mention/chip navigasi) → **B5**; tombol "Buat countdown" hanya `NuxtLink` ke `/app/countdown` tanpa tanggal target (`GoalHero.vue:59-61`) → **B7**; Overview & kalender membaca **mock** dengan model per-item (`useOverview.ts:72,90,151`, `useCalendarData.ts:30,74-95`), jadi angkanya ikut salah **B1/B2**. |

---

## 3. Bug & temuan (urut severity)

### B1 — [Critical · blocking] Progress web ≠ progress core (per item vs per tipe + pembulatan berbeda)

**Lokasi:** `apps/web/app/utils/goals.ts:104-128` · pembanding `packages/core/src/calc/goal.ts:277-317`, `packages/core/src/domain/entities/goal.ts:478-512`
**Bukti test:** `app/utils/goals.parity.qa.test.ts` (4 merah)

**Reproduksi (data sama, "hari ini" 2026-02-15):**
```bash
pnpm --filter @improve-personal/web exec vitest run app/utils/goals.parity.qa.test.ts
```
```ts
// chapter 2026-01-05..2026-01-11, item: 2 task (1 selesai) + 1 habit 100%
goalProgressReport(...).chapters[0].percent   // core: 75   ((50 + 100) / 2)
chapterProgress(chapter)                      // web : 67   ((100 + 0 + 100) / 3)

// chapter 3 task (1 selesai)
core 33.3  vs  web 33                          // core 1 desimal, web Math.round

// main goal: 1 chapter berisi (75) + 1 chapter kosong (0)
core 37.5  vs  web 34

// Sepanjang goal: 2 task (1 selesai) + habit 100%
core 75    vs  web 67
```

**Expected (AC T18, `docs/PRD.md:1102`; catatan QA #31 N5/N6):** halaman Goals memakai angka `goalProgressReport` core — rata-rata **per tipe** (task `selesai/total`, habit %, jadwal %) dan pembulatan 1 desimal, supaya web & mobile tidak berbeda.

**Actual:** `chapterProgress()` merata-ratakan **per item** (`goals.ts:112-114` → `average(items.map(itemProgress))`) dan `average()` membulatkan ke bilangan bulat (`:104-106`). `goalProgress()` (`:124-128`) memakai angka per-item yang sama. Core tidak dipakai sama sekali di web: `grep -rn "goalProgressReport\|goalSlices" apps/web/app` → **0 hasil**.

**Severity:** Critical — angka utama halaman Goals salah dan berbeda antar platform; inilah inti AC1.

**Saran (untuk `dimas`):** hapus duplikasi kalkulasi di `utils/goals.ts`, mapping model web ⇄ core lalu panggil `goalProgressReport` (`packages/core/src/calc/goal.ts:277`); tampilkan `percent` yang sudah di-clamp 1 desimal.

---

### B2 — [Critical · blocking] Halaman Goals masih 100% mock; data user hilang setelah reload

**Lokasi:** `apps/web/app/composables/useGoals.ts:12` (`import { createGoalsMock }`), `:21` (`useState<Goal[]>('goals', () => createGoalsMock(...))`), data contoh `apps/web/app/composables/goals/mock.ts:8-129`
**Bukti test:** `app/composables/useGoals.source.qa.test.ts` (2 merah)

**Reproduksi:**
```bash
pnpm --filter @improve-personal/web exec vitest run app/composables/useGoals.source.qa.test.ts
# × sesi baru tanpa data user tidak menampilkan goal contoh
#   AssertionError: expected [ { id: 'aws', …(9) }, …(4) ] to deeply equal []
# × goal yang disimpan tetap ada setelah halaman dimuat ulang
#   AssertionError: expected [ 'Lulus AWS SAA', 'Lari 10K', …(3) ] to include 'Belajar gitar'
```

**Expected (AC T18 + catatan QA #31):** halaman Goals membaca data user (repository lokal `packages/core`); sesi baru kosong = daftar kosong; goal yang disimpan bertahan setelah reload.

**Actual:** setiap sesi baru diisi 5 goal contoh ("Lulus AWS SAA", "Lari 10K", "Dana darurat 6 bulan", "Baca 12 buku", "Telepon ortu tiap minggu"); `save()` hanya menulis ke `useState` in-memory, jadi goal buatan user hilang setelah halaman dimuat ulang. Test lama `useGoals.test.ts:39` bahkan bergantung pada mock ("mock tanpa task").

**Severity:** Critical — seluruh halaman Goals bukan data user; integrasi Overview/kalender juga ikut menampilkan data palsu (`useOverview.ts:72`, `useCalendarData.ts:30`).

**Saran:** ganti sumber `useState('goals')` dengan repository lokal (pola yang sudah dipakai `useHabits`/`useSchedules`), hapus `composables/goals/mock.ts` + penyesuaian `useGoals.test.ts` (test lama wajib diubah, bukan dihapus).

---

### B3 — [High · blocking] Field "Untuk goal" tidak tersimpan; task tidak punya field, jadwal tidak punya UI, habit hanya level goal

**Lokasi:**
- Task: `apps/web/app/utils/tasks.ts:103-110` (`TaskDraft` tanpa `goalId`), `Task` (`:28-47`) tanpa `goalId`; `components/features/todo/TodoForm.vue` → `grep -c goal` = **0**
- Jadwal: model punya `goalId` (`utils/schedule.ts:73`) tapi `components/features/schedule/ScheduleForm.vue` → `grep -c goal` = **0**; dimuat ulang selalu `null` (`utils/schedules/persistence.ts:113`)
- Habit: pemilih goal ada (`components/features/habit/HabitForm.vue:223-236`) tapi hanya `goal.title` (tanpa chapter/"Sepanjang goal") dan **tidak dipersist** (`utils/habits/persistence.ts:50-51`, `:152`)

**Bukti test:** `app/utils/goals.links.qa.test.ts` (4 merah), `HabitForm.goal.qa.test.ts` (1 merah)

**Reproduksi:**
```ts
fromCoreHabit(toCoreHabit({ ...habit, goalId: GOAL_ID }, NOW)).goalId        // actual null, expected GOAL_ID
toSchedule(toSchedulePayload({ ...schedule, goalId: GOAL_ID }, TZ, NOW), [], TZ).goalId
                                                                              // actual null, expected GOAL_ID
Object.keys(emptyTaskDraft(TODAY))                                            // tanpa 'goalId'
// mount HabitForm dengan goal berchapter "Base building"
// chips = ['Tiap hari','Hari tertentu','Tidak ada','Lari 10K'] → tidak ada 'Sepanjang goal' / 'Base building'
```

**Expected (PRD F13 "Tautan Item" `docs/PRD.md:634-638`; AC T18):** task/habit/jadwal punya pilihan "Untuk goal" berisi **Sepanjang goal + chapter**, satu item hanya satu tempat, dan pilihannya bertahan setelah simpan/muat ulang (dua arah: dari item terlihat goal, dari goal terlihat item).

**Actual:** tidak ada penyimpanan tautan di web: `grep -rn "goal_link\|goalLink\|GoalLink" apps/web/app` hanya menemukan komentar "belum bisa dipetakan" (`habits/persistence.ts:50`, `schedules/persistence.ts:41`) + label preview import (`utils/io/preview.ts:38`). Helper core `attachGoalLink`/`checkGoalLinksUnique` (`packages/core/src/domain/entities/goal.ts:323`, `:228`) **tidak dipakai** di web, jadi jaminan "tidak duplikat" juga belum aktif di jalur simpan.

**Severity:** High (blocking) — AC2 belum ada implementasinya; user bisa memilih goal di form habit lalu pilihannya hilang tanpa peringatan.

**Saran:** tambahkan record `goal_link` di layer persistensi item (repository core), API attach/detach yang memakai `attachGoalLink`, dropdown bersama (komponen `GoalPicker`: opsi = Sepanjang goal + chapter goal aktif), lalu pakai di `TodoForm`, `HabitForm`, `ScheduleForm`.

---

### B4 — [High · blocking] Kartu review di Daily tidak ada (termasuk pemicu akhir pekan) & jawaban tidak masuk jurnal

**Lokasi:** `components/features/daily/**` (9 komponen), `composables/useDailyRoutine.ts`, `utils/dailyRoutine.ts` → `grep -c goal` = **0**; `utils/goals.ts:130-132` (`needsReview`) hanya dipakai `GoalListCard.vue:45`

**Expected (PRD F13 "Review Berkala" `docs/PRD.md:662-666`, F12 `:591`; AC T18):** kartu "Gimana progress [goal]/[chapter]?" muncul di Daily saat chapter berakhir/terlewat **dan tiap akhir pekan**, dengan opsi perpanjang/geser/tutup; jawabannya disimpan sebagai Journal "Tentang Hari Ini" + auto-mention goal.

**Actual:** Daily tidak merender apa pun terkait goal. Review **sebagian** sudah ada di halaman detail Goals: blok review hanya untuk status `terlewat` dengan tombol perpanjang/geser/tutup (`GoalSection.vue:70-84`, handler `GoalDetail.vue:61-68`). Tidak ada pemicu "akhir pekan", tidak ada penyimpanan jawaban ke jurnal (`useJournalDay.ts` tidak menerima goal/review).

**Severity:** High (blocking) — AC3 tidak terpenuhi; alur review F13 tidak pernah muncul di halaman yang dipakai harian.

**Saran:** tambahkan `DailyGoalReviewCard` yang membaca `needsReview`/status `terlewat` + kondisi akhir pekan, aksi memakai helper review yang sudah ada, dan simpan jawaban via `useJournalDay` dengan `goalId` terisi.

---

### B5 — [High · blocking] Jurnal belum mengenal `#goal` (mention → chip navigasi)

**Lokasi:** `utils/journal.ts:22,54` (hanya `Intention.goalId`), `composables/useJournalDay.ts:60`; tidak ada parser mention di teks jurnal. Mention yang ada hanya milik fitur Memo (`utils/memo.ts:42-70`, untuk `@jadwal`).

**Expected (PRD F8 `docs/PRD.md:356`, F13 "Integrasi Journal" `:670-672`; AC T18):** menulis `#goal`/chapter di jurnal menghasilkan chip navigasi ke detail goal.

**Actual:** teks jurnal (kata hari ini, afirmasi, refleksi, daftar) dirender apa adanya; tidak ada tokenisasi `#`, tidak ada chip, tidak ada navigasi ke goal. `JournalIntentionNote.vue:44` hanya menampilkan judul goal dari `goalId` niat (siklus `cycleGoal`), bukan mention.

**Severity:** High (blocking) untuk bagian integrasi AC5.

**Saran:** tambahkan parser `#` (pola sama dengan `mentionQuery`/`insertMention` di `utils/memo.ts`) + komponen chip yang `NuxtLink` ke `/app/goals?id=<goalId>`.

---

### B6 — [Medium] Presedensi status chapter berbeda: selesai manual sebelum periode mulai

**Lokasi:** `apps/web/app/utils/goals.ts:116-121` vs `packages/core/src/domain/entities/goal.ts:440-450`

**Reproduksi:** chapter 2026-01-05..2026-01-11, `isManualDone/isCompleted = true`, hari ini 2026-01-01.
```bash
# goals.parity.qa.test.ts
# AssertionError: expected 'belum-mulai' to be 'selesai'
```
**Expected (core):** `isCompleted` menang atas tanggal → `selesai`.
**Actual (web):** cek tanggal lebih dulu → `belum-mulai`; stepper menampilkan chapter yang sudah ditandai selesai sebagai "belum mulai" dan menyembunyikan tombol batalkan.

**Severity:** Medium — bukan angka progress, tapi label stepper salah (AC1 menyebut stepper).

**Saran:** samakan urutan cek dengan `chapterStatus` core (pakai enum core + mapping `_`→`-`).

---

### B7 — [Low] "Buat countdown" tidak membawa tanggal target goal

**Lokasi:** `apps/web/app/components/features/goal/GoalHero.vue:59-61` → `NuxtLink` ke `getFeature('countdown').path` saja; `pages/app/countdown.vue` & `CountdownForm.vue` tidak membaca `useRoute`/query (`grep -n "useRoute\|query"` → 0).

**Expected (PRD F13 "Integrasi Countdown" `docs/PRD.md:673-675`):** tombol membuat countdown dari tanggal target goal (nama + `targetDate` terisi).
**Actual:** user hanya diarahkan ke halaman countdown dan harus mengisi ulang semuanya.

**Severity:** Low (integrasi setengah jadi, tidak merusak data).

---

## 4. Perintah & hasil

```bash
# 1) Test QA baru (4 file)
pnpm --filter @improve-personal/web exec vitest run \
  app/utils/goals.parity.qa.test.ts \
  app/utils/goals.links.qa.test.ts \
  app/composables/useGoals.source.qa.test.ts \
  app/components/features/habit/HabitForm.goal.qa.test.ts
# → Test Files 4 failed (4) · Tests 12 failed | 7 passed (19)
#    parity:      5 failed | 4 passed   (empty chapter=terlewat, ditutup, selesai manual in-range, filter goal lain)
#    links:       4 failed | 2 passed   (dua kontrol "tanpa goal" lulus)
#    sumber data: 2 failed | 0 passed
#    form habit:  1 failed | 1 passed   (goal non-aktif tidak ditawarkan)

# 2) Regresi halaman Goals lama + jurnal
pnpm --filter @improve-personal/web exec vitest run \
  app/utils/goals.test.ts app/composables/useGoals.test.ts app/utils/journal.test.ts
# → Test Files 3 passed (3) · Tests 19 passed (19)

# 3) Integrasi kalender / Overview / Daily tidak error
pnpm --filter @improve-personal/web exec vitest run \
  app/utils/overview.test.ts app/utils/overview.aggregation.qa.test.ts \
  app/utils/dailyRoutine.test.ts app/composables/useDailyRoutine.qa.test.ts \
  app/pages/app/overview.range.qa.test.ts app/pages/app/kalender.test.ts
# → Test Files 6 passed (6) · Tests 73 passed (73)

# 4) Kualitas file test baru
pnpm --filter @improve-personal/web exec eslint \
  app/utils/goals.parity.qa.test.ts app/utils/goals.links.qa.test.ts \
  app/composables/useGoals.source.qa.test.ts \
  app/components/features/habit/HabitForm.goal.qa.test.ts --max-warnings 0
# → exit 0 (tanpa output)
pnpm exec prettier --check <4 file di atas>
# → All matched files use Prettier code style!
pnpm --filter @improve-personal/web typecheck
# → GAGAL, tapi hanya dari file QA task lain: app/components/features/account/RecoveryBackupCard.qa.test.ts:107-129
#    `grep -Ei "goals\.(parity|links)|HabitForm\.goal"` pada output typecheck → 0 baris (file QA T18 type-clean)
```

Tidak ada `it.only`, `.skip`, test ter-comment, atau assertion yang dilonggarkan.

---

## 5. Cek tiga pilar

| Pilar | Hasil | Bukti/catatan |
|---|---|---|
| **Keamanan** | **Lulus (untuk bagian yang ada)** | Tidak ada `v-html`, `innerHTML`, `eval`, `new Function` di `apps/web/app` (0 hasil grep) → teks goal (judul/alasan) aman karena interpolasi teks + atribut (`GoalHero.vue:42-43`, `GoalDetail.vue:99`). Sticker sampul dibaca lewat registry komponen, bukan URL/HTML user (`GoalHero.vue:38`). Tidak ada secret/PII baru; T18 tidak menambah server route. Catatan: karena tautan goal belum punya jalur simpan (B3), validasi lintas-record `checkGoalBundle`/`checkGoalLinksUnique` juga belum aktif di web — begitu disimpan, wajib dipanggil supaya item tidak dobel tautan (`packages/core/src/domain/entities/goal.ts:266-303`). |
| **Performa** | **Tidak ada regresi terukur; tidak bisa dinilai penuh** | T18 tidak menambah route/komponen/dependency, jadi tidak ada perubahan bundle. Goals page: `goalProgress` per kartu & `ProgressRing` murah untuk 5 goal; `filtered`/`selected` memoized (`goals.vue:23-35`). Tidak ada `$fetch` di setup, tidak ada N+1. Angka Lighthouse/CWV tidak diukur karena halaman tidak berubah — begitu B2 diganti repository, wajib ukur ulang (payload SSR & TTFB). |
| **Kerapian** | **Gagal** | Dua definisi model goal dengan hasil berbeda (`apps/web/app/utils/goals.ts:87-128` vs `packages/core/src/domain/entities/goal.ts:25-111`) melanggar kontrak bersama `.claude/rules/shared-code-quality.md:24-29`; kalkulasi core tidak dipakai sama sekali di web (`grep` 0 hasil); data contoh produksi masih ada (`composables/goals/mock.ts`) dan dipakai default (`useGoals.ts:21`); komentar kode mengakui utang teknis tapi fiturnya belum dikerjakan (`habits/persistence.ts:50`, `schedules/persistence.ts:41`). |

---

## 6. Coverage & celah test yang tersisa

- **Ditambahkan:** 4 file / 19 test (paritas core, persistensi tautan, sumber data, dropdown form). 7 lulus = kontrak yang sudah benar (rendering aman tidak lewat test tapi grep; chapter kosong/`terlewat`/`ditutup`; kontrol "tanpa goal").
- **Belum bisa ditest sebelum diperbaiki:**
  - Kartu review Daily (B4) → tidak ada komponen/marker untuk dipilih; test akan mengarang kontrak UI.
  - `#goal` di jurnal (B5) → belum ada fungsi parser; test hanya bisa memeriksa nama export (rapuh).
  - "Tidak duplikat" (AC2) → belum ada jalur simpan tautan; baru bisa diuji setelah `attachGoalLink` di-wire (B3).
- **Rekomendasi setelah fix:** (1) ubah 4 test paritas + test sumber data menjadi hijau tanpa mengubah ekspektasinya; (2) tambah test integrasi simpan-muat tautan di layer repository (bukan mapper); (3) tambah test komponen Daily review card + parser `#goal`; (4) jangan lupa `pnpm --filter @improve-personal/core exec vitest run` (T17, 89 test) tetap hijau.

---

## 7. Catatan proses

- **Rules dibaca:** `CLAUDE.md` root, `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{security,performance,code-quality}.md`, `docs/PRD.md` F13 (termasuk integrasi F8/F5/F6/F11/F12) + tabel T18, `reports/qa-t17-model-goal.md`, `packages/core/src/{domain/entities/goal.ts,calc/goal.ts}`, `apps/web/app/{utils/goals.ts,composables/useGoals.ts,pages/app/goals.vue}` + komponen `features/goal/*`.
- **File diubah QA:** hanya 4 file test baru (`app/utils/goals.parity.qa.test.ts`, `app/utils/goals.links.qa.test.ts`, `app/composables/useGoals.source.qa.test.ts`, `app/components/features/habit/HabitForm.goal.qa.test.ts`) + report ini. Tidak ada kode produk, fixture developer, atau test lama yang diubah; area guide/daily/overview/account/crypto/io/memo tidak disentuh (kecuali dibaca); tidak ada commit.
- **Status Ergonio:** tidak diubah oleh QA (sesuai batas tugas). Rekomendasi orchestrator: pindahkan #32 `review` → `status-1792622168795` (Failed), `progressPct` tetap 80, dan tugaskan B1–B5 ke `dimas` (frontend), dengan B1/B2 sebagai prioritas pertama karena memblokir semua AC lain.
