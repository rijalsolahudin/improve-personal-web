# QA verification — Task #26 [T12] Import/export JSON (gabung / ganti semua)

Tanggal: 2026-10-22 · Reviewer: Fajar (QA) · Tree: `f8a9a5c` + working tree agent lain (tidak disentuh QA)
· Status task: `review` (tidak diubah, sesuai instruksi).

> **Status terkini — Putaran 2 (2026-10-23): LULUS (dengan catatan).**
> Verdict **GAGAL** di bawah adalah hasil putaran 1, sebelum perbaikan `bayu` (core) & `dimas` (UI).
> Verifikasi ulang ada di **§Putaran 2** di akhir dokumen: BUG-1/2/3/4/5 dan GAP-1 sudah diperbaiki dan
> terbukti; tidak ada temuan blocking. Tersisa satu bug baru **Low** (race saat memilih berkas dua kali
> berturut-turut) dan beberapa risiko sisa yang tidak melanggar AC T12.

Rules dibaca: root `CLAUDE.md`, `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`,
`apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{security,performance,code-quality}.md`.
Requirement: `docs/PRD.md` F10 (baris 414–456), DoD (baris 1120–1126), AC T12 (baris 1097).

Environment: Node `v24.18.0`, `vitest 5.0.3`, pnpm workspace, Linux.

**Tidak ada kode produk yang diubah QA.** Satu-satunya perubahan dari saya:
`?? packages/core/src/io/io.roundtrip.qa.test.ts` (24 test, 826 baris) + laporan ini.
Probe tambahan dijalankan sebagai file sementara (`probe12*.qa.test.ts`) lalu dihapus; isi + hasilnya
dicatat di §Bug supaya bisa direproduksi developer.

---

## Verdict: **GAGAL (blocking)**

Lapisan data `packages/core/src/io` **solid**: round-trip identik lintas 6 tipe entitas, 8 jalur
penolakan terbukti tidak menyentuh storage, batas 32 MB berlaku di jalur default, dan teks peringatan
plaintext sama persis dengan PRD. Tapi tiga hal membuat AC T12 belum bisa lulus:

1. **BUG-1 (High, blocking)** — berkas hasil export bisa **ditolak oleh import aplikasi sendiri**:
   export tidak punya batas, import punya batas 50.000 record / 32 MB. Backup yang tidak bisa
   dipulihkan = kehilangan data permanen, dan user baru tahu saat butuh restore.
2. **AC "peringatan sebelum export" GAGAL di level user** — teks peringatan ada sebagai konstanta,
   tapi **tidak ada satu pun pemanggil** `io/` di `apps/web`/`apps/mobile`; fitur F10 belum bisa
   dipakai dan peringatan belum pernah tampil (GAP-1).
3. **BUG-3 (High)** — mode "ganti semua" menghapus data **sebelum** menulis; satu kegagalan saat
   import (crypto/disk) meninggalkan nol data tanpa rollback. Terbukti di probe: 2 record lama → 0,
   record baru → 0.

BUG-2/4/5 di bawah tidak blocking sendiri-sendiri, tapi semuanya celah validasi yang harus ditutup
sebelum rilis karena menyangkut integritas berkas backup.

---

## Scope & test plan

| Area | Level | Alasan |
|---|---|---|
| `buildBackupDocument` / `serializeBackup` / `backupFileName` | unit murni | AC export: metadata, `encrypted:false`, nama berkas, `dataCount` |
| `validateBackupText` | unit murni + bandingkan sidik jari storage | AC "file invalid/versi asing ditolak tanpa mengubah data" |
| `applyBackupImport` (merge & replace-all) | unit + adapter memori | AC mode gabung/ganti semua, outbox/sync setelah import |
| Round-trip export → wipe → import | unit + adapter memori | AC inti: identik, dibandingkan **isi** record |
| Batas ukuran & jumlah record | unit + boundary value | AC "ada batas ukuran file" |
| Jalur baca/tulis IndexedDB (web) untuk import | **tidak diuji** | di luar scope T12 (`be`, core) dan butuh wiring yang belum ada |

Tidak diuji (dengan alasan):

- **UI export/import, Playwright/E2E**: tidak ada UI-nya. Tidak ada komponen, halaman, atau
  composable yang mengimpor `io/` (lihat GAP-1). Tidak ada yang bisa diklik.
- **Adapter IndexedDB & SQLite nyata**: import belum di-wire ke `apps/web/app/utils/storage/*`;
  perilaku `wipe()` + transaksi IndexedDB hanya relevan setelah wiring ada. Sisa risiko di §Sisa risiko.
- **Enkripsi nyata**: `packages/crypto` di luar scope; test memakai seal/open pengganti deterministik
  `plain:<json>`, sama seperti `io.test.ts`.
- **Full suite**: instruksi task minta test terarah supaya tidak bentrok dengan agent lain.

Test otomatis baru: `packages/core/src/io/io.roundtrip.qa.test.ts` — 24 test, semuanya hijau.

---

## Hasil per acceptance criteria

