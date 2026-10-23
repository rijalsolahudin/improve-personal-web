# QA Report — Task #56: Wire invarian goal ke import/simpan (N1 T17)

**Tanggal:** 2026-10-23 · **QA:** Fajar · **Task:** Ergonio #56 (`a7184e89-b586-4eb1-bb95-68f94e5d11be`)
**Area:** `packages/core` (`src/io`, `src/domain/entities/goal.ts`) · **Rules dibaca:** root `CLAUDE.md`, `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`

## Verdict

**LULUS DENGAN CATATAN** — semua AC-A (56.1–56.5) terbukti dengan test yang dijalankan. Ada satu celah nyata di luar lingkup AC (**F1, Medium**): invarian diperiksa pada **dokumen masuk**, bukan pada **hasil merge** dengan storage lokal, sehingga import `merge` yang "berhasil" tetap bisa meninggalkan 2 tautan untuk item yang sama atau chapter di luar periode goal. Tidak blocking terhadap AC (AC-56.3 secara eksplisit menyebut fase baca & fase tulis atas dokumen), tapi perlu task lanjutan.

## Scope & test plan

Diuji (core, jalur import):

1. Titik panggil invarian: `collectGoalInvariantIssues` benar-benar dipanggil di fase baca **dan** fase tulis, bukan cuma di-export.
2. Penolakan terjadi **sebelum** satu byte ditulis, di kedua mode (`merge` & `replace-all`).
3. Data yang diperiksa = payload yang sudah di-parse/dinormalisasi (bukan `unknown` mentah), dan setelah migrasi.
4. Invarian global (link ganda lintas goal) vs invarian per-bundle (rentang chapter) tidak saling menutupi.
5. Semantik AC-56.4: tombstone diabaikan, bundle parsial tidak dicek rentangnya, tautan hidup ke chapter tombstone tidak menggagalkan restore.
6. Boundary value rentang (chapter tepat di `startDate`/`targetDate` goal).
7. Kualitas pesan penolakan (bisa ditindaklanjuti user).
8. Biaya satu lintasan tambahan pada batas 50k record (B-56.2).

Tidak diuji (alasan):

- Jalur simpan web (`apps/web/app/utils/goals/persistence.ts`) — hanya dibaca kodenya untuk memastikan wiring lama masih ada; task ini tidak menyentuh `apps/web` dan AC-nya core. Tidak ada test web yang dijalankan.
- Skenario sync/multi-device setelah import (di luar task; pull punya invarian sendiri).
- Migrasi versi skema lama → invarian (tidak ada migrasi goal di `io/migrations.ts` saat ini).

## Hasil per acceptance criteria

### AC-56.1 — Chapter di luar periode ditolak, data lama tidak berubah — **PASS**

- Titik panggil fase baca: `packages/core/src/io/import.ts:371` → `collectGoalInvariantIssues(document.records)`, lalu `reject('GOAL_INVARIANT_VIOLATION', ...)` di `import.ts:372-378`. Dijalankan **setelah** migrasi (`import.ts:336-355`) dan setelah validasi payload per-record (`import.ts:359`), jadi yang diperiksa adalah dokumen final, bukan data versi lama.
- Titik panggil fase tulis: `assertImportableDocument` di `import.ts:206`, dipanggil paling awal di `applyBackupImport` (`import.ts:478`) — sebelum `storage.getRecords`, sebelum `seal`, sebelum `wipe()` (`import.ts:518-519`).
- Bukti test: `io.goal-invariants.test.ts:326` (ditolak dengan `reason === 'GOAL_INVARIANT_VIOLATION'`, pesan memuat `Tidak ada data yang diubah`), `:354` (snapshot storage sebelum = sesudah untuk fase baca), `:368` (fase tulis menolak + 0 record tertulis).
- Probe QA: mode `replace-all` dengan dokumen melanggar → `BackupImportInvariantError` **dan tidak ada `wipe()`**; isi storage identik byte-per-byte (`before === after`). Ini menutup celah yang tidak diuji test repo (test repo hanya memakai `merge`).

