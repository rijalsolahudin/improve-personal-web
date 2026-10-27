# QA report - #112 Sync server: cursor server_seq bisa melompati record saat push paralel

## Verdict

**LULUS DENGAN CATATAN**

- Tier: T2
- Delta: `apps/web/server/services/sync.ts`, `apps/web/server/tests/sync-concurrency.test.ts`
- QA menambah: `apps/web/server/tests/sync-concurrency.qa.test.ts` (4 test, file baru, tanpa mengubah kode produk)
- Gate: `pnpm gate:delta --tier t2 --files apps/web/server/services/sync.ts,apps/web/server/tests/sync-concurrency.test.ts` -> PASS (20s; prettier, eslint, typecheck PASS; 22 test pass)

## Acceptance criteria

| AC | Hasil | Bukti |
| --- | --- | --- |
| 1. Push per user diserialkan; tidak ada regresi LWW/batch/atomik | pass | `vitest run http.test.ts keys-account.test.ts sync.test.ts` -> 88 passed; test LWW paralel `sync-concurrency.test.ts:188`; atomik: `qa.test.ts` "batch gagal di tengah" (rollback total, 0 baris) |
| 2. Test membuktikan tidak ada record terlewat (kontrol negatif) | pass | Baris `pg_advisory_xact_lock` dicabut sementara -> `sync-concurrency.test.ts:153` gagal (`secondWaited` false, 1 failed / 2 passed). sync.ts dikembalikan dari salinan: sha256 `1fd8e29f...182a2b` sama sebelum/sesudah, `git diff --stat` tetap `37 insertions, 2 deletions` |
| 3. User lain tidak menunggu | pass | `sync-concurrency.test.ts:162`; `qa.test.ts` "lock user lain tidak memblokir" (lock `sync-push:alice` ditahan, push bob selesai < 400ms) |
| 4. Lock diambil sebelum FOR UPDATE/nextval; dilepas saat rollback | pass | `qa.test.ts` "push menunggu di advisory lock": selama lock ditahan, 0 baris dibuat dan backend menunggu lock `advisory` (pg_locks not granted). "batch gagal di tengah": record ke-2 id `bukan-uuid` melempar, push berikutnya tidak menggantung, tidak ada advisory lock tersisa |
| 5. Header sync.ts sesuai kenyataan | pass | `sync.ts:26-49,72-88` cocok dengan kode `sync.ts:95-104`: lock jadi statement pertama, namespace `sync-push`, pull tanpa lock |
| 6. Tanpa it.only/.skip/console.log/dead code | pass | `grep -nE "it\.only|\.skip|console\.|TODO"` pada sync.ts dan kedua file test -> kosong; eslint PASS |

Regresi terdekat: `pnpm gate:delta --tier t2 --files <sync.ts,maintenance.ts,sync.test.ts,qa.test.ts>` -> PASS (24s), lalu `vitest run http.test.ts keys-account.test.ts sync.test.ts` -> 3 file, 88 test pass (termasuk purge tombstone dan hapus akun).

## Bug

Tidak ada bug blocking.

## Celah yang dicek (jalur penulis lain)

- Alokasi `nextval('records_seq')` hanya ada di `sync.ts` (insert default `schema.ts:318`, update `sync.ts:202`), dua-duanya di dalam `pushRecords`. Tidak ada jalur lain yang mengalokasikan seq di luar lock.
- Penulis `records` lain hanya DELETE: `account.ts:99` (hapus akun) dan `maintenance.ts:97` (purge tombstone). Keduanya tidak mengalokasikan seq, jadi tidak membuat cursor melompat. Purge mengubah `purged_seq`, di luar lingkup #112.
- Nama lock `sync-push:<userId>` tidak bentrok dengan `devices:<userId>` (`device.ts:339`); terbukti oleh `qa.test.ts` "lock devices tidak memblokir push".

## Tiga pilar

- **Keamanan:** userId masuk ke kunci lock sebagai parameter SQL (`sql` template), bukan string yang disambung. Tidak ada log baru. Lock otomatis lepas saat commit/rollback.
- **Performa:** tidak ada perubahan jalur pull. Biaya: push perangkat dari akun yang sama jadi antre, dan ini sudah ditulis sebagai trade-off di header. Tidak diukur karena AC tidak menyebut angka.
- **Kerapian:** prettier, eslint, typecheck PASS. Tidak ada dead code atau magic string (namespace jadi konstanta `PUSH_LOCK_NAMESPACE`).

## Sisa risiko / tidak diuji

- Kontrol negatif hanya membuktikan kegagalan pada assertion `secondWaited` (`sync-concurrency.test.ts:153`). Test memang menjadikan "P2 menunggu" sebagai proksi untuk kondisi cursor melompat. Assertion `seen` (record terlewat) tidak sempat dicapai karena test berhenti lebih dulu. Ini proksi yang sah (P2 tidak menunggu = urutan commit bisa terbalik), jadi bukan blocking. Saran minor ke developer: pindahkan `expect(seen)` ke depan supaya kontrol negatif juga menunjukkan record terlewat.
- Tabrakan `hashtext` (32-bit) antar user tidak diuji; dampaknya hanya antre sementara, sesuai header.
- Test timing memakai `STILL_BLOCKED_MS` 400ms (bukti negatif); belum diulang berkali-kali untuk uji flaky. Run tunggal stabil.
- Multi-instance API dan load test tidak diuji (butuh lingkungan di luar scope T2).