| # | Acceptance criteria | Hasil | Bukti |
|---|---|---|---|
| 1 | Round-trip export → wipe → import **identik** (bandingkan isi) | **PASS** (data di bawah batas import; lihat BUG-1 untuk data besar) | `io.roundtrip.qa.test.ts:309` "6 tipe entitas + tombstone kembali identik…" — `expect(after).toEqual(before)` membandingkan `id,type,hlc,deleted,schemaVersion,data` untuk `user_prefs, todo, habit, habit_checkin, countdown, journal_entry` + 1 tombstone; re-export `toEqual` dokumen asli. `:364` tombstone → outbox `op:'delete'`. Run: 44 test hijau. |
| 2 | File invalid / versi asing ditolak **tanpa mengubah data** (atomic: validasi dulu, baru tulis) | **PASS** | `:519` JSON rusak, `:525` format asing, `:539` versi format `2.0.0`, `:552` schema lebih baru, `:565` berkas "terenkripsi", `:578` `dataCount` negatif, `:590` field asing, `:602` satu payload rusak menggagalkan seluruh berkas. Tiap test membandingkan sidik jari storage (record + outbox + sync_state) sebelum/sesudah: `expect(after).toBe(before)` (`:499-517`). Kode: `import.ts:111-246` murni tanpa storage, `import.ts:313` menulis hanya setelah validasi. |
| 3 | Ada batas ukuran file | **PASS** | `:642` tepat di batas lolos, 1 byte di atasnya `FILE_TOO_LARGE`; `:652` batas default `32 MB` dipakai walau opsi tidak dikirim, dan dicek **sebelum** parse (33 MB teks bukan-JSON → `FILE_TOO_LARGE`, bukan `INVALID_JSON`); `:755` byte dihitung sebagai UTF-8 (emoji 4 byte), bukan jumlah karakter. Kode: `backup.ts:45`, `import.ts:119-126`. |
| 4 | Peringatan "file tidak terenkripsi" **muncul sebelum export** | **GAGAL** (teks benar, tapi tidak pernah tampil) | `:672` `BACKUP_PLAINTEXT_WARNING` **sama persis** dengan kalimat PRD F10; `:677` berkas menandai `encrypted:false`. Tapi **tidak ada pemanggil** konstanta itu di `apps/` (grep: hanya `packages/core/src/io/*`), tidak ada tombol Export / dialog peringatan (GAP-1). AC berbunyi "muncul", bukan "tersedia sebagai konstanta". |
| 5 | Mode **gabung** tidak menghapus data lama; **ganti semua** menghapus lalu menulis | **PASS** | `:401` gabung dengan berkas 1 record: 2 record lokal tetap ada, record baru masuk; `:433` versi lokal lebih baru di-skip dan isinya utuh; `:462` replace-all menghapus record yang tidak ada di berkas. Kode: `import.ts:317-340`. Catatan deviasi: gabung memakai LWW `decideMerge` (`import.ts:330`), sedangkan PRD menulis "update yang ada (by ID)" — untuk record yang lebih tua dari versi lokal, berkas **tidak** menimpa (sengaja, komentar `import.ts:309-311`). Saya nilai PASS karena mencegah edit baru hilang; PRD sebaiknya diperjelas. |
| 6 | Input divalidasi skema (tanpa menulis sebelum valid), tidak ada `innerHTML` dari isi file | **PASS** (dengan catatan BUG-5) | Validasi fase 1 murni: tidak ada `storage.`, `Date.now`, `Math.random` di `validateBackupText` (`import.ts:111-246`); payload per tipe divalidasi `import.ts:228-243`; envelope `strict()` `backup.ts:78-90`. `grep -rn "innerHTML\|v-html" apps/web/app apps/web/server packages/core/src` → 0 pemakaian, hanya 2 komentar (`apps/web/app/utils/icons.ts:3`, `packages/core/src/domain/entities/journal.ts:17`). Tidak ada `document.`/`eval`/`new Function` di modul io. **Catatan:** `applyBackupImport` sendiri tidak menjaga invarian "sudah divalidasi" → BUG-5. |

---

## Bug

### BUG-1 — Export bisa menghasilkan berkas yang **ditolak import-nya sendiri** (High, blocking)

**Langkah reproduksi** (public API, tanpa internal hack):

1. Susun dokumen dari data besar:
   - varian A: 200 record `journal_entry` dengan `diaryMd`/`moodStoryMd` 100.000 karakter (batas schema
     `journal.ts:30,32`) → `buildBackupDocument` → `serializeBackup` = **40.066.087 byte**
     (`pretty` = 40.095.242 byte), batas import `33.554.432` byte;
   - varian B: 50.001 record apa pun (mis. `user_prefs`) → `serializeBackup({pretty:false})` =
     13.600.761 byte.
2. `validateBackupText(...)` pada teks hasil export itu.

**Expected:** export menolak/memperingatkan lebih dulu (atau batas export ≥ batas import), sehingga
berkas yang diberi label "backup" selalu bisa dipulihkan.

**Actual:**

```
A: 200 record jurnal (diaryMd 100k) -> compact=40066087 byte, pretty=40095242 byte, limit=33554432,
   import ok=false reason=FILE_TOO_LARGE
B: export 50001 records (13600761 byte, limit 33554432) -> import ok=false reason=TOO_MANY_RECORDS
```

**Bukti:** `backup.ts:117-139` (`buildBackupDocument` tidak memeriksa `BACKUP_MAX_BYTES`/
`BACKUP_MAX_RECORDS`), `backup.ts:45` (`BACKUP_MAX_BYTES = 32 MB`), `backup.ts:48`
(`BACKUP_MAX_RECORDS = 50_000`), `import.ts:119-126` (size), `import.ts:186-192` (records).
Pesan penolakan import pun menyuruh "Pecah berkasnya atau export sebagian" (`import.ts:123`) padahal
export sebagian tidak ada.

**Dampak:** user menyimpan backup, lalu saat perangkat hilang/rusak restore-nya gagal permanen.
Severity High karena kehilangan data dan baru terdeteksi di titik terburuk.

**Saran:** `buildBackupDocument`/`serializeBackup` mengembalikan status "melebihi batas" (atau
memecah jadi beberapa berkas) + UI menolak/memperingatkan sebelum menulis berkas; minimal konstanta
batas dipakai bersama oleh export & import (satu sumber angka).

### BUG-2 — `dataCount` tidak dicek silang dengan `records`: preview bisa berbohong (Medium)

**Reproduksi:** dokumen berisi 1 record `user_prefs`; ubah `dataCount` jadi
`{ todo: 99, user_prefs: 0 }`; `validateBackupText`.

**Expected:** ditolak (`SCHEMA_MISMATCH`) atau `dataCount` dihitung ulang dari `records` sebelum
preview, karena PRD memakai `dataCount` untuk layar preview ("N jadwal, M task").

**Actual:**

```
A dataCount mismatch -> ok=true records=1 dataCount.todo=99 dataCount.user_prefs=0
```

Import lalu menulis 1 record sementara preview menjanjikan 99 → user memutuskan "ganti semua"
berdasarkan angka yang salah.

**Bukti:** `backup.ts:74` (hanya bentuk, `z.int().min(0)`), `backup.ts:127-128` (export menghitung
dari records, jadi export sendiri konsisten), `import.ts:173-182` (tidak ada cek silang).

