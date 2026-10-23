# Laporan QA — T21 Sync engine (antrean, push/pull delta, konflik, tombstone)

Tanggal: 2026-10-22
Reviewer: Fajar (QA Engineer)
Task Ergonio: #35 `[T21] Sync engine: antrean, push/pull delta, konflik, tombstone` (project `personal-productivity`)
Lingkup uji: `packages/core/src/sync/**`, `packages/contracts/src/{sync,hlc}.ts`, `apps/web/server/services/sync.ts` + route sync, dan bukti enkripsi client (`apps/web/app/utils/crypto/provider.ts`).

> **Update Putaran 2 (2026-10-22): ketiga bug di bawah sudah diperbaiki developer dan diverifikasi ulang — verdict sekarang LULUS.** Isi Putaran 1 dipertahankan apa adanya sebagai riwayat; baca §Putaran 2 di akhir dokumen untuk bukti terbaru.

## Verdict (Putaran 1)

**GAGAL (blocking).**

Mesin sync sudah benar untuk jalur normal: dua perangkat konvergen, tombstone ikut, pull memakai cursor, LWW memakai HLC, dan DB server hanya menyimpan ciphertext. Tetapi ada **1 bug High** dan **2 bug Medium** yang bisa dibuktikan dengan test:

- **BUG-1 (High)** — HLC lokal tidak pernah menarik HLC hasil pull, sehingga edit yang dilakukan **setelah** pull bisa kalah dari versi lama perangkat lain yang jamnya lebih maju. Baris outbox dihapus sebagai `stale`, status berubah `synced`, dan dua perangkat berhenti sepakat **tanpa error**. Ini melanggar AC “konflik update-terakhir-menang” dan “hasil sama di dua sisi”.
- **BUG-2 (Medium)** — `pullDelta` berhenti saat halaman lebih pendek dari `limit`. Server memang boleh memotong halaman karena plafon byte (`SYNC_MAX_PULL_BYTES`), dan kontrak mewajibkan klien lanjut dari `nextCursor`. Akibatnya satu siklus pull tidak menghabiskan delta dan status sudah bilang `synced`.
- **BUG-3 (Medium)** — `pullDelta` menimpa status `error` (baris outbox `rejected`) menjadi `pending`, jadi kegagalan permanen tampil seperti antrean biasa dan tidak pernah selesai.

Status Ergonio **tidak saya ubah** (sesuai batas tugas); task tetap di `review` sampai keputusan pemilik alur diambil. Tidak ada kode produk yang diubah; satu-satunya tambahan adalah berkas test regresi.

## Ringkasan hasil perintah

| # | Perintah | Hasil |
|---|---|---|
| 1 | `pnpm --filter @improve-personal/core exec vitest run src/sync` | 4 file, **37 lulus + 3 expected-fail** (3 test reproduksi bug) |
| 2 | `pnpm --filter @improve-personal/web exec vitest run server/tests/sync.test.ts` | **19 test lulus** (Postgres nyata) |
| 3 | `pnpm --filter @improve-personal/contracts exec vitest run src/sync.test.ts src/hlc.test.ts` | **30 test lulus** |
| 4 | `pnpm --filter @improve-personal/web exec vitest run app/utils/crypto/provider.test.ts` | **8 test lulus** |
| 5 | `pnpm --filter @improve-personal/core typecheck` + `eslint src/sync/converge.qa.test.ts` | lulus, tanpa error |
| 6 | Versi tanpa `it.fails` dari test baru (bukti actual vs expected) | **3 test gagal** sesuai temuan (bukti di §Bug) |

`it.fails` dipakai mengikuti preseden laporan QA backend sebelumnya: assertion ditulis terhadap bunyi AC (bukan implementasi sekarang), suite tetap hijau selama bug belum diperbaiki, dan **begitu kode produk dibetulkan Vitest akan menandainya merah** (“expected test to fail”) supaya `it.fails` wajib diubah menjadi `it` — bukan assertion-nya yang dilonggarkan.

## Tabel AC