### AC-56.2 — Tautan ganda ditolak, tidak ada data setengah tertulis — **PASS**

- Per goal: `checkGoalBundle` → `checkGoalLinksUnique` (`goal.ts:300-301`). Lintas goal (kasus yang tidak bisa dilihat satu bundle): `collectGoalInvariantIssues` memanggil `checkGoalLinksUnique(liveLinks)` global (`goal-invariants.ts:109-110`) dengan **semua** tautan hidup, termasuk yang goal induknya tidak ada di berkas.
- Dedupe pesan: `goal-invariants.ts:114` (`new Set(issues)`) — duplikat di goal yang sama tidak muncul dua kali.
- Bukti test: `io.goal-invariants.test.ts:216` (satu goal, satu pesan), `:230` (dua goal berbeda), `:327` (jalur import), `:355` (fase tulis, 0 record).
- Probe QA: dua tautan hidup untuk item yang sama yang keduanya menunjuk chapter **tombstone** tetap ditolak `GOAL_INVARIANT_VIOLATION` — filter tombstone tidak "membutakan" pemeriksaan keunikan karena `liveLinks` tidak difilter (`goal-invariants.ts:83` vs `:95-97`). Bagus.

### AC-56.3 — Dipanggil di fase baca & fase tulis — **PASS**

- `grep -rn "collectGoalInvariantIssues" packages apps` → dua pemanggil produksi: `import.ts:206` (`assertImportableDocument`) dan `import.ts:371` (`validateBackupText`), plus definisi di `goal-invariants.ts:48`. Bukan sekadar export barrel.
- Fase tulis tidak bergantung pada fase baca: probe QA memberi dokumen melanggar **langsung** ke `applyBackupImport` (bypass `validateBackupText`) → dilempar `BackupImportInvariantError` dengan issue `Chapter "Base" selesai (2026-05-01) melewati main goal selesai (2026-03-31)`, 0 record tertulis.
- Data yang diperiksa sudah ternormalisasi: setiap record di-parse ulang dengan schema domain (`goal-invariants.ts:58-84`), sehingga default (`goalChapter.isClosed`) dan trim sudah diterapkan; payload rusak dilewati di sini karena sudah dilaporkan `validateEntityPayload` (komentar `goal-invariants.ts:69-70`) — tidak ada double-report.
- Urutan pelaporan: pelanggaran goal dilaporkan sebagai `GOAL_INVARIANT_VIOLATION` walau `dataCount` juga salah (probe QA) karena dicek di `import.ts:371` sebelum `import.ts:384`.

### AC-56.4 — Semantik tombstone / parsial / tautan ke chapter tombstone — **PASS**

- Tombstone diabaikan: `goal-invariants.ts:56-64` (`continue` untuk `deleted`), dengan pengecualian yang disengaja — id chapter tombstone dikumpulkan (`:57-61`) untuk memfilter tautan di `:95-97`.
- Hanya bundle lengkap yang dicek rentangnya: loop `for (const goal of goals.values())` (`:93`) — chapter tanpa goal induk tidak masuk bundle mana pun. Bukti test `:287`.
- Tautan hidup ke chapter tombstone: `:95-97` memfilter tautan yang menunjuk chapter tombstone **milik goal yang sama** (map `deletedChapterIdsByGoal` di-key per goal, jadi chapter tombstone goal lain tetap dianggap "tidak ada" → ditolak, benar). Bukti: test baru `io.goal-invariants.test.ts:276` & `:415` (lihat "File yang diubah").
- Import parsial tetap boleh: probe QA `chapter + link tanpa goal` → `validateBackupText` ok.

### AC-56.5 — Regresi & tooling — **PASS**

| Perintah | Hasil |
|---|---|
| `pnpm --filter @improve-personal/core exec vitest run src/io src/domain/entities/goal.test.ts` | 5 file, **148/148 lulus** (146 baseline + 2 test tambahan QA) |
| `pnpm --filter @improve-personal/core exec vitest run` | 20 file, **371/371 lulus** (369 baseline + 2) |
| `pnpm --filter @improve-personal/core exec tsc -p tsconfig.json` | exit 0 |
| `pnpm --filter @improve-personal/core exec eslint src/io src/domain/entities/goal.test.ts --max-warnings 0` | exit 0 |
| `pnpm exec prettier --check <4 file terkait>` | `All matched files use Prettier code style!` |