**Saran:** setelah `backupDocumentSchema` lolos, bandingkan `dataCount` hasil hitung ulang dengan
yang ada di berkas → tolak kalau beda.

### BUG-3 — "Ganti semua" menghapus data sebelum menulis; gagal di tengah = nol data (High)

**Reproduksi:** storage berisi 2 record lama; dokumen valid berisi 3 record baru; panggil
`applyBackupImport({ mode:'replace-all', seal })` di mana `seal` melempar pada panggilan ke-2
(simulasi crypto/kunci tidak tersedia, disk penuh, tab ditutup).

**Expected:** data lama tetap ada sampai seluruh record baru siap ditulis (tulis dulu → tukar), atau
ada snapshot/pemulihan. Gagal import = tidak ada perubahan.

**Actual:**

```
C seal gagal (#3, thrown=crypto gagal) -> record lama tersisa=0, record baru tertulis=0, outbox=0
C2 merge + seal gagal                  -> record lama tersisa=2 (mode gabung aman)
```

**Bukti:** `import.ts:317-319` (`await storage.wipe()` sebelum apa pun ditulis), `import.ts:344-350`
(`seal` per batch setelah wipe; batch yang gagal rollback, tapi wipe sudah permanen),
`import.ts:38-40` (komentar menyadari `seal` di luar transaksi), `ports.ts:175-181` (kontrak `wipe`
hanya "dipakai setelah validasi", bukan "aman untuk rollback").

**Dampak:** kehilangan seluruh data lokal karena kegagalan yang tidak berhubungan dengan isi berkas.
Severity High (probabilitas rendah, dampak total). Sebelum rilis, minimal: simpan snapshot sementara
(atau tulis ke tabel baru lalu tukar) sampai import selesai.

### BUG-4 — `schemaVersion` per-record tidak dicek/dimigrasikan (Low)

**Reproduksi:** dokumen `schemaVersion: 1` (versi build ini), satu record dengan `schemaVersion: 99`
dan payload versi sekarang; `validateBackupText` → import.

**Expected:** ditolak (`VERSION_TOO_NEW`/`SCHEMA_MISMATCH`) karena record mengaku dari skema yang
tidak dimengerti build ini.

**Actual:**

```
F1 dokumen schemaVersion=1, record schemaVersion=99 -> ok=true migratedFrom=null
F2 blob tersimpan = {"type":"user_prefs","schemaVersion":99,...}
```

**Bukti:** `import.ts:205-224` hanya memakai `document.schemaVersion`; `migrations.ts:53-101`
memigrasikan record berdasarkan versi dokumen, bukan `record.schemaVersion`; `backup.ts:63`
per-record hanya `z.int().min(1)`.

**Dampak:** berkas yang (sengaja/rusak) mencampur versi record lolos gate versi dan menulis data
"masa depan" ke storage; pembaca tidak punya jalur migrasi untuk itu.

### BUG-5 — `applyBackupImport` menerima dokumen yang belum divalidasi (Low, defense-in-depth)

**Reproduksi:** susun `BackupDocument` berisi `todo` dengan `data: {}`, panggil `applyBackupImport`
langsung tanpa `validateBackupText`.

**Expected:** ditolak, atau tipe parameter hanya bisa diperoleh dari hasil `validateBackupText`
(branded type) sehingga pemanggil tidak mungkin melewati validasi.

**Actual:**

```
D1 validate dokumen rusak -> ok=false        (validasi memang menolak)
D2 apply tanpa validasi   -> written=1 tersimpan=true payload={"type":"todo","schemaVersion":1,"data":{}}
```

**Bukti:** `import.ts:313-371` (tidak ada cek internal), `backup.ts:65` (`data: z.unknown()` di
schema envelope), `io/index.ts:39-51` (kedua fungsi diekspor setara).

**Dampak:** bug wiring di shell (mudah terjadi: `JSON.parse` → `as BackupDocument` → apply) menulis
payload rusak ke storage; baru meledak saat hydrate/decrypt.

### GAP-1 — F10 belum tersambung ke UI: peringatan & batas ukuran tidak pernah tampil (High, AC)

**Bukti:** `grep -rn "backupFileName|serializeBackup|validateBackupText|applyBackupImport|BACKUP_PLAINTEXT_WARNING"`
di `apps/web/app`, `apps/web/server`, `apps/mobile` → **0 hasil**. Tidak ada halaman data/pengaturan
(`apps/web/app/pages/app/*` hanya fitur per-F), tidak ada tombol Export/Import, tidak ada dialog
peringatan. `io/` diekspor publik (`packages/core/src/index.ts:55`) tapi belum dipakai.

**Konsekuensi AC:** "peringatan … muncul sebelum export" tidak terpenuhi; user tidak bisa
export/import sama sekali. Task tabel PRD tidak punya task `fe` untuk F10 → perlu keputusan produk:
tambahkan task UI (tombol, warning, preview, pilih mode, konfirmasi ganti, progress, toast) atau
nyatakan T12 memang hanya lapisan data dan AC-nya dipersempit.

**Catatan tambahan (ikut GAP-1):** batas 32 MB diperiksa pada **string** yang sudah di memori
(`import.ts:119`), jadi pemanggil harus membaca seluruh berkas dulu (`File.text()`). Berkas 500 MB
akan OOM di HP sebelum batasnya sempat dicek — UI wajib memeriksa `File.size` sebelum membaca.

---

## Cek tiga pilar

| Pilar | Hasil | Catatan |
|---|---|---|
| **Keamanan** | Lulus dengan catatan | Input divalidasi schema `strict()` sebelum menulis; tidak ada `innerHTML`/`v-html`/`eval`/`document.` di modul io (grep + review); pesan penolakan tidak memuat isi payload user (`io.roundtrip.qa.test.ts:731`); tidak ada endpoint server/rahasia baru (fitur lokal). Catatan: berkas plaintext berisi PII memang by design — peringatannya belum pernah tampil (GAP-1); `dataCount`/`schemaVersion` belum dicek silang (BUG-2/4); `applyBackupImport` belum menjaga invarian validasi (BUG-5). |
| **Performa** | Lulus | Validasi 33 MB: **71–74 ms**; export+validasi 50.001 record: **±154 ms** (mesin ini). Tidak ada scan penuh/loop bersarang di jalur validasi. Catatan: seluruh berkas dibangun di memori (2× saat `pretty`) — di mobile perlu streaming/pecah berkas, terutama terkait BUG-1. |
| **Kerapian** | Lulus | Modul kecil & terpisah (`backup.ts`/`import.ts`/`migrations.ts`), komentar menjelaskan "kenapa", konstanta bernama (`BACKUP_MAX_BYTES`, `BACKUP_PLAINTEXT_WARNING`), tidak ada `any`/`@ts-ignore` di modul io, `typecheck` + `eslint --max-warnings 0` hijau. Catatan: `IMPORT_MODES`/`IMPORT_REJECTION_REASONS` diekspor tapi belum dipakai UI (konsekuensi GAP-1, bukan dead code selama wiring menyusul). |