| AC | Status | Bukti |
|---|---|---|
| 1. Uji 2 perangkat: edit offline di keduanya → setelah online hasil sama di dua sisi | **PASS (skenario dasar) / FAIL (skenario edit setelah pull)** | Lulus: `packages/core/src/sync/engine.test.ts:285` “edit offline di dua sisi konvergen setelah online” + `:409` “edit bersamaan satu record: satu pemenang yang sama di dua sisi”. Gagal untuk jalur realistis edit-setelah-pull: `packages/core/src/sync/converge.qa.test.ts:217` (BUG-1) — A tetap `BBBBBBBB`, B `CCCCCCCC`, padahal status B `synced` |
| 2. Hapus ikut tersinkron (tombstone) | **PASS** | Core: `engine.test.ts:315` (tombstone diterapkan di B, outbox B tetap 0). Server: `apps/web/server/tests/sync.test.ts:304` (tombstone tersimpan `deleted=true` dan ikut pull). Payload `deleted:true` + `op:'delete'`: `packages/core/src/sync/outbox.ts:44` |
| 3. Pull hanya mengambil perubahan sejak cursor terakhir, berhalaman | **PASS (halaman normal) / FAIL (halaman pendek karena plafon byte)** | Lulus: `engine.test.ts:343` (5 record, `pageLimit:2` → 3 halaman, cursor `[0,2,4]`) + server `sync.test.ts:268` (delta per `server_seq`). Gagal: `converge.qa.test.ts:250` (BUG-2) — server memotong 2 record/halaman, klien berhenti di halaman 1 (`pages=1`, seharusnya 3) |
| 4. Isi DB server terbukti cuma ciphertext | **PASS** | Test: `sync.test.ts:157` (ciphertext yang dikirim identik dengan yang tersimpan, tidak didekripsi/diubah) + `sync.test.ts:463` (kolom `records` tidak punya `type/title/content/body/text/payload/plaintext/data`). Enkripsi client: `apps/web/app/utils/crypto/provider.test.ts:43` (“hasilnya ciphertext base64: tidak memuat plaintext”) dan `apps/web/app/utils/storage/record-codec.ts:60` (`sealRecord` sebelum simpan/kirim). Manual DB: `\d records` → kolom hanya `user_id, id, hlc, hlc_wall_ms, hlc_counter, hlc_device, deleted, blob bytea, server_seq, created_at, updated_at` |
| 5. Status sync (antrean/pending) terlihat dan konsisten | **FAIL** | Status tersedia dan dipakai: `packages/core/src/sync/status.ts:25`, `engine.test.ts:312` (`synced`), `:515`/`:522` (`error`), `:586-587` (`offline`), `:473` (`pending`). Tetapi: (a) BUG-3 — `pull.ts:177-178` menimpa `error` dari `push.ts:186` menjadi `pending`; (b) BUG-1/BUG-2 — status `synced` padahal masih ada versi yang belum sama / delta belum habis. Catatan: indikator UI belum ada dan memang milik T22 (PRD baris 1030), bukan blocker T21 |
| 6. Konflik update-terakhir-menang per record | **FAIL (sebagian)** | Lulus untuk HLC lebih besar: `engine.test.ts:409` (pemenang = penulisan belakangan), `:431` (jam dinding ngaco tidak menang), `hlc.test.ts:69` (tie-break `deviceId`). Gagal saat penulisan terakhir terjadi **setelah pull** dari perangkat berjam lebih maju: `converge.qa.test.ts:217` (BUG-1) |

## Bug

### BUG-1 — Edit setelah pull kalah dari versi lama; dua perangkat divergen permanen tanpa error (High)

**Reproduksi** (test: `packages/core/src/sync/converge.qa.test.ts:217`, nama “BUG-1: edit lokal SETELAH pull tetap menang walau jam perangkat lain lebih maju”):

