# QA Report — T17: Model goal, chapter, tautan item & kalkulasi progress

- **Task:** Ergonio #31 (personal-productivity) · status diambil `review` → **tetap `review`** (tidak diubah QA, lihat catatan di akhir)
- **Tanggal:** 2026-10-23
- **Commit:** `f8a9a5c` (working tree berisi perubahan task lain — tidak disentuh)
- **Environment:** Linux, Node v24.18.0, pnpm 11.17.0, Vitest 5.0.3, zod 4.6.7

> **Status akhir (putaran 2, setelah fix `bayu`): LULUS.** Verdict GAGAL di bawah dipertahankan sebagai jejak putaran 1. Verifikasi ulang lengkap ada di **§8 (Putaran 2)**.

## Verdict putaran 1: **GAGAL (blocking)**

Model & schema goal/chapter/tautan sudah benar dan tervalidasi, tetapi **kalkulasi progress sesuai PRD F13 belum lengkap** dan **invariant integritas (periode chapter di dalam goal, satu item satu tautan) tidak ditegakkan di jalur simpan/import**. Ada 1 temuan yang membuat status chapter & kartu review salah (chapter kosong otomatis 100%).

Yang sudah terbukti jalan: 50 assertion lulus (schema, clamp, rata-rata, status dasar, hapus chapter/goal, dua arah tautan). Yang gagal: 6 ekspektasi AC (dipin sebagai `it.fails`), semuanya diverifikasi ulang lewat probe sementara dengan assertion normal — probe 6/6 merah pada assertion (bukan error runtime), lalu probe dihapus.

---

## 1. Scope & test plan

**Diuji (level unit, `packages/core`):**