---

## Perintah & hasil

```bash
# 1. Test terarah import/export (20 test lama + 24 test QA baru)
cd packages/core && pnpm vitest run src/io
# → Test Files  2 passed (2) | Tests  44 passed (44) | Duration 460ms
#    (sebelum sesi ini: io.test.ts saja = 20 passed; QA baru menambah 24 test, semua hijau)

# 2. Typecheck paket core (termasuk file QA baru)
cd packages/core && pnpm typecheck       # → tsc -p tsconfig.json, exit 0

# 3. Lint file QA baru
cd packages/core && pnpm exec eslint src/io/io.roundtrip.qa.test.ts --max-warnings 0   # → bersih

# 4. Bukti tidak ada innerHTML/v-html di jalur import/export
grep -rn "innerHTML\|v-html" --include="*.vue" --include="*.ts" apps/web/app apps/web/server packages/core/src
# → 2 hasil, keduanya komentar (icons.ts:3, journal.ts:17); 0 pemakaian

# 5. Bukti fitur belum ter-wire
grep -rn "backupFileName\|serializeBackup\|validateBackupText\|applyBackupImport\|BACKUP_PLAINTEXT_WARNING" \
  --include="*.ts" --include="*.vue" apps/web/app apps/web/server apps/mobile
# → 0 hasil

# 6. Probe sementara (dijalankan lalu file dihapus; sumbernya mengikuti repositori)
cd packages/core && pnpm vitest run src/io/probe12.qa.test.ts --silent=false --reporter=verbose
# → A/B/B2/C/C2/D/E seperti dikutip di §Bug (6 passed, 573ms)
cd packages/core && pnpm vitest run src/io/probe12b.qa.test.ts --silent=false --reporter=verbose
# → F1/F2/G/H (3 passed)
```

Tidak ada test yang dilemahkan, dihapus, atau diberi `.only`/`.skip`.

---

## Coverage & celah test yang tersisa

1. **Adapter asli belum diuji untuk import.** Semua test memakai `createMemoryStorage`. `wipe()` +
   transaksi IndexedDB (`apps/web/app/utils/storage/indexeddb.ts`) dan SQLite (mobile) belum
   dibuktikan untuk jalur replace-all (mis. `wipe` di IndexedDB terjadi di transaksi terpisah dari
   penulisan → jendela kehilangan data lebih lebar daripada adapter memori).
2. **Tidak ada test untuk `buildBackupDocument` ↔ batas import** (kelas BUG-1) — setelah diperbaiki,
   tambahkan test regresi "dokumen hasil export selalu lolos `validateBackupText`".
3. **Migrasi nyata belum ada** (`SCHEMA_MIGRATIONS` kosong, `CURRENT_SCHEMA_VERSION = 1`), jadi
   jalur migrasi hanya diuji dengan daftar migrasi yang di-inject. Saat versi naik, round-trip
   lintas versi wajib diuji ulang.
4. **Tidak ada test lintas-platform untuk `backupFileName`** selain tz `Asia/Jakarta`/`UTC` (mis.
   DST di `America/New_York`, tz tanpa DST). `localDateOf` memakai `Intl`, tapi tidak ada test DST di
   jalur nama berkas.
5. **Ukuran/record count besar** hanya diprobe manual (50.001 record, 40 MB); tidak dijadikan test
   permanen karena mahal (memori/time) — pertimbangkan test bertag `slow`.
6. **Belum ada test "import dua kali"** (idempoten): import berkas yang sama dua kali di mode merge
   seharusnya tidak menduplikasi (id sama + HLC sama → `skip`). Perilaku ini dijamin `decideMerge`
   (`sync/merge.ts:65-67`) tapi belum ada test di jalur import.

## Rekomendasi (urutan)

1. **Blocker:** samakan batas export & import (BUG-1) — satu sumber konstanta, plus status
   "berkas terlalu besar" yang bisa ditampilkan sebelum berkas ditulis; tambahkan test regresi.
2. **Blocker:** putuskan GAP-1 (task UI F10) atau persempit AC T12; kalau UI dibuat, `File.size`
   diperiksa sebelum membaca isi.
3. Tutup BUG-3 (snapshot/tukar sebelum wipe) sebelum rilis — ini satu-satunya jalur yang bisa
   menghapus seluruh data user tanpa berkas yang salah.
4. BUG-2 & BUG-4: cek silang metadata (`dataCount`, `schemaVersion` per record) saat validasi.
5. BUG-5: jadikan hasil `validateBackupText` satu-satunya jalan masuk `applyBackupImport`
   (branded type / parameter wajib).
6. Perjelas PRD F10 soal mode gabung (LWW vs "update by ID") supaya test dan dokumen tidak berbeda.

---

# Putaran 2 — verifikasi perbaikan (2026-10-23)

Reviewer: Fajar (QA) · Tree: `f8a9a5c` + working tree campuran (T12 + task lain yang tidak disentuh QA)
· Task: #26 `review` (status TIDAK diubah oleh QA; keputusan akhir dipegang orchestrator/user).
· Environment: Node `v24.18.0`, `vitest 5.0.3`, Linux.

**Verdict: LULUS (dengan catatan).** Semua AC T12 terpenuhi dan keenam perilaku kunci yang diminta
terbukti dengan test. Tidak ada temuan blocking. Satu bug baru **Low** (race pemilihan berkas) dan
beberapa risiko sisa dicatat di §Sisa risiko putaran 2 — tidak satu pun melanggar acceptance criteria.