1. Perangkat A (`devicez`) jamnya `START+60 s`; perangkat B (`devicea`) jamnya `START`. Selisih jam antar perangkat adalah hal normal.
2. A menulis record `r1` lalu sync. HLC A = `1700000060000-0-devicez`.
3. B pull → menerima `r1` (versi A).
4. B mengedit `r1` **sesudah** pull (ini update terakhir). HLC B = `1700000000000-0-devicea`, lebih kecil karena B tidak pernah `observe` HLC A.
5. B sync (push lalu pull), A sync.
6. Hasil: B menampilkan `CCCCCCCC` (editnya), A dan server tetap `BBBBBBBB` (versi lama). B melaporkan status `synced`, outbox kosong, tidak ada indikator error. Kalau B nanti melakukan full pull (cursor reset), editnya akan tertimpa — data user hilang tanpa peringatan.

**Expected:** update terakhir (edit B) menang di kedua sisi; atau minimal terdeteksi sebagai konflik dan tidak dilaporkan `synced`.
**Actual:** `stale`, baris outbox dihapus, lokal dan server berbeda permanen.

Bukti output (test yang sama tanpa `it.fails`):

```
AssertionError: expected { Object (hlc, deleted, ...) } to deeply equal { Object (hlc, deleted, ...) }
- Expected
+ Received
  {
-   "blob": "CCCCCCCC",
+   "blob": "BBBBBBBB",
    "deleted": false,
-   "hlc": "1700000000000-0-devicea",
+   "hlc": "1700000060000-0-devicez",
  }
```

**Akar masalah (kode):**
- `packages/core/src/sync/hlc.ts:43` menyediakan `observe()` justru untuk “menarik waktu dari HLC perangkat lain (dari pull …)”.
- `packages/core/src/sync/pull.ts:77-181` (`pullDelta`) tidak pernah memanggil `observe`, tidak menerima `HlcGenerator`, dan tidak mengembalikan HLC tertinggi hasil pull. Tidak ada pemanggil `observe` di seluruh repo selain test (`grep -rn "observe("` → hanya `hlc.test.ts`).
- `packages/core/src/sync/push.ts:177-183` menganggap `stale` sebagai selesai dan membuang baris outbox; versi server tidak diambil kembali, sehingga divergensi tidak pernah terkoreksi.

**Severity:** High (divergensi senyap + potensi kehilangan edit user).
**Saran perbaikan (bukan dikerjakan QA):** tambahkan `hlc`/callback ke `PullDeltaInput` dan panggil `hlc.observe(record.hlc)` untuk tiap record yang diterapkan (termasuk saat `skipped`, karena HLC server tetap perlu diadopsi), atau kembalikan `maxHlc` dan wajibkan shell memanggil `observe`. Setelah API berubah, test ini perlu diubah mengoper generator HLC.

### BUG-2 — Pull berhenti di halaman pendek karena plafon byte (Medium)

**Reproduksi** (`converge.qa.test.ts:250`):

1. Perangkat A menulis 5 record lalu sync.
2. Server membatasi halaman 2 record walau klien minta `limit=5` — persis perilaku `takeWithinByteBudget` saat total ciphertext melewati `SYNC_MAX_PULL_BYTES` (`apps/web/server/services/sync.ts:249-262`).
3. B memanggil `pullDelta({ pageLimit: 5 })`.
4. Expected: 3 halaman, 5 record diterapkan, cursor di `serverSeq` record ke-5.
5. Actual: `pages=1` (berhenti setelah 2 record), cursor di record ke-2, status `synced`.

Output:

```
AssertionError: expected 1 to be 3
- Expected 3
+ Received 1
```

**Akar masalah (kode):** `packages/core/src/sync/pull.ts:174` — `if (records.length < limit) break`. Kontrak menegaskan halaman pendek **bukan** tanda selesai; selesai hanya kalau `nextCursor` sama dengan cursor yang dikirim (`packages/contracts/src/sync.ts:234-241`). Server sudah menguji perilaku pemotongan ini (`apps/web/server/tests/sync.test.ts:395`, “halaman dipotong supaya total byte tidak pernah melewati plafon, dan tidak ada record terlewat”), tetapi klien belum mengikuti kontraknya.

**Severity:** Medium (tidak salah data, tetapi sync tidak tuntas dalam satu siklus; status `synced` menyesatkan dan sisa data baru ditarik pada siklus berikutnya).
**Saran perbaikan:** hapus break berbasis panjang array; lanjutkan selama halaman tidak kosong dan `nextCursor` maju (berhenti pada halaman kosong atau `nextCursor <= cursor`).