| Area | Teknik | File |
|---|---|---|
| Validasi `goalSchema`, `goalChapterSchema`, `goalLinkSchema` (boundary judul, tanggal mustahil, enum, `strict()` anti mass-assignment) | equivalence partitioning + boundary value | `packages/core/src/domain/entities/goal.test.ts` |
| Validasi payload import/roundtrip JSON + registry entitas & index waktu | contract | idem |
| `checkChapterWithinGoal`, `chaptersOutsideGoal` | decision table + boundary (menyentuh batas rentang) | idem |
| Identitas tautan `goalLinkKey`/`existingLinkFor` (termasuk idempoten & dua arah) | state transition | idem |
| `reassignChapterLinks` (hapus chapter: pindah vs lepas), `idsToDeleteWithGoal` (hapus goal) | edge case PRD | idem |
| `chapterStatus` (belum mulai/berjalan/selesai/terlewat/manual) | state transition + boundary tanggal | idem |
| `chapterProgressPercent`, `mainGoalProgressPercent`, `clampPercent` (rata-rata, bobot sama, NaN, out-of-range, pembulatan) | boundary + edge | idem |
| Edge AC: item selesai dihapus, item pindah chapter, item tanpa tautan, goal tanpa item | edge case | idem |
| Regresi halaman Goals (#32) | targeted regression | `app/utils/goals.test.ts`, `app/composables/useGoals.test.ts` |

**Tidak diuji (dengan alasan):**
- E2E/UI halaman Goals → milik T18 (#32), QA terpisah; di sini hanya regresi unit.
- Mobile (`apps/mobile`) → T17 pemilik `be`/core; model mobile belum dikonsumsi.
- Sinkronisasi/pull-push goal → area `packages/core/src/sync/**` dilarang untuk task ini.
- Performa terukur (Lighthouse/INP) → di luar cakupan model murni; tidak ada perubahan bundle.

---

## 2. Hasil per acceptance criteria

| # | Acceptance criteria | Hasil | Bukti |
|---|---|---|---|
| 1 | Model goal + chapter (periode sendiri, kategori, sampul) tersimpan & tervalidasi | **PASS (model)** | `goalSchema`/`goalChapterSchema` (`packages/core/src/domain/entities/goal.ts:25-78`); test `goalSchema - model main goal` (7), `goalChapterSchema - periode sendiri` (3), `persistensi model - registry entitas` (3). Roundtrip JSON + `validateEntityPayload` lulus; `goal`/`goal_chapter` ada di `INDEXED_ENTITY_TYPES` (`packages/core/src/repository/index-entry.ts:109-110`). **Catatan:** belum ada jalur simpan produksi yang memakai model core; halaman Goals masih memakai model mock sendiri (`apps/web/app/composables/useGoals.ts:21`) — lihat B6. |
| 2 | Tautan item (task/habit/jadwal) dua arah (dari item & dari goal) | **PASS (model), gagal enforcement** | Test `identitas tautan - satu item cuma satu tempat` (4), `goalLinkSchema` (3). `existingLinkFor` item→goal (`goal.ts:117-126`); goal→item = filter `goalId` (test "dua arah"). Tapi tidak ada helper/use case yang menegakkan uniqueness saat import/simpan — **B2**. |
| 3 | Kalkulasi progress benar: item selesai/total, chapter terlewat, item tanpa tautan, tidak double-count | **FAIL** | Rata-rata/clamp/status dasar lulus (21 test), tetapi: tidak ada kode yang mengubah data task/habit/jadwal menjadi persen (**B1**), chapter kosong otomatis 100% sehingga tidak pernah `terlewat` (**B3**), slice `null` dihitung 100% → 66.7% saat 0% (**B4**), duplikat tautan tidak dicegah → double-count mungkin (**B2**). |
| 4 | Unit test kalkulasi progress + edge (item selesai dihapus, item pindah chapter, goal tanpa item) | **PASS setelah QA, 6 ekspektasi belum terpenuhi** | Sebelum QA: **0 file test** untuk `goal.ts`. QA menambahkan 56 test (608 baris). 50 lulus, 6 `it.fails` = ekspektasi AC yang belum dipenuhi (B1–B5). |
| 5 | Tidak ada regresi di halaman Goals (#32) | **PASS** | `pnpm --filter @improve-personal/web exec vitest run app/utils/goals.test.ts app/composables/useGoals.test.ts` → **2 files, 14 tests passed**. |

---

## 3. Bug & temuan (urut severity)

### B1 — [High · blocking] Kalkulasi progress baru berupa primitif; tidak ada agregasi task/habit/jadwal

**Lokasi:** `packages/core/src/domain/entities/goal.ts:240-284`

**Reproduksi:**
```bash
grep -rn "chapterProgressPercent\|mainGoalProgressPercent\|ProgressSlice" \
  --include="*.ts" packages apps | grep -v "goal.test.ts"
# hasil: hanya definisi + barrel (domain/index.ts) — tidak ada pemakai produksi
grep -n "checkin\|occurrence\|todo\|habit\|schedule" packages/core/src/domain/entities/goal.ts
# hasil: hanya komentar (baris 83, 203, 240) — tidak ada parameter/agregasi data item
```

**Expected (PRD F13, `docs/PRD.md:642-646`):** progress chapter = rata-rata item nyata di dalamnya — task `selesai/total`, habit `% hari target tercapai selama periode chapter`, jadwal `% kejadian selesai/hadir selama periode chapter`.

**Actual:** `chapterProgressPercent` hanya menerima `ProgressSlice[]` yang **sudah** dihitung pemanggil (`goal.ts:241-265`). Tidak ada fungsi yang menerima daftar `todo`/`habit_checkin`/`schedule_occurrence` + rentang tanggal, sehingga tiga metrik di PRD tidak bisa dihasilkan oleh core hari ini. `mainGoalProgressPercent` pun hanya merata-ratakan angka yang diberikan. Tidak ada satu pun pemakai produksi (web/mobile/server) — AC "kalkulasi progress" belum bisa dibuktikan end-to-end.

**Severity:** High (blocking) — inti AC T17 belum ada implementasinya, bukan cuma belum dites.

**Saran:** tambah fungsi murni (mis. `packages/core/src/calc/goal.ts`) `taskProgressSlice(todos)`, `habitProgressSlice(checkins, period, today)`, `scheduleProgressSlice(occurrences, period, today)` + `chapterSlices(links, items)`; sertakan test. Kalau memang dijadwalkan di task lain, pindahkan AC-nya secara eksplisit.

---

### B2 — [High · blocking] Invariant "periode chapter di dalam goal" & "satu item satu tautan" tidak ditegakkan di simpan/import

**Lokasi:** `packages/core/src/domain/entities/goal.ts:138-155` (aturan tersedia), `:107-126` (lookup tersedia), `packages/core/src/domain/entities/index.ts` (`validateEntityPayload`)

**Reproduksi (probe sementara, assertion normal):**
```ts
// goal: 2026-01-01 .. 2026-03-31
const outside = { /* chapter 2026-06-01 .. 2026-06-30 */ }
goalChapterSchema.safeParse(outside).success        // actual: true  expected: false
validateEntityPayload('goal_chapter', outside).ok   // actual: true  expected: false

const a = { /* goal_link item todo:ITEM */ }
const b = { ...a, id: '...008' }                    // tautan kedua untuk item yang sama
[a, b].filter((l) => validateEntityPayload('goal_link', l).ok).length
// actual: 2   expected: 1
```

**Expected (PRD `docs/PRD.md:637` dan edge case "Geser Periode Main Goal" `docs/PRD.md:704-706`; AC T17 `docs/PRD.md:1101`):** chapter di luar rentang main goal **ditolak dengan pesan jelas**; satu item hanya boleh punya satu tautan (DBML `uq_goal_link_item`).

**Actual:** `checkChapterWithinGoal` hanya fungsi yang bisa dipanggil manual — **tidak dipanggil siapa pun** (`grep -rn checkChapterWithinGoal apps packages` → hanya definisi + barrel + test QA). `existingLinkFor` hanya lookup; tidak ada use case attach/import yang memakainya, jadi dua baris `goal_link` untuk item yang sama sama-sama lolos validasi. Di store lokal (blob per record) tidak ada unique index fisik, jadi pembatasan DBML tidak berlaku. Konsekuensi: dua tautan item yang sama bisa dihitung dua kali saat progress dibangun.

**Severity:** High (blocking) — AC eksplisit "periode chapter di luar main goal ditolak" dan "satu item cuma satu tautan" belum terpenuhi; risiko data ganda permanen setelah import/backup.

**Saran:** tambah validasi lintas-record di jalur import/simpan (goal + chapters + links sekaligus), dan helper attach/detach tautan yang wajib memakai `existingLinkFor` (tolak/merge dengan pesan jelas).

---

### B3 — [High] Chapter kosong otomatis 100% → tidak pernah `terlewat`, kartu review F13 tidak muncul, progress goal naik palsu

**Lokasi:** `packages/core/src/domain/entities/goal.ts:260` (`if (slices.length === 0) return 100`) dan `:237` (status `selesai` kalau progress ≥ 100)

**Reproduksi:**
```bash
pnpm --filter @improve-personal/core exec vitest run src/domain/entities/goal.test.ts \
  -t "chapter kosong TANPA selesai manual"
# test berstatus it.fails (hijau sebagai "expected fail") — assertion sebenarnya merah:
# expected 0, received 100
```

```ts
chapterProgressPercent({ isCompleted: false }, [])                      // actual 100, expected 0
const c = { startDate: '2026-08-01', endDate: '2026-08-31', isCompleted: false }
chapterStatus(c, '2026-10-23', chapterProgressPercent(c, []))           // actual 'selesai', expected 'terlewat'
```

**Expected (PRD `docs/PRD.md:651-653`, `:656-660`):** chapter tanpa item menjadi 100% **setelah ditandai selesai manual**; chapter lewat tanggal dengan progress < 100% = `terlewat` (memicu review/opsi perpanjang-geser-tutup).

**Actual:** chapter kosong langsung 100% tanpa aksi user → lewat tanggal otomatis `selesai` → tidak pernah `terlewat` → kartu review tidak muncul. Contoh dampak angka: goal 2 chapter, chapter A item 0%, chapter B kosong → `mainGoalProgressPercent([0, 100], null)` = **50%** padahal belum ada yang dikerjakan.

**Severity:** High — perilaku produk salah + mematikan alur review F13.

**Saran:** chapter tanpa item & belum manual = `0` (atau di-exclude dari rata-rata), lalu sesuaikan test status.

---

### B4 — [High] `ProgressSlice.percent: null` dihitung 100% → progress inflasi saat satu tipe item tidak ada

**Lokasi:** `packages/core/src/domain/entities/goal.ts:244` (kontrak `null` = tipe tanpa item), `:263` (`slice.percent ?? 100`)

**Reproduksi:**
```ts
chapterProgressPercent({ isCompleted: false }, [
  { itemType: 'todo', percent: 0 },        // 0 task selesai
  { itemType: 'habit', percent: null },    // tidak ada habit di chapter
  { itemType: 'schedule', percent: null }, // tidak ada jadwal di chapter
]) // actual 66.7 — expected 0
```

**Expected (PRD `docs/PRD.md:643`):** "rata-rata dari item di dalamnya" — tipe yang tidak punya item tidak menyumbang progress.

**Actual:** 66.7% untuk chapter yang nol task selesai. Kontrak `null` justru mendorong pemanggil mengirim satu slice per tipe, sehingga bug ini akan muncul pada pemakaian normal (bukan data rusak).

**Severity:** High — angka progress bisa menyesatkan user dan berbeda antar platform (lihat B6).

**Saran:** abaikan slice `null` dari penyebut (`slices.filter(s => s.percent !== null)`), atau ubah tipe menjadi `readonly ProgressSlice[]` yang hanya berisi tipe yang ada itemnya + dokumentasi tegas.

---

### B5 — [Medium] `resolveGoalLinks` dirujuk tetapi tidak ada → edge "item selesai dihapus" tidak tertangani terpusat

**Lokasi:** komentar `packages/core/src/domain/entities/goal.ts:86`; pencarian: `grep -rn "resolveGoalLinks" .` → hanya baris komentar itu.

**Expected:** tautan yatim (item dihapus) dilepas/diabaikan dengan aman (PRD edge "Hapus Main Goal: item tetap ada, tautan dilepas"; prinsip soft-ref di `ARCHITECTURE.md:200`).

**Actual:** fungsi tidak ada di `goal.ts` maupun barrel `packages/core/src/domain/index.ts`. Setiap pemanggil harus memfilter sendiri; tidak ada test yang menjaga perilaku ini. Test QA "item selesai lalu dihapus" hanya membuktikan primitifnya bisa dipakai, bukan bahwa resolusi tautan yatim tersedia.

**Severity:** Medium (High bila fitur disable/hapus item dianggap selesai di T17).

**Saran:** implementasikan `resolveGoalLinks(links, existingItems)` murni (kembalikan `{ resolved, orphans }`) atau hapus klaim di komentar dan buat task terpisah.

---

### B6 — [Medium] Model goal terduplikasi di web dan semantiknya berbeda dari core

**Lokasi:** `apps/web/app/utils/goals.ts:104-128` vs `packages/core/src/domain/entities/goal.ts:255-284`

| Aspek | Web (`utils/goals.ts`) | Core (`domain/entities/goal.ts`) |
|---|---|---|
| Rata-rata chapter | per **item** (`:112-114`) | per **tipe** slice (`:255-265`) |
| Status | `belum-mulai`, `berjalan`, `selesai`, `terlewat`, `ditutup` (`:13-20`) | `belum_mulai`, `berjalan`, `selesai`, `terlewat` (`:225`) |
| Chapter kosong | 0% (`average([])` = 0, `:104-106`) | 100% (`:260`) |

**Contoh angka:** 1 chapter berisi 2 task (1 selesai) + 1 habit 100% → web **67%** (200/3), core **75%** ((50+100)/2). Goal yang sama akan tampil beda di web dan mobile, dan halaman Goals saat ini **tidak memakai model T17** sama sekali (masih mock in-memory: `apps/web/app/composables/useGoals.ts:18-21`).

**Expected:** satu definisi "progress chapter"/enum status lintas web & mobile (`.claude/rules/shared-code-quality.md:24-29`).

**Actual:** dua definisi dengan hasil berbeda.

**Severity:** Medium — bukan blocker T17 model, tapi blocker sebelum mobile memakai model ini (dan melanggar aturan kontrak bersama).

---

### B7 — [Low] Tidak ada unit test goal sebelum QA (AC4 belum terpenuhi)

**Lokasi:** `packages/core/src/domain/entities/` (tidak ada `goal.test.ts` sebelum QA).

**Actual:** 0 test untuk `goal.ts` (15 file test lain ada). QA menambahkan 56 test; 6 di antaranya mengunci gap B1–B5.

---

## 4. Perintah & hasil

```bash
# 1) Test model + progres yang ditulis QA (core)
pnpm --filter @improve-personal/core exec vitest run src/domain/entities/goal.test.ts
# → Test Files 1 passed (1) · Tests 50 passed | 6 expected fail (56) · 0.28s

# 2) Probe gap dengan assertion normal (file sementara goal.gap-probe.test.ts, lalu dihapus)
pnpm --filter @improve-personal/core exec vitest run src/domain/entities/goal.gap-probe.test.ts
# → 6 failed (semua AssertionError, bukan error runtime):
#    - expected 100 to be +0                        (chapter kosong)
#    - expected 'selesai' to be 'terlewat'          (status chapter kosong lewat)
#    - expected 66.7 to be +0                       (slice null)
#    - expected true to be false                    (chapter di luar rentang lolos schema)
#    - expected [2 link] to have a length of 1      (duplikat tautan lolos validasi)
#    - expected exports to include 'resolveGoalLinks'

# 3) Regresi halaman Goals (#32)
pnpm --filter @improve-personal/web exec vitest run app/utils/goals.test.ts app/composables/useGoals.test.ts
# → Test Files 2 passed (2) · Tests 14 passed (14)

# 4) Kualitas file test baru
pnpm --filter @improve-personal/core exec eslint src/domain/entities/goal.test.ts --max-warnings 0
# → (tanpa output) exit 0
pnpm exec prettier --check packages/core/src/domain/entities/goal.test.ts
# → All matched files use Prettier code style!
pnpm --filter @improve-personal/core typecheck
# → tsc -p tsconfig.json, exit 0
```

Tidak ada `it.only` / `.skip` / test ter-comment. `it.fails` dipakai eksplisit untuk ekspektasi yang **belum** terpenuhi (bukan melemahkan assertion — assertion aslinya dijalankan dan gagal; terbukti lewat probe).

---

## 5. Cek tiga pilar

| Pilar | Hasil | Bukti/catatan |
|---|---|---|
| **Keamanan** | **Lulus** | Semua schema `.strict()` → field asing dari body/import ditolak (test "strict: field asing..."); tanggal lokal divalidasi nyata (`2026-02-30` ditolak); UUIDv7 dipin; enum tertutup untuk kategori/status/tipe item; tidak ada secret/PII, tidak ada I/O di fungsi murni. Catatan: `coverSticker` hanya string 1-120 char — renderer (T18) wajib memvalidasi terhadap registry sticker, bukan mempercayai string. |
| **Performa** | **Lulus** | Semua fungsi O(n) atas daftar kecil, tanpa I/O; `goal`/`goal_chapter` punya index rentang (`index-entry.ts:109-110`) untuk query periode; `goal_link` sengaja tanpa index waktu (bukan query rentang). Tidak ada perubahan bundle (test-only). |
| **Kerapian** | **Sebagian** | Penamaan & komentar aturan jelas, `clampPercent` dipakai bersama (bagus). Tapi: komentar merujuk `resolveGoalLinks` yang tidak ada (`goal.ts:86`, dead reference); dua model goal duplikat (B6); `CHAPTER_STATUSES` core tidak dipakai produksi. |

---

## 6. Coverage & celah test tersisa

- **Ditambahkan:** `packages/core/src/domain/entities/goal.test.ts` — 56 test, 608 baris; mencakup schema, aturan rentang, identitas tautan, hapus chapter/goal, status (semua transisi + boundary), progress (rata-rata, bobot, clamp, NaN, pembulatan), dan 4 edge AC.
- **Belum tercakup (menunggu implementasi):** agregasi `todo`/`habit_checkin`/`schedule_occurrence` → slice (B1); resolver tautan yatim (B5); validasi lintas-record (B2); UI/E2E halaman Goals (T18).
- **Rekomendasi:** setelah B1–B4 diperbaiki, ubah 6 `it.fails` menjadi `it` biasa di file yang sama (sudah disiapkan), lalu jalankan ulang `pnpm --filter @improve-personal/core exec vitest run src/domain/entities/goal.test.ts` + regresi web.

---

## 7. Catatan proses

- **Rules dibaca:** `CLAUDE.md` root, `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{security,performance,code-quality}.md`, `docs/PRD.md` F13 + tabel task T17.
- **File yang diubah QA:** hanya `packages/core/src/domain/entities/goal.test.ts` (baru) dan report ini. Tidak ada kode produk yang diubah; area calendar/account/crypto/io/memo, `packages/core/src/sync/**`, commit, dan status Ergonio tidak disentuh.
- **Status Ergonio:** instruksi task melarang QA mengubah status, jadi #31 tetap `review`. Rekomendasi untuk orchestrator: pindahkan ke `status-1792622168795` (Failed) dan tugaskan B1–B4 ke `bayu`.

---

# 8. Putaran 2 (2026-10-23) — verifikasi setelah fix `bayu`

## 8.1 Verdict putaran 2: **LULUS** (dengan catatan non-blocking)

Semua klaim developer diverifikasi ulang dari repo, bukan dari komentar: **89 test goal lulus (68 domain + 21 calc)**, core penuh **327 lulus (16 file)**, typecheck/eslint/prettier bersih, dan seluruh probe putaran 1 kini hijau dengan **assertion normal** (bukan `it.fails`). Tidak ada assertion yang dihapus atau dilonggarkan; semua temuan putaran 1 (B1–B5, B7) tertutup. Enam catatan di §8.5 bersifat non-blocking: wiring import/save (#32/T12), kerapian test/kode, dan satu pertanyaan formula produk — **bukan bug T17**.

## 8.2 Klaim → hasil verifikasi

| Yang dicek | Hasil | Bukti |
|---|---|---|
| 89 test goal lulus (68 domain + 21 calc) | **Benar** | `vitest run src/domain/entities/goal.test.ts` → 68 passed; `src/calc/goal.test.ts` → 21 passed; gabungan → 89 passed |
| Core penuh tidak regresi (klaim 327) | **Benar** | `vitest run` di `packages/core` → 16 files, **327 passed** |
| 6 `it.fails` putaran 1 sekarang `it` dengan assertion setara | **Benar, tanpa pelemahan** | 4 test assertion sama (`goal.test.ts:687`, `:694`, `:705`, `:741`); 2 dipindah ke `checkGoalBundle` (`:717`, `:730`) karena `validateEntityPayload` hanya menerima 1 record — alasan sah, assertion tetap mengunci penolakan; `grep "it.fails\|.skip\|.only"` → 0 |
| Chapter di luar periode goal ditolak | **Lulus** | `checkGoalBundle` → `checkChapterWithinGoal` (`goal.ts:266-303`, `:182-199`); test `goal.test.ts:717-728`; probe QA butir 1 |
| Dua `goal_link` untuk item yang sama ditolak | **Lulus** | `checkGoalLinksUnique` (`goal.ts:228-249`) dipanggil `checkGoalBundle` (`:299`); test `:730-739`; probe butir 2 termasuk kasus **beda goal** |
| Chapter kosong lewat tanggal = `terlewat` (bukan `selesai`) | **Lulus** | `chapterProgressPercent([]) = 0` (`goal.ts:478-493`); `chapterStatus` (`:440-450`); test `:694-703`; probe butir 3 |
| Chapter 0% + 3 slice null tidak jadi 66.7% | **Lulus** | slice `null` dikeluarkan penyebut (`goal.ts:486-492`); test `:705-715`; probe butir 4 |
| `resolveGoalLinks` tidak lagi hantu | **Lulus (perilaku)** | `goal.ts:156-170`; test perilaku `:354-371`; probe butir 5 memisahkan resolved vs orphan |
| Tautan kedua ke tempat lain ditolak, simpan ulang idempoten | **Lulus** | `attachGoalLink` (`goal.ts:323-342`); test `:373-405`; probe butir 6 |
| Chapter selesai manual (termasuk kosong) = 100% | **Lulus** | `goal.ts:482`; test `:552-558` |
| `isClosed` + status `ditutup` (backward-compatible) | **Lulus** | default `false` (`goal.ts:77`); `chapterStatus` menang atas tanggal (`:445`); test `:201-209`, `:535-538` |
| Agregasi task `selesai/total` | **Lulus** | `taskProgressPercent` (`calc/goal.ts:76-82`); test `calc/goal.test.ts:154-164`; probe |
| Agregasi habit `% hari jadwal` (sampai hari ini) | **Lulus** | `habitPercentForPeriod` (`calc/goal.ts:109-137`); test `:166-264`; probe (check-in hari non-jadwal tidak menaikkan) |
| Agregasi jadwal `% kejadian` (done / expected) | **Lulus** | `schedulePeriodProgressPercent` (`calc/goal.ts:156-170`); test `:266-324`; probe (missed/pending tetap penyebut) |
| `needsReview` menyala untuk chapter `terlewat` | **Lulus** | `calc/goal.ts:321`; test `:449-484`, `:486-505`; probe |
| Item tanpa tautan / tautan yatim tidak menginflasi | **Lulus** | `goalSlices` hanya membaca tautan + item yang ada (`calc/goal.ts:187-219`, `:350-358`); probe (tautan ke item hilang → slice `[]`, 0%) |
| `mainGoalProgressPercent` bobot sama + Sepanjang Goal bila ada isi | **Lulus** | `goal.ts:501-512`; `calc/goal.ts:301-317`; test `:449-484`, `:507-524` |
| Goal tanpa chapter | **Lulus** | test `calc/goal.test.ts:507-524` |
| Tidak ada perubahan di luar scope | **Lulus** | `git status` goal-only: `M domain/entities/goal.ts`, `?? calc/goal.ts`, 2 test; **tidak ada** referensi `goal` di `packages/core/src/io/**` & `sync/**`; perubahan `apps/**`, `io`, `sync` di working tree milik task lain (T12/T21) |
| Fungsi tetap murni/deterministik | **Lulus** | `grep "Date.now\|Math.random\|console."` di `goal.ts` & `calc/goal.ts` → 0 hasil; probe determinisme (input sama → output sama) |

## 8.3 AC T17 → hasil

| # | AC (PRD T17) | Hasil | Bukti |
|---|---|---|---|
| 1 | Model goal + chapter (periode, kategori, sampul) tervalidasi | **PASS** | `goalSchema` (`goal.ts:25-52`), `goalChapterSchema` (`:54-92`), `goalLinkSchema` (`:100-111`); test domain 7+4+3; registry import `domain/entities/index.ts:72-74` |
| 2 | Tautan item dua arah (dari item & goal) | **PASS (model)** | `goalLinkKey`/`existingLinkFor` (`goal.ts:119-138`), `attachGoalLink` (`:323-342`); test `:315-405` |
| 3 | Progress task/habit/jadwal dari data mentah | **PASS** | `calc/goal.ts:76-170`, `:187-243`; 21 test calc + 12 probe QA |
| 4 | Sepanjang Goal ikut rata-rata, bobot sama | **PASS** | `mainGoalProgressPercent` (`goal.ts:501-512`), `goalProgressReport` (`calc/goal.ts:301-317`); test `:449-484` |
| 5 | Goal tanpa chapter | **PASS** | test `calc/goal.test.ts:507-524` |
| 6 | Chapter selesai manual (termasuk tanpa item) | **PASS** | `goal.ts:482`; test `:552-558`, `calc/goal.test.ts:433-443` |
| 7 | Status `terlewat` | **PASS** | `goal.ts:440-450`; test `:524-527`, `:694-703`; `needsReview` (`calc/goal.ts:321`) |
| 8 | Periode chapter di luar main goal ditolak | **PASS di level model** — wiring import/save belum ada (N1) | `checkGoalBundle` (`goal.ts:266-303`); test `:717-728` |
| 9 | Satu item cuma satu tautan | **PASS di level model** — wiring import/save belum ada (N1) | `checkGoalLinksUnique` (`goal.ts:228-249`) + `checkGoalBundle` (`:299`); test `:730-739`; probe lintas goal |
| 10 | Hapus goal/chapter sesuai edge F13 | **PASS** | `reassignChapterLinks` (`:351-374`), `idsToDeleteWithGoal` (`:382-395`), `resolveGoalLinks` (`:156-170`); test `:354-371`, `:460-510` |
| 11 | Item tanpa tautan tidak menginflasi / tidak dobel hitung | **PASS** | `goalSlices` (`calc/goal.ts:187-219`); test `:363-383`, `:526-542`; probe |
| 12 | Unit test untuk kalkulasi + edge | **PASS** | 89 test (dari 0 sebelum QA); semua export `goal.ts` & `calc/goal.ts` tersentuh |

## 8.4 Perintah & hasil putaran 2

```bash
cd packages/core

# 1) Perintah wajib dari orchestrator
pnpm --filter @improve-personal/core exec vitest run \
  src/domain/entities/goal.test.ts src/calc/goal.test.ts
# → Test Files 2 passed (2) · Tests 89 passed (89) · 330ms

# 2) Per file (memastikan klaim 68 + 21)
pnpm --filter @improve-personal/core exec vitest run src/domain/entities/goal.test.ts
# → 1 file · 68 passed
pnpm --filter @improve-personal/core exec vitest run src/calc/goal.test.ts
# → 1 file · 21 passed

# 3) Regresi core penuh
pnpm --filter @improve-personal/core exec vitest run
# → Test Files 16 passed (16) · Tests 327 passed (327)

# 4) Probe QA independen (file sementara src/calc/goal.qa-probe2.test.ts, 12 test,
#    assertion normal tanpa helper test developer; dihapus setelah run)
pnpm --filter @improve-personal/core exec vitest run src/calc/goal.qa-probe2.test.ts
# → 12 passed (12). Run pertama 1 gagal karena ekspektasi QA salah hitung
#   (Januari 2026 punya 4 Senin, bukan 2) — setelah koreksi 12/12; bukan bug produk.

# 5) Regresi halaman Goals (#32) — tidak tersentuh task ini
pnpm --filter @improve-personal/web exec vitest run \
  app/utils/goals.test.ts app/composables/useGoals.test.ts
# → 2 files · 14 passed

# 6) Kualitas
pnpm --filter @improve-personal/core exec eslint \
  src/domain/entities/goal.ts src/calc/goal.ts \
  src/domain/entities/goal.test.ts src/calc/goal.test.ts --max-warnings 0
# → exit 0
pnpm exec prettier --check packages/core/src/domain/entities/goal.ts \
  packages/core/src/calc/goal.ts packages/core/src/domain/entities/goal.test.ts \
  packages/core/src/calc/goal.test.ts
# → All matched files use Prettier code style!
pnpm --filter @improve-personal/core typecheck
# → tsc -p tsconfig.json, exit 0
```

Tidak ada `it.only`, `.skip`, test ter-comment, atau `it.fails` tersisa. Probe QA sudah dihapus — `git status` bersih dari file probe.

## 8.5 Catatan non-blocking (bukan bug T17)

**N1 — [Medium · integration risk, bukan bug T17] Invariant lintas-record belum dipanggil jalur import/simpan.**
`checkGoalBundle`/`checkGoalLinksUnique`/`attachGoalLink` hanya muncul di modul + barrel (`domain/index.ts:218,223,224,234`); **nol pemakai** di `packages/core/src/io/**`, `sync/**`, `apps/**`. `io/import.ts` masih validasi per-record via `validateEntityPayload` (`io/import.ts:5` → `domain/entities/index.ts:72-74`), sehingga berkas backup berisi chapter di luar rentang / dua tautan item yang sama tetap lolos import. AC "ditolak" terpenuhi di level model, **belum** di jalur simpan. Wajib di-wire di T12 (import) dan #32 (form/simpan) + test integrasi di lapisan itu; jangan tandai bagian itu selesai.

**N2 — [Low · kerapian test] Komentar basi di test.**
`packages/core/src/domain/entities/goal.test.ts:661-663` masih menulis "chapter tujuan kosong dianggap 100%" — bertentangan dengan semantik baru (kosong = 0%, `goal.ts:467-477`). Assertion tidak terpengaruh, tapi komentar menyesatkan saat #32 membaca test ini sebagai spesifikasi.

**N3 — [Low · untuk #32] `goalProgressReport` tidak mengurutkan chapter berdasarkan `sortOrder`.**
`calc/goal.ts:281` memakai urutan `input.chapters` apa adanya. Stepper/reorder F13 butuh urutan `sortOrder`; pemanggil harus menyortir dulu atau fungsi ini menyortir sendiri. Bukan pelanggaran AC T17 (AC tidak menyebut urutan report), tapi mudah jadi bug tampilan di #32.

**N4 — [Low · kerapian] Field mati di signature.**
`ChapterProgressInput.isClosed` (`goal.ts:462-465`) diterima `chapterProgressPercent` tetapi tidak pernah dibaca; hanya `chapterStatus` yang memakai `isClosed` (`:445`). Perilaku sudah benar (chapter ditutup tidak otomatis 100%), field-nya saja yang tidak perlu — kandidat dibersihkan.

**N5 — [Info · terbuka dari putaran 1, B6] Model goal masih duplikat di web.**
`apps/web/app/utils/goals.ts:112-114` merata-ratakan **per item** (2 task 1 selesai + habit 100% → 67%), core merata-ratakan **per tipe** (`goal.ts:423-425`, test `calc/goal.test.ts:386-404` → 75%). Halaman Goals (#32) belum migrasi dan masih mock (`apps/web/app/composables/useGoals.ts`). Bukan scope T17; **wajib** migrasi di #32 supaya web & mobile tidak beda angka.

**N6 — [Info · pertanyaan produk] Formula "rata-rata" PRD F13 ambigu.**
PRD `docs/PRD.md:642-646` menulis "Rata-rata dari item di dalamnya", sedangkan core memilih rata-rata **per tipe** (todo/habit/jadwal berbobot sama, lalu antar-tipe). Contoh: 2 task (1 selesai) + 1 habit 100% → core **75%**, rata-rata per item **66.7%**. AC T17 tidak mematok formula dan pilihan core sudah didokumentasikan + dites, jadi tidak dihitung bug; konfirmasi ke produk sebelum #32 merender angka ini.

## 8.6 Coverage & celah tersisa

- **Tercakup:** seluruh export `domain/entities/goal.ts` (schema, key/lookup tautan, attach/resolve, range check, bundle check, hapus chapter/goal, status, progress, clamp) dan `calc/goal.ts` (`taskProgressPercent`, `habitPeriodProgressPercent`, `schedulePeriodProgressPercent`, `goalSlices`, `goalItemsProgress`, `goalProgressReport`).
- **Belum tercakup (rekomendasi, non-blocking):**
  - Beberapa habit / beberapa jadwal dalam satu slice (test hanya 1 habit & 1 jadwal) — rata-rata antar item sejenis belum dipatok.
  - `attachGoalLink` untuk item yang sudah tertaut ke **goal lain** (pesan & `existing`), meski jalur kodenya sama dengan beda chapter.
  - Test integrasi import/save yang memanggil `checkGoalBundle` — belum bisa ada sebelum N1 di-wire.
  - Tooling coverage (`@vitest/coverage-v8`) tidak terpasang; penilaian cakupan di atas kualitatif per export.

## 8.7 Proses, scope & rekomendasi

- **File diubah QA putaran 2:** hanya `reports/qa-t17-model-goal.md` + satu file probe sementara yang sudah dihapus. Tidak ada kode produk, test developer, commit, atau status Ergonio yang diubah.
- **Rekomendasi orchestrator:** pindahkan #31 `review` → `done` + `progressPct: 100`, komentar `LULUS` berisi perintah §8.4. Buat catatan terpisah untuk N1 (wiring import/save) supaya tidak hilang di #32, dan ingatkan #32 soal N3/N5/N6.
- **Rules dibaca putaran 2:** `AGENTS.md`, `CLAUDE.md` root, `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `docs/PRD.md` F13 + baris T17/AC. Tidak mengedit file `apps/**`, jadi rules app tidak dimuat ulang; regresi web hanya dijalankan sebagai pembanding.