Rules dibaca (sama seperti putaran 1): root `CLAUDE.md`,
`.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`,
`apps/web/AGENTS.md` → `apps/web/CLAUDE.md` → `apps/web/.claude/rules/{security,performance,code-quality}.md`.
Requirement: `docs/PRD.md` F10 (baris 414–456), AC T12 (baris 1097), DoD (baris 1120–1126).

Perubahan QA putaran ini **hanya file test + laporan**: 3 file test baru (10 test) + laporan ini.
Tidak ada kode produk yang diubah, tidak ada commit, tidak ada perubahan status Ergonio.

## 1. Yang diperbaiki developer & cara QA membuktikannya

| # putaran 1 | Perbaikan | Bukti (kode) | Bukti (test) | Hasil |
|---|---|---|---|---|
| BUG-1 export bisa ditolak import sendiri | `BackupExportLimitError` + batas yang SAMA untuk export & import; batas record ditegakkan saat menyusun dokumen, batas byte saat serialisasi | `backup.ts:44-48` (satu sumber konstanta), `backup.ts:63-81` (error + `kind/actual/limit`), `backup.ts:156-186`, `backup.ts:220-237`; UI memetakan apa adanya `utils/io/export.ts:106-111` | `io.regression.test.ts:172-240`; `utils/io/export.test.ts:102-129`; `BackupExportCard.test.ts:77-91`; **QA**: `utils/io/io.round2.qa.test.ts:115` (rantai penuh export→import identik) | **FIXED** |
| BUG-2 `dataCount` tidak dicek silang | Ditolak `DATA_COUNT_MISMATCH` (dicek terakhir, setelah masalah yang lebih spesifik) + diulang di fase tulis | `import.ts:139-149` (`findDataCountIssues`), `import.ts:356-367`, `import.ts:191-199` (invarian apply) | `io.regression.test.ts:242-279`; `BackupImportCard.test.ts:178-193`; `preview.test.ts:48-55`; **QA**: `components/features/io/io.round2.qa.test.ts:199-227` | **FIXED** |
| BUG-3 `replace-all` menghapus sebelum menulis | Staging: invarian → tentukan record → **selesaikan `seal`/index/outbox semua record** → baru `wipe()` → tulis per batch | `import.ts:433-522` (khususnya `478-496`) | `io.regression.test.ts:281-334` (seal gagal di panggilan ke-3: data lama utuh, outbox tidak berubah) | **FIXED (dengan risiko sisa)** |
| BUG-4 `schemaVersion` per record diabaikan | Record dengan versi > aplikasi → `VERSION_TOO_NEW`; record > versi berkas → `SCHEMA_MISMATCH`; diulang di fase tulis | `import.ts:151-162`, `import.ts:291-311`, `import.ts:191-199` | `io.regression.test.ts:336-370`; `io.regression.test.ts:415-426` | **FIXED** |
| BUG-5 `applyBackupImport` menerima dokumen mentah | `assertImportableDocument` mem-parse ulang schema `strict()` + invarian versi/duplikat/payload/`dataCount` sebelum menyentuh storage | `import.ts:178-202`, dipanggil `import.ts:454` | `io.regression.test.ts:372-438`; `utils/io/import.test.ts:145-164` | **FIXED** |
| GAP-1 F10 belum ada UI | Route `/app/import-export` + 2 kartu; entri nav desktop (menu akun) & HP (menu sheet); peringatan plaintext selalu tampil; `File.size` dicek sebelum baca; preview dari `dataCount`; mode gabung/ganti + konfirmasi; pemetaan error | `pages/app/import-export.vue:14,53-54`; `components/features/io/*.vue`; `composables/useBackup{Export,Import}.ts`; `utils/io/{export,import,preview,read-file}.ts`; `utils/features.ts:94-101`; `ShellUserMenu.vue:20-28`; `ShellMenuSheet.vue:4-13` | `pages/app/import-export.test.ts`; `ShellNav.test.ts`; `BackupExportCard.test.ts`; `BackupImportCard.test.ts`; `utils/io/*.test.ts`; **QA**: `io.round2.qa.test.ts` (UI) & `useBackupImport.round2.qa.test.ts` | **FIXED** |

Detail test kunci yang diminta (semua PASS):

- **(a) peringatan plaintext sebelum export** — `BackupExportCard.vue:36` merender
  `BACKUP_PLAINTEXT_WARNING` di `role="note"` tanpa interaksi, dan berada **sebelum** tombol unduh di DOM
  (`io.round2.qa.test.ts:152`). Teks identik dengan PRD F10 (dibandingkan di
  `io.roundtrip.qa.test.ts:672`, test QA putaran 1 yang tidak diubah).
- **(b) berkas > batas ditolak tanpa dibaca** — `read-file.ts:21-26` memakai `File.size`;
  `File.text()` tidak dipanggil (`read-file.test.ts:23-32`; `io.round2.qa.test.ts:184`).
- **(c) preview memakai `dataCount`, `DATA_COUNT_MISMATCH` tertangkap** —
  `useBackupImport.ts:91-104` membangun preview dari `validation.document.dataCount` (bukan `JSON.parse`
  kedua); berkas dengan angka tidak konsisten tidak menampilkan preview dan menampilkan hint
  (`io.round2.qa.test.ts:199-227`).
- **(d) ganti semua butuh konfirmasi** — tombol mati (`BackupImportCard.vue:92-105`) **dan**
  `applyImport` menolak jalur programatik (`useBackupImport.ts:56-65,107-108`), dibuktikan dengan
  memanggil composable langsung (`useBackupImport.round2.qa.test.ts:76`).
- **(e) export bisa diimpor kembali** — rantai shell penuh
  `createBackupFile → berkas → validateBackupText → applyBackupDocument → repository` menghasilkan data
  identik termasuk tombstone dan 3 baris outbox (`utils/io/io.round2.qa.test.ts:115`); import ulang
  berkas yang sama di mode gabung tidak menggandakan (`:167`).
- **(f) `BackupExportLimitError` tampil apa adanya** — `describeExportFailure` mengembalikan
  `error.message` tanpa dibungkus (`utils/io/export.ts:106-111`); `role="alert"` berisi pesan itu persis,
  dan tidak ada unduhan (`io.round2.qa.test.ts:169`).