### BUG-3 — Status `error` ditimpa `pending` oleh pull; kegagalan permanen tak terlihat (Medium)

**Reproduksi** (`converge.qa.test.ts:272`):

1. Server menolak permanen satu record (`rejected`).
2. `pushOutbox` menyimpan baris outbox dengan `attempts=1`, `lastError='REJECTED'`, dan menulis status `error` (`push.ts:186`).
3. Siklus sync berikutnya selalu push lalu pull. `pullDelta` melihat outbox masih berisi baris rejected, lalu menulis status `pending` (`pull.ts:177-178`).
4. Expected: status tetap `error` sampai baris rejected dibereskan (prioritas `status.ts:25-30`: `offline > error > pending > synced`).
5. Actual: `pulled.status === 'pending'` dan `sync_state.status === 'pending'`.

Output:

```
AssertionError: expected 'pending' to be 'error'
Expected: "error"
Received: "pending"
```

**Severity:** Medium (user melihat “menunggu” selamanya, padahal record tidak akan pernah terkirim tanpa tindakan).
**Saran perbaikan:** satu sumber derivasi status — jangan biarkan `pull` menulis `pending` jika ada baris outbox ber-`lastError`/`attempts>0`; atau simpan status `error` sampai outbox dibersihkan. Tambahkan pembaca `hasError` di engine agar UI tidak perlu menebak.

## Test plan & apa yang diuji

| Level | Berkas | Fokus |
|---|---|---|
| Unit/engine core (tanpa jaringan & tanpa timer) | `packages/core/src/sync/engine.test.ts`, `hlc.test.ts`, `schedule.test.ts` | Dua perangkat konvergen, tombstone, delta + pagination, `409 SYNC_RESET_REQUIRED`, LWW/HLC, batch push, status, offline, jadwal sync |
| Regresi QA (baru) | `packages/core/src/sync/converge.qa.test.ts` | 3 reproduksi bug di atas, memakai `StorageAdapter` memori + server palsu yang memvalidasi `syncPushInputSchema` |
| Service + Postgres nyata | `apps/web/server/tests/sync.test.ts` | LWW server, `stale`, `server_seq` baru saat menang lagi, ciphertext, tombstone, delta, 409, plafon byte, skema DB tanpa plaintext, isolasi antar user |
| Kontrak | `packages/contracts/src/sync.test.ts`, `hlc.test.ts` | Batas batch/halaman, urutan HLC, banding tuple HLC, validasi base64/ukuran |
| Enkripsi client | `apps/web/app/utils/crypto/provider.test.ts` | Seal/open XChaCha20-Poly1305, ciphertext tidak memuat plaintext, nonce acak, AAD `recordId` |

**Tidak diuji / di luar lingkup:** wiring UI (belum ada; T22), adapter IndexedDB/SQLite nyata (kontrak adapter terpisah), multi-tab `navigator.locks`, mobile, dan uji beban jaringan. Tidak ada environment produksi yang disentuh; DB yang dipakai adalah `improve_personal_test` di container lokal.

## Cek tiga pilar (yang relevan dengan T21)

- **Keamanan — PASS dengan catatan.** Server hanya menyimpan `blob bytea` + metadata minimal; tidak ada kolom plaintext (`sync.test.ts:463`), blob tidak diubah server (`:157`), ada batas 1 MB/record dan 4 MiB/halaman (`packages/contracts/src/sync.ts`), serta isolasi `user_id` diuji (`sync.test.ts:243`, `:322`). Catatan: `hlc_device` tetap metadata plaintext (sesuai desain), dan test ciphertext server memakai blob contoh — jaminan “tidak terbaca” berasal dari test enkripsi client (`provider.test.ts:43`), bukan dari server test itu sendiri.
- **Performa — PASS dengan catatan.** Push dibatasi `SYNC_MAX_BATCH` (500) dan dipecah (`engine.test.ts:462`), pull dibatasi jumlah + byte di server (`sync.test.ts:372-459`), dan loop halaman punya pagar `SYNC_PULL_MAX_PAGES_DEFAULT`. BUG-2 membuat pull berhenti terlalu cepat (bukan regresi performa, tetapi menambah siklus/round-trip dan menunda konvergensi).
- **Kerapian — PASS dengan catatan.** Modul kecil, terdokumentasi, tipe ketat, `typecheck`/`eslint` hijau, dan test menguji perilaku. Catatan: penulisan status tersebar di `push.ts` dan `pull.ts` dengan aturan berbeda — sumber BUG-3; sebaiknya disatukan lewat `deriveSyncStatus`.