`io.roundtrip.qa.test.ts` tidak regresi (bagian dari 5 file di run pertama). Tidak ada `it.only`/`.skip` baru; test baseline tidak diubah/dihapus.

## Bugs / temuan

### F1 — [Medium · non-blocking AC, perlu task lanjutan] Invarian tidak diperiksa pada **hasil merge**, sehingga import mode `merge` bisa menghasilkan pelanggaran permanen

**Lokasi:** `packages/core/src/io/import.ts:478` (cek hanya `input.document`), `:484-497` (merge per `record.id` via `decideMerge`), `:518-537` (tulis). Mode default UI = `merge` (`apps/web/app/composables/useBackupImport.ts:53`).

**F1a — tautan ganda setelah merge**

1. Storage lokal sudah punya `goal_link` id `...0007` untuk `todo:ITEM` di goal G1.
2. Import berkas (sah secara dokumen) yang berisi `goal_link` id `...0008` untuk `todo:ITEM` di goal G2.
3. `validateBackupText` ok, `assertImportableDocument` ok (dokumen tidak memuat dua link untuk item itu), merge menulis link kedua karena id record berbeda.

Expected: `uq_goal_link_item` (satu item satu tautan) tetap berlaku setelah import.
Actual: 2 tautan hidup untuk `todo:ITEM`; progress bisa dobel hitung dan tidak bisa dibetulkan dengan import ulang.
Bukti probe: `P1 validation: {"ok":true,...}`, `P1 written: 1`, setelah import ada 2 tautan hidup.

**F1b — chapter di luar periode setelah merge (LWW lokal menang)**

1. Lokal: goal G `2026-01-01..2026-02-01` (diedit user setelah backup dibuat).
2. Berkas: goal G `2026-01-01..2026-03-31` (HLC lebih lama) + chapter `2026-01-01..2026-03-15` (sah terhadap goal **di berkas**).
3. Merge: goal lokal menang (`decideMerge` skip), chapter tetap ditulis.

Expected: chapter di luar periode main goal ditolak (invarian yang sama dengan AC-56.1).
Actual: `P2 written/skipped: 1 1` → storage berisi goal `targetDate 2026-02-01` + chapter `endDate 2026-03-15`.
Sumber: `import.ts:490-495` memutuskan per record tanpa melihat hasil gabungan.

**Catatan severity:** bukan regresi dari task ini (perilaku fase tulis sesuai AC yang tertulis: invarian atas dokumen). Risiko B-56.1 yang diakui developer hanya "storage lokal yang telanjur melanggar", sedangkan F1 adalah storage yang **menjadi** melanggar karena import yang dinyatakan sukses. Saran: task lanjutan — sebelum menulis, bangun `Map` hasil merge (lokal + dokumen) lalu jalankan `collectGoalInvariantIssues` atas hasil itu; kalau biaya baca dirasa berat, minimal untuk `goal`/`goal_chapter`/`goal_link` saja (sudah dilakukan `merge` lewat `getRecords` per batch).

### F2 — [Low · saran] Dua chapter dengan `data.id` sama (record id berbeda) di goal berbeda lolos

`findDuplicateId` (`import.ts:396`) hanya membandingkan `record.id`, bukan `data.id`. Probe QA: dua record `goal_chapter` dengan payload `id` identik tapi `goalId` berbeda dan record id berbeda → `validateBackupText` ok. Link ke id itu jadi ambigu. Tidak berbahaya selama shell selalu menulis `record.id === data.id` (diasumsikan), tapi belum ada yang menegakkannya. Severity Low, cukup dicatat.

### F3 — [Low · catatan] Pesan penolakan tidak memuat path/index record, hanya judul/tanggal/id domain