## 2. Acceptance criteria (putaran 2)

| # | Acceptance criteria | Hasil | Bukti |
|---|---|---|---|
| 1 | Round-trip export→wipe→import **identik** | **PASS** | Core: `io.roundtrip.qa.test.ts:309` (6 tipe + tombstone, `toEqual` isi record, test lama tetap utuh). Shell: `utils/io/io.round2.qa.test.ts:115` — export dari storage berisi todo+tombstone+prefs, import ke storage kosong, `after` `toEqual` `before`, `outboxRows=3`; re-export tidak diperlukan karena dokumen dibandingkan per record. |
| 2 | File invalid / versi asing ditolak **tanpa mengubah data** | **PASS** | `io.roundtrip.qa.test.ts:519-602` (JSON rusak, format asing, versi format, versi skema lebih baru, berkas "terenkripsi", `dataCount` negatif, field asing, satu payload rusak) — tiap test membandingkan sidik jari storage sebelum/sesudah. Fase validasi tetap murni: `import.ts:204-370` tanpa storage/jam/random; penulisan baru dimulai `import.ts:500`. |
| 3 | Ada batas ukuran file | **PASS** | Import: `import.ts:216-223` (byte, sebelum parse), `import.ts:283-289` (record). Export: `backup.ts:160-163,224-234` dengan konstanta yang sama. Batas default 32 MB/50.000 dipakai walau opsi tidak dikirim (`io.regression.test.ts:224-239`; `io.roundtrip.qa.test.ts:642-652`); byte UTF-8, bukan karakter (`:755`). UI menolak dari `File.size` sebelum membaca (`read-file.ts:21`). |
| 4 | Peringatan "file tidak terenkripsi" **muncul sebelum export** | **PASS** | `BackupExportCard.vue:36` selalu tampil (bukan dialog setelah klik) dan mendahului tombol (`BackupExportCard.test.ts:62-75`; `io.round2.qa.test.ts:152`). Halaman benar-benar memuat kartunya (`pages/app/import-export.test.ts:16-25`) dan halaman bisa dicapai dari nav desktop + HP (`ShellNav.test.ts:24-44`). |
| 5 | Mode **gabung** tidak menghapus data lama; **ganti semua** menghapus lalu menulis | **PASS** | `io.roundtrip.qa.test.ts:401` (gabung: data di luar berkas tetap), `:433` (versi lokal lebih baru di-skip), `:462` (replace-all menghapus yang tidak ada di berkas). Urutan aman: `import.ts:478-496` (staging sebelum `wipe`). Shell: replace-all menulis 3 record ke storage kosong dan menghasilkan outbox (`io.round2.qa.test.ts:115`). Catatan deviasi lama tetap: gabung memakai LWW `decideMerge` (`import.ts:460-473`), bukan "berkas selalu menang" — PRD sebaiknya diperjelas. |
| 6 | Input divalidasi skema; tidak menulis sebelum valid; tidak ada render HTML dari isi berkas | **PASS** | Envelope `strict()` (`backup.ts:87-125`), payload per tipe (`import.ts:164-176,345-354`), invarian di fase tulis (`import.ts:178-202`). `grep -rn "innerHTML\|v-html"` di file baru T12 → 0; isi berkas hanya dipakai untuk angka ringkasan & nama berkas (interpolasi teks): `BackupImportCard.vue:71-88`. |

## 3. Bug baru

### BUG-R2-1 — Dua kali memilih berkas beruntun: preview/isi bisa berasal dari berkas **pertama** (Low, non-blocking)

**Langkah reproduksi** (dijalankan sebagai probe sementara, file lalu dihapus):

1. `const io = useBackupImport()`.
2. Buat dua berkas valid: `pertama.json` berisi 2 record, `kedua.json` berisi 1 record; `text()` berkas
   pertama ditahan (simulasi berkas besar/lambat dibaca).
3. `const p1 = io.selectFile(pertama)` lalu segera `const p2 = io.selectFile(kedua)`.
4. Lepas `kedua` lebih dulu, `await p2`; lalu lepas `pertama`, `await p1`.

**Actual** (output probe):

```
setelah berkas kedua: kedua.json 1
setelah berkas pertama selesai: kedua.json 2
```

**Expected:** berkas yang terakhir dipilih (`kedua`) yang dipakai — atau pembacaan berkas pertama
dibatalkan. Minimal nama berkas dan isi preview tidak boleh saling bertentangan.

**Dampak:** user salah pilih berkas lalu cepat memilih berkas lain; layar menampilkan nama berkas B
tetapi preview (dan import, termasuk mode "ganti semua") memakai isi berkas A.

**Bukti:** `apps/web/app/composables/useBackupImport.ts:75-105` — `fileName` ditulis sinkron, sedangkan
`document`/`preview` ditulis setelah `await readBackupFileText`/`validateBackupText`, tanpa token
permintaan/abort; `BackupImportCard.vue:42-51` mengosongkan `input.value` sehingga pemilihan ulang bisa
terjadi segera.

**Saran (dimas, ±5 baris):** nomor urut permintaan — `let requestId = 0`; di `selectFile`
`const mine = ++requestId`; setelah setiap `await`, `if (mine !== requestId) return` sebelum menulis
`error`/`document`/`preview`.

Tidak ada bug **blocking** lain. Perilaku yang diminta pada brief verifikasi (a–f) semuanya lulus.

## 4. Sisa risiko (diverifikasi; bukan bug baru & tidak melanggar AC)