## Coverage & celah yang tersisa

- Belum ada test yang mengaitkan `hlc.observe` dengan hasil pull (justru celah yang melahirkan BUG-1).
- Belum ada test integrasi core ↔ server nyata untuk halaman yang dipotong plafon byte (BUG-2 hanya terlihat saat dua sisi digabung).
- Belum ada test status gabungan `push` + `pull` dalam satu siklus saat ada baris `rejected` (BUG-3).
- Belum ada indikator status di UI (T22), belum ada pengujian HLC setelah app restart, dan adapter platform (IndexedDB/SQLite) belum menjalankan skenario dua perangkat ini.
- Test baru memakai `it.fails`; setelah ketiga bug diperbaiki, ubah menjadi `it` dan pertahankan assertion yang sama.

## Berkas yang ditambahkan

- `packages/core/src/sync/converge.qa.test.ts` — 3 test regresi untuk BUG-1/2/3 (hanya test, tidak menyentuh kode produk).
- `reports/qa-t21-sync-engine.md` — laporan ini.

Tidak ada commit, tidak ada perubahan status Ergonio, tidak ada perubahan pada `apps/web/app/**`.

---

# Putaran 2 — QA ulang setelah perbaikan developer

Tanggal: 2026-10-22 (ulang)
Reviewer: Fajar (QA Engineer)
Task Ergonio: #35 `[T21] Sync engine` — status `review`, tidak diubah oleh QA (transisi status dilakukan pemilik alur).
Objek perbaikan: `packages/core/src/sync/{pull,push,status}.ts` + `packages/core/src/sync/engine.test.ts`; berkas test QA `converge.qa.test.ts` diubah dari `it.fails` → `it` (assertion tetap).

## Verdict Putaran 2

**LULUS.**

Ketiga bug Putaran 1 tertutup, dan saya membuktikannya dua arah: test QA **gagal** pada kode pra-perbaikan (`HEAD`) dan **lulus** pada kode sekarang. Assertion test QA tidak dilonggarkan — output kegagalan pada kode lama identik dengan yang dilaporkan di Putaran 1 (`CCCCCCCC` vs `BBBBBBBB`, `expected 1 to be 3`, `'pending'` vs `'error'`).

Tidak ada bug blocking. Dua temuan Low (non-blocking) dan beberapa sisa risiko dicatat di §Temuan Putaran 2 dan §Sisa risiko.

## Ringkasan hasil perintah (Putaran 2)

| # | Perintah | Hasil |
|---|---|---|
| 1 | `pnpm --filter @improve-personal/core exec vitest run src/sync` | 4 file, **43 test lulus** (termasuk 3 test yang dulu `it.fails` + 2 test regresi tambahan QA) |
| 2 | `pnpm --filter @improve-personal/contracts exec vitest run src/sync.test.ts src/hlc.test.ts` | 2 file, **30 test lulus** |
| 3 | `pnpm --filter @improve-personal/web exec vitest run server/tests/sync.test.ts` | 1 file, **19 test lulus** — **Postgres nyata** (`local-postgres` 5432 hidup, `pg_isready` tidak terpasang tapi container `Up 4 days`, test membuat/menghapus data lewat Drizzle) |
| 4 | `pnpm --filter @improve-personal/core test` (regresi paket penuh) | 12 file, **196 test lulus** |
| 5 | `pnpm --filter @improve-personal/core typecheck` + `eslint src/sync --max-warnings 0` | lulus, tanpa error/warning |
| 6 | Uji diskriminasi test (kode `HEAD` vs kode sekarang) di salinan `/tmp/qa-t21-mut` | kode lama: **3/3 test QA gagal persis seperti Putaran 1**; kode sekarang: **3/3 lulus** |
| 7 | Uji status pada kode lama (`status.ts` versi `HEAD`) di salinan yang sama | **2 test gagal** (`'pending'` vs `'error'`), membuktikan test regresi baru benar-benar menjaga perbaikan BUG-3 |