Probe: `issues = ["Chapter \"Base\" selesai (2026-05-01) melewati main goal selesai (2026-03-31)"]` — informatif dan bisa ditindaklanjuti, tapi berbeda dari `INVALID_RECORD` yang berprefix `type/id` (`import.ts:182`). Juga `message` menyebut `goalIssues.length` sementara `issues` dipotong `MAX_REPORTED_ISSUES = 20` (`import.ts:376`), jadi pada berkas dengan >20 pelanggaran angka di pesan tidak sama dengan jumlah baris yang tampil. Konsisten dengan penolakan lain, tidak blocking.

## Cek tiga pilar

- **Keamanan:** invarian ditegakkan sebelum tulisan; penolakan tidak membocorkan payload (hanya judul/tanggal/id, bukan isi PII). Tidak ada `console.*`. Tidak ada permukaan baru.
- **Performa:** satu lintasan O(n) tambahan, hanya record `goal`/`goal_chapter`/`goal_link` yang di-parse (`goal-invariants.ts:66-88`). Ukur di batas `BACKUP_MAX_RECORDS = 50.000` (10k goal + 20k chapter + 20k link, kasus terburuk dengan 19.999 issue): **160,2 ms** (`performance.now()`, mesin dev ini). Jalur dingin (user menekan Import), jauh di bawah waktu tulis/enkripsi 50k record. Non-blocking.
- **Kerapian:** satu modul fokus (`goal-invariants.ts`) dengan komentar "kenapa" yang menjelaskan tiga keputusan rawan; tidak ada duplikasi aturan (memakai `checkGoalBundle`/`checkGoalLinksUnique` domain, bukan salinan); dedupe pesan eksplisit; typecheck + lint + prettier hijau.

## Coverage & celah test yang tersisa

Ditutup oleh QA (test-only, 2 test):

1. `collectGoalInvariantIssues`: tautan hidup → chapter tombstone **bukan** pelanggaran (semantik AC-56.4 sebelumnya nol test).
2. Jalur import: dokumen dengan chapter tombstone + tautan hidup berhasil direstore (3 record, chapter tetap tombstone, tautan hidup).

Masih belum ada test (rekomendasi, bukan blocker):

- F1a/F1b (merge menghasilkan pelanggaran) — sengaja **tidak** ditambahkan sebagai test merah karena keputusannya butuh task lanjutan; reproduksi ada di laporan ini.
- Mode `replace-all` + dokumen melanggar (dibuktikan lewat probe QA, belum ada test permanen).
- Invarian pada jalur simpan web (`goals/persistence.ts:139`, `goals/links.ts:111`) — ter-wire menurut pembacaan kode, tapi `persistence.test.ts` tidak menguji penolakan rentang/tautan ganda.
- Boundary `chapter.startDate === goal.startDate` & `chapter.endDate === goal.targetDate` — probe QA ok, belum ada test permanen (nilai tambah kecil, `checkChapterWithinGoal` sudah unit-tested).

## File yang diubah QA

- `packages/core/src/io/io.goal-invariants.test.ts` — **hanya menambah 2 test** (unit + import), tidak mengubah test/assertion lama. `git diff --stat`: `1 file changed, 27 insertions(+)`. Tidak ada file produk yang disentuh, tidak ada commit.

Catatan housekeeping: di working tree ada perubahan milik sesi/agent lain (`apps/web/app/pages/app/memo.draft.qa.test.ts`, `apps/web/app/composables/useMemoDraft.qa.test.ts`, `apps/web/app/utils/guide.qa.test.ts`) — bukan dari QA ini, tidak disentuh.

## Sisa risiko

- **F1** (Medium): import `merge` bisa meninggalkan tautan ganda / chapter di luar rentang yang tidak bisa dibetulkan lewat import ulang. Perlu task lanjutan.
- B-56.1 tetap berlaku: storage yang sudah melanggar sebelum import tidak diperbaiki otomatis (tidak ada "heal" saat load).
- F2 (Low): duplikasi `data.id` lintas goal tidak terdeteksi.
- Migrasi versi skema lama yang mengubah bentuk goal/chapter belum ada; kalau nanti ditambah, invarian tetap harus dijalankan **setelah** migrasi (saat ini urutannya sudah benar di `import.ts:336-371`).