| Risiko | Status dokumentasi | Penilaian QA |
|---|---|---|
| Kegagalan **tulis** setelah `wipe()` (kuota disk habis, tab ditutup) masih bisa meninggalkan data parsial | **Terdokumentasi** eksplisit di `import.ts:441-444`: `StorageAdapter` tidak punya operasi "ganti seluruh isi" atomik; jaminan penuh milik adapter platform | Tetap risiko rilis, bukan AC T12. Mitigasi yang disarankan: snapshot sementara / tukar tabel di adapter IndexedDB. |
| Memori saat export/import mendekati 32 MB | Sebagian: `export.ts:56-59` (dibaca per tipe, seluruh backup tetap di memori) & `read-file.ts:5-12` (bahaya baca berkas besar). **Belum** ada catatan bahwa staging `replace-all` kini menahan **semua** record tersegel sebelum `wipe()` (`import.ts:481-492`) — puncak memori naik ±1× ukuran backup dibanding versi lama | Perbaikan BUG-3 memang menukar memori dengan keamanan data — trade-off yang benar. Untuk HP kelas bawah, pertimbangkan streaming/pecah berkas atau batas export mobile lebih kecil. |
| Copy UI masih literal Indonesia di komponen/composable (`Export data`, pesan status, dll.) | **Tidak** terdokumentasi; hanya `feature.import-export.label` yang lewat i18n (`pages/app/import-export.vue:17,43`) | Non-blocking: locale yang ada baru `id`, dan rules tidak mewajibkan i18n untuk semua copy. Catat sebagai utang kerapian. |
| Berkas backup **kosong** ditolak UI | **Terdokumentasi** di `useBackupImport.ts:60-65` + teks `BackupImportCard.vue:88` | Disengaja & aman: di mode "ganti semua" berkas kosong akan menghapus data tanpa memasukkan apa pun; di mode gabung hanya no-op. |
| Mode gabung memakai LWW, PRD menulis "update yang ada (by ID)" | Belum diperbaiki (deviasi lama) | Tidak melanggar AC; perilaku lebih aman (edit lokal yang lebih baru tidak hilang). PRD perlu diperjelas. |
| Adapter **IndexedDB/SQLite nyata** belum diuji untuk `wipe()` + tulis | Tidak diklaim; test memakai adapter memori core | Celah test utama yang tersisa (lihat §Coverage). |
| PRD F10 UI menyebut **progress bar** saat import; UI hanya status "Mengimpor…" + tombol mati (`BackupImportCard.vue:103-105`) | Tidak terdokumentasi | Bukan AC T12 (AC hanya 4 butir), tapi bagian dari F10. Untuk berkas 50.000 record, indikator progres akan membantu. Rekomendasi task lanjutan, bukan blocker. |

## 5. Cek tiga pilar

| Pilar | Hasil | Bukti / catatan |
|---|---|---|
| **Keamanan** | **Lulus** | Berkas plaintext by design dan peringatannya tampil **sebelum** export (`BackupExportCard.vue:36`). Tidak ada data yang dikirim ke server; `downloadTextFile` memakai object URL lokal (`utils/download.ts`). Isi berkas tidak pernah dirender sebagai HTML: grep `innerHTML\|v-html` di seluruh file T12 = 0, hanya angka/nama berkas yang masuk DOM. Validasi `strict()` + invarian sebelum tulis. Sesi & bahan kunci tetap di variabel modul (`useLocalData`), bukan `useState` (security.md §2). Route `/app/**` sudah `ssr:false` + app-shell tanpa data user (`nuxt.config.ts:156-158,261-269`), jadi tidak ada payload SSR berisi PII. Tidak ada route server/secret baru. |
| **Performa** | **Lulus** | Diukur di mesin ini: `validateBackupText` 50.000 record (13,6 MB) = **138 ms**; `applyBackupImport` 5.000 record (adapter memori) = **19 ms**. Tidak ada query/jaringan baru; semua tambahan pemeriksaan O(n) linear (versi, duplikat, `dataCount`). Pagar `File.size` mencegah baca berkas raksasa (`read-file.ts:21`). Catatan: staging `replace-all` menahan seluruh record tersegel (lihat §4) dan revalidasi payload di fase tulis memang menggandakan satu pass validasi — trade-off defense-in-depth yang wajar. Tidak ada dependency baru. |
| **Kerapian** | **Lulus dengan catatan** | `tsc` core exit 0; `nuxt typecheck` web exit 0; `eslint --max-warnings 0` pada seluruh file T12 (core + web) bersih; tidak ada `any`/`@ts-ignore`/`console.*`/`eslint-disable` di file T12. Modul terpisah rapi (`backup`/`import`/`migrations`, `utils/io/*`, composable per aksi) dan komentar menjelaskan "kenapa" (mis. `import.ts:436-449`). Test ada untuk logika baru & tiap bug fix; tidak ada `.only`/`.skip`. Catatan: copy literal (i18n), `describeDataCount` di core hanya dipakai test (UI punya `backupPreviewRows` dengan label — duplikasi kecil), dan progress bar F10 belum ada. |

## 6. Scope

Diperiksa dengan `git status` + isi diff working tree (tree campuran beberapa task, jadi atribusi
berdasarkan isi file, bukan commit):

- **Perubahan T12 (yang direview):** `packages/core/src/io/{backup,import,index}.ts` +
  `io.regression.test.ts`; `apps/web/app/utils/io/*`, `components/features/io/*`,
  `composables/useBackup{Export,Import}.ts`, `pages/app/import-export.{vue,test.ts}`,
  `components/features/shell/ShellNav.test.ts` + entri nav di `ShellMenuSheet.vue`/`ShellUserMenu.vue`,
  `utils/features.{ts,test.ts}`. Tidak ada perubahan pada `apps/mobile`.
- **Bukan perubahan T12** (milik task lain yang berjalan bersamaan): `apps/web/server/**` (test
  SMTP/OTP T19), `packages/core/src/sync/{pull,push,status}.ts` (cursor/HLC/status T21),
  `apps/web/app/utils/{account,crypto}/**` & `components/features/account/**` (kripto/backup terenkripsi
  T20), `calendar`/`memo`/`schedule` (task UI lain). Bukti: `grep` simbol `backup`/`validateBackup`
  di `apps/web/server` & `packages/core/src/sync` → 0 referensi ke modul `io/`; diff file-file itu
  membahas topiknya masing-masing. QA tidak menyentuh file-file tersebut.
- **QA hanya menambah:** `apps/web/app/utils/io/io.round2.qa.test.ts`,
  `apps/web/app/components/features/io/io.round2.qa.test.ts`,
  `apps/web/app/composables/useBackupImport.round2.qa.test.ts`, dan laporan ini.

## 7. Test QA putaran 1 tidak diubah / dilemahkan