Catatan metode #6–#7: saya **tidak** menyentuh kode produk di repo. Saya menyalin `packages/core/src` ke `/tmp/qa-t21-mut`, menaruh versi `HEAD` dari file produk di salinan itu, lalu menjalankan test QA di sana. Ini juga cara saya memastikan perbaikan bukan sekadar "test disesuaikan": dengan kode lama, assertion yang sama tetap merah.

## Verifikasi per AC

| AC | Status | Bukti |
|---|---|---|
| 1. Dua perangkat, edit offline → konvergen setelah online | **PASS** | `converge.qa.test.ts:222` (skenario BUG-1: A jam +60 s, B pull, B edit setelah pull, sinkron dua arah → `versionOf(A) == versionOf(B)`, status B `synced`) dan `engine.test.ts:285`, `:409`. Kode lama: test ini gagal dengan selisih versi yang sama seperti Putaran 1. Mekanisme: `pull.ts:149` (`hlc.observe` untuk **setiap** record di halaman, sebelum merge, termasuk yang `skipped`), `push.ts:196` (`observe(serverHlc)` saat jawaban `stale`), plus test baru `engine.test.ts:439` (“jawaban stale mengadopsi serverHlc”) |
| 2. Hapus ikut tersinkron (tombstone) | **PASS** | `engine.test.ts:315` (tombstone diterapkan di B, outbox B tetap 0 — lulus di paket penuh 196 test) + `apps/web/server/tests/sync.test.ts:304` (`deleted=true` tersimpan dan ikut pull). Jalur tulis tombstone tidak berubah di diff |
| 3. Pull hanya sejak cursor, berhalaman | **PASS** | `converge.qa.test.ts:252` → `pages=3`, `applied=5`, `cursor = serverSeq` record ke-5, 5 record ada di perangkat (sebelumnya `pages=1`). `engine.test.ts:356` sekarang menuntut urutan cursor `[0,2,4,5,5]`, artinya halaman pendek **tidak** mengakhiri pull dan pull baru selesai pada halaman kosong. Pagar anti-loop diuji baru: `converge.qa.test.ts:289` (server tidak memajukan `nextCursor` → berhenti setelah 1 permintaan) |
| 4. Isi DB server hanya ciphertext | **PASS** | Server sync test lulus penuh: `sync.test.ts:157` (blob tersimpan identik, tidak diubah server) dan `sync.test.ts:463` (kolom `records` tanpa `type/title/content/body/text/payload/plaintext/data`). `git diff` untuk `apps/web/server/**` **kosong** pada perbaikan ini, jadi bukti Putaran 1 tetap berlaku |
| 5. Status sync (antrean/pending) terlihat & konsisten | **PASS** | `pull.ts:201` sekarang memakai satu sumber derivasi: `readSyncStatus` (`status.ts:33-50`), yang mendeteksi `lastError` dari **seluruh** isi outbox (`status.ts:59-64`). Bukti: `converge.qa.test.ts:323` (BUG-3: status tetap `error`, `lastError='REJECTED'`), regresi baru `converge.qa.test.ts:271` (baris gagal di urutan **belakang** tetap terdeteksi → `error`), `engine.test.ts:515`/`:522`. Kode lama: dua test ini gagal `'pending'` vs `'error'` |
| 6. Konflik update-terakhir-menang (LWW/HLC) | **PASS** | `converge.qa.test.ts:222` (edit terakhir setelah pull menang; sebelumnya kalah), `engine.test.ts:409` (pemenang penulisan belakangan), `:439` (stale → HLC server diadopsi, tulisan berikutnya menang — tanpa perbaikan, B kalah berulang selamanya), `:431` (jam ngaco tidak menang), `hlc.test.ts:69` (tie-break `deviceId`) |