`packages/core/src/io/io.roundtrip.qa.test.ts` masih **826 baris / 24 test** (sama dengan laporan
putaran 1). File ini belum pernah di-commit (`??`), jadi `git diff` tidak punya baseline; sebagai
gantinya QA memverifikasi:

- nomor baris yang dikutip putaran 1 semuanya masih menunjuk test yang sama (mis. `:309` round-trip,
  `:401/:433/:462` mode import, `:519/:525/:539/:552/:565/:578/:590/:602` penolakan berkas,
  `:642/:652/:755` batas ukuran, `:672/:677` peringatan);
- 65 baris berisi assertion `toEqual/toBe/toHaveLength` masih ada, termasuk `expect(after).toBe(before)`
  pada sidik jari storage dan `expect(after).toEqual(before)` pada isi record;
- penanda `.only`/`.skip`/`it.todo` (pola `describe|it|test.()`) di test io core & web → **0**; satu-
  satunya kecocokan `.skip(` di repo adalah method Pomodoro di `usePomodoro.test.ts`, bukan penanda test;
- 24 test-nya masih hijau di run putaran 2 (bagian dari 62).

## 8. Perintah & hasil (putaran 2)

```bash
# 1. Core: io.test.ts (20) + io.regression.test.ts (18) + io.roundtrip.qa.test.ts (24)
pnpm --filter @improve-personal/core exec vitest run src/io
# → Test Files 3 passed (3) | Tests 62 passed (62) | Duration ~0.5 s

# 2. Web: test developer T12 (klaim 41) + 8 test QA baru yang jatuh di glob yang sama
pnpm --filter @improve-personal/web exec vitest run \
  app/utils/io app/components/features/io app/components/features/shell \
  app/pages/app/import-export.test.ts app/utils/features.test.ts app/layouts/dashboard.test.ts
# → Test Files 12 passed (12) | Tests 49 passed (49)
#    Tanpa 2 file QA baru di glob itu: 10 files / 41 tests (klaim developer cocok persis).

# 3. Test QA baru (independen dari test developer)
pnpm --filter @improve-personal/web exec vitest run \
  app/utils/io/io.round2.qa.test.ts \
  app/components/features/io/io.round2.qa.test.ts \
  app/composables/useBackupImport.round2.qa.test.ts
# → Test Files 3 passed (3) | Tests 10 passed (10)

# 4. Typecheck & lint
pnpm --filter @improve-personal/core exec tsc -p tsconfig.json          # exit 0
pnpm --filter @improve-personal/web exec nuxt typecheck                 # exit 0
pnpm --filter @improve-personal/core exec eslint src/io --max-warnings 0            # bersih
pnpm --filter @improve-personal/web exec eslint app/utils/io app/components/features/io \
  app/composables/useBackupExport.ts app/composables/useBackupImport.ts \
  app/pages/app/import-export.vue app/pages/app/import-export.test.ts \
  app/components/features/shell/ShellNav.test.ts app/components/features/shell/ShellUserMenu.vue \
  app/components/features/shell/ShellMenuSheet.vue app/utils/features.ts --max-warnings 0          # bersih

# 5. Probe performa & probe race (file sementara, dijalankan lalu dihapus)
#    validate 50.000 record / 13,6 MB → 138,1 ms (ok=true)
#    apply 5.000 record replace-all  → 18,8 ms (written=5000)
#    race selectFile                  → "kedua.json 1" lalu "kedua.json 2" (BUG-R2-1)
```

Tidak ada test yang dilemahkan, dihapus, diberi `.only`, atau di-`skip`.

## 9. Coverage & celah yang tersisa (putaran 2)

1. **Adapter IndexedDB/SQLite nyata** untuk jalur `replace-all` masih belum diuji — celah utama. Test
   shell baru memakai adapter memori core (kontraknya sama), tapi jendela `wipe()` → tulis di
   IndexedDB (transaksi terpisah) dan perilaku kuota belum terbukti. Rekomendasi: test integrasi
   `fake-indexeddb` untuk `applyBackupDocument({mode:'replace-all'})` + simulasi kegagalan tulis.
2. **Berkas mendekati batas (mis. 30 MB, 49.000 record)** belum jadi test permanen (mahal). Batas
   eksak & ASCII/UTF-8 sudah diuji; yang belum: round-trip satu berkas besar nyata.
3. **Migrasi versi nyata** belum ada (`SCHEMA_MIGRATIONS` kosong), jadi interaksi "dataCount vs
   migrasi yang mengubah jumlah record" belum bisa diuji — saat versi naik, tambahkan test round-trip
   lintas versi + pastikan `dataCount` dihitung ulang setelah migrasi.
4. **Playwright/E2E** untuk halaman ini belum ada. Yang terbukti baru level komponen/composable
   (`mountSuspended`). Alur unduhan berkas (Blob + anchor click) belum diuji di browser nyata —
   termasuk perilaku `URL.revokeObjectURL` segera setelah klik di Safari.
5. **BUG-R2-1** belum punya test regresi (karena fix belum ada). Setelah diperbaiki, tambahkan test
   dengan dua `File.text()` ber-deferred seperti probe di §3.
6. **Aksesibilitas**: label/`aria-live` sudah dipakai (`role="note"`, `role="status"`, `role="alert"`,
   `aria-describedby`), tapi belum diuji dengan axe/screen reader; belum ada verifikasi kontras dark mode
   untuk kartu baru.

## 10. Rekomendasi (urutan)

1. **Fix BUG-R2-1** (race `selectFile`) — perubahan kecil di `useBackupImport.ts`, plus test regresi.
2. Tambah test integrasi adapter IndexedDB untuk `replace-all` (risiko kehilangan data paling besar yang
   masih belum terbukti di platform nyata).
3. Dokumentasikan eksplisit biaya memori staging `replace-all` (`import.ts:481-492`), atau turunkan
   batas export untuk mobile bila perlu.
4. Pertimbangkan progress bar import (F10 UI) untuk berkas besar; status teks sekarang sudah benar tapi
   tanpa progres.
5. Rapikan copy i18n bertahap bila locale kedua ditambahkan; saat ini single-locale sehingga belum
   blocking.
6. Perjelas PRD F10 soal semantik mode gabung (LWW vs "update by ID") — deviasi yang masih ada.