## Pemeriksaan assertion test QA (tidak dilonggarkan)

- `converge.qa.test.ts` sekarang berisi 5 test: 3 test BUG-1/2/3 (assertion sama seperti Putaran 1) + 2 test `REGRESI:` tambahan dari QA. `it.fails` sudah tidak ada; **tidak ada** `it.only`, `.skip`, atau test yang di-comment di `packages/core/src/sync/**`, `apps/web/server/tests/sync.test.ts`, `packages/contracts/src/{sync,hlc}.test.ts`.
- Bukti objektif: menjalankan berkas yang sama terhadap kode `HEAD` menghasilkan tiga kegagalan dengan nilai expected/actual yang **identik** dengan laporan Putaran 1 (`blob CCCC…` vs `BBBB…`, `hlc 1700000000000-0-devicea` vs `1700000060000-0-devicez`, `expected 1 to be 3`, `'pending'` vs `'error'`). Kalau ada assertion yang dilonggarkan, kode lama tidak akan gagal dengan nilai yang sama.
- Perubahan `engine.test.ts` hanya: helper `push`/`pull` kini mengoper `hlc` (API baru wajib), dua ekspektasi urutan cursor disesuaikan ke perilaku kontrak yang benar (`[0,2,4,5,5]`), dan satu test baru adopsi `serverHlc`. Tidak ada assertion yang dihapus atau dilemahkan; justru bertambah ketat (satu probe halaman kosong kini ikut diuji).

## Cek regresi yang diminta

- **Tombstone** — PASS: `engine.test.ts:315`, `sync.test.ts:304`; diff tidak menyentuh `merge.ts`/`outbox.ts`.
- **Delta cursor berhalaman** — PASS: `engine.test.ts:356` + `converge.qa.test.ts:252`; termination sekarang mengikuti kontrak (`pull.ts:187` berhenti kalau `nextCursor` tidak maju, `pull.ts:144` berhenti di halaman kosong), bukan panjang array.
- **Ciphertext DB** — PASS: server test lulus 19/19 di Postgres nyata, kode server tidak berubah.
- **Status error tidak tertimpa `pending`** — PASS untuk jalur siklus normal (push → pull): `pull.ts:201` + `status.ts:48/59-64`, dibuktikan `converge.qa.test.ts:323` dan `:271`. Sisa celah sempit di jalur `push` murni → TEMUAN-2-1.
- **Tidak ada perubahan di luar scope yang melemahkan AC** — PASS: diff perbaikan hanya `packages/core/src/sync/{pull,push,status}.ts` + `engine.test.ts` (+ berkas test QA). `packages/contracts/**`, `apps/web/server/**`, dan `apps/web/app/**` tidak berubah pada perbaikan ini. Berkas kotor lain di working tree (`apps/web/app/utils/account/*`, `crypto/recovery.ts`, `server/tests/{env,otp}.test.ts`, `scripts/`, `.husky/`) berasal dari task lain (T19/T20) dan tidak menyentuh jalur sync.

## Temuan Putaran 2

### TEMUAN-2-1 — `pushOutbox` masih bisa menurunkan status `error` → `pending` (Low, non-blocking)

- **Lokasi:** `packages/core/src/sync/push.ts:203` dan `:216`.
- **Reproduksi:** 3 baris outbox; baris ke-3 ditandai gagal (`lastError='REJECTED'`); `pushOutbox({ maxBatch: 1 })` hanya mengirim baris pertama (sukses).
- **Expected:** status tetap `error` (prioritas `offline > error > pending > synced`, `status.ts:25-30`).
- **Actual:** `pushed.status='pending'`, `sync_state.status='pending'`, padahal `readSyncStatus({ online: true })` mengembalikan `error`.
- **Dampak:** hanya jalur push murni (tanpa pull setelahnya) dan hanya kalau baris gagal berada di luar batch saat ini (default `SYNC_MAX_BATCH=500`, jadi butuh antrean besar). Siklus standar push → pull langsung mengoreksi lewat `pull.ts:201`. Tidak ada kehilangan data dan tidak memblokir AC.
- **Saran:** pakai `readSyncStatus` juga di akhir `pushOutbox` supaya benar-benar satu sumber derivasi (komentar `pull.ts:199-200` sudah menyatakan niat ini).

### TEMUAN-2-2 — Pull yang berhenti karena pagar `maxPages` tetap melaporkan `synced` (Low, non-blocking)

- **Lokasi:** `packages/core/src/sync/pull.ts:115` (loop) dan `:201` (status akhir).
- **Reproduksi:** 5 record di server, `pullDelta({ pageLimit: 2, maxPages: 2 })`.
- **Expected (idealnya):** status tidak `synced` selama delta belum habis.
- **Actual:** `pages=2`, `applied=4`, `cursor=4`, `status='synced'` — 1 record belum ditarik, tetapi cursor tersimpan di 4 sehingga siklus berikutnya melanjutkan (tidak ada data hilang).
- **Dampak:** hanya pada volume ekstrem (pagar default 100 halaman × limit default 200 ≈ 20.000 record per siklus) atau bila shell memasang `maxPages` kecil. Ini perilaku pagar yang sudah ada sebelumnya, bukan regresi perbaikan ini, dan AC “pull sampai cursor terakhir” tetap terpenuhi untuk kasus normal (`converge.qa.test.ts:252`).
- **Saran:** saat loop keluar karena `pages >= maxPages`, kembalikan `pending`/flag `hasMore` agar badge UI tidak berbohong.

## Sisa risiko & celah test

- **Shell wajib mengoper instance `HlcGenerator` yang sama** dengan yang dipakai menulis record lokal saat T22 menyambungkan `pullDelta`/`pushOutbox`; `hlc` sekarang field wajib (type-level guard), tetapi tidak ada test yang menjaga “instance sama” di level wiring.
- Jalur `observe` untuk record `skipped` (`pull.ts:149`) tidak punya bukti perilaku yang bisa dibedakan: `skipped` berarti HLC lokal ≥ HLC remote, sehingga adopsinya bersifat defensif. Yang terbukti adalah `observe` untuk record yang diterapkan (BUG-1) dan untuk `serverHlc` saat `stale` (`engine.test.ts:439`).
- `observe` menerima HLC remote apa pun yang lolos kontrak (wall maksimum `MAX_SAFE_INTEGER`) sehingga perangkat bisa “terpin” ke wall jauh di masa depan; urutan LWW tetap konsisten dan `counter` tetap dijaga `HLC_MAX_COUNTER`, jadi ini risiko desain HLC, bukan data loss.
- Setiap siklus pull kini menambah satu permintaan probe halaman kosong (konsekuensi kontrak `packages/contracts/src/sync.ts:234-241`): +1 round-trip per siklus, tercatat di `engine.test.ts:371`.
- Belum ada test integrasi core ↔ server nyata yang menggabungkan pemotongan halaman karena `SYNC_MAX_PULL_BYTES` dengan klien hasil perbaikan (BUG-2 masih diuji dengan server palsu yang meniru pemotongan).
- Belum ada test HLC setelah app restart / generator baru, adapter IndexedDB/SQLite nyata, multi-tab, dan mobile — tetap di luar lingkup T21 (indikator UI = T22).

## Berkas yang diubah QA pada Putaran 2

- `packages/core/src/sync/converge.qa.test.ts` — tambah 2 test regresi (`:271` deteksi `lastError` di baris belakang antrean, `:289` pagar anti-loop `nextCursor`), plus penyesuaian komentar kepala berkas. Tidak ada assertion lama yang diubah.
- `reports/qa-t21-sync-engine.md` — bagian Putaran 2 ini.
- Tidak ada kode produk yang diubah, tidak ada `apps/web/app/**` yang disentuh, tidak ada commit, dan status Ergonio tidak diubah QA.

## Rules dibaca

`CLAUDE.md` (root), `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`; karena verifikasi menyentuh sisi web: `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`.
