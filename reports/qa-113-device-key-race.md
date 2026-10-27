# QA report - #113 Kunci perangkat: race dua tab saat membuat master key pertama

## Verdict

**LULUS DENGAN CATATAN**

- Tier: T2
- Delta: `apps/web/app/utils/crypto/device-slot.ts`, `.../crypto/key-store.ts`, `.../storage/session.ts`, `.../crypto/device-slot.test.ts`, `.../storage/session.test.ts`, `.../composables/useDevicePairing.test.ts`
- Gate: `pnpm gate:delta --tier t2 --files <6 file di atas>` -> PASS (38s): prettier PASS, eslint PASS, vitest 108 files / 603 tests PASS, typecheck PASS.
- Regresi terdekat: `vitest run app/utils/account app/composables/useDevicePairing.test.ts app/composables/useKeyRecovery app/utils/storage app/utils/crypto` -> 29 files, 257 tests passed.
- Test adversarial baru (file baru, produk tidak disentuh): `apps/web/app/utils/storage/session.race.qa.test.ts` -> 7 passed, prettier + eslint `--max-warnings 0` bersih.

## Acceptance criteria

| AC | Hasil | Bukti |
| --- | --- | --- |
| 1. Cek-buat-simpan atomik lintas tab; satu kunci akhir, semua tab bisa buka data yang sama | pass | `session.test.ts:212` + QA 5 tab bersamaan (`session.race.qa.test.ts`): 1 `isFreshKey`, `dataKey` identik di 5 sesi, 5 record tulis-silang terbaca di sesi baru. Memakai Web Locks asli Node 24, bukan stub. |
| 2. Tab kalah memakai kunci pemenang; `isFreshKey` akurat | pass | Test yang sama: tepat 1 sesi `isFreshKey=true`; sesi reload `false`. `session.ts` `createOrAdoptMasterKey`. |
| 3. Slot terisi tidak bisa ditimpa (`DeviceSlotOccupiedError`) | pass | `device-slot.test.ts` (rejects.toBeInstanceOf) + QA slot terisi; dua `saveDeviceUnlock` paralel -> 1 fulfilled, 1 rejected, kunci tersimpan = milik pemenang. |
| 4. Tanpa `navigator.locks` (undefined/null): error jelas, tanpa fallback | pass | QA `it.each` undefined/null -> `/Web Locks API tidak tersedia/`, `keyStore.has('device')` tetap false. Juga via `openLocalDataSession`: tidak ada kunci tersimpan, kandidat nol. `device-slot.ts:85-90`. |
| 5. Test regresi sesi gagal di HEAD | pass | Salinan `git archive HEAD app/utils` ke dir sementara di `apps/web/app/` (sudah dihapus), test baru dijalankan terhadap kode HEAD: `session.test.ts` "dua tab" FAIL `expected [true,true] to have length 1 but got 2`; `device-slot.test.ts` "dua tab" FAIL `fulfilled length 2` (kunci tertimpa); test "menolak menimpa" FAIL karena `DeviceSlotOccupiedError` belum ada. Pada working tree: PASS. Working tree produk tidak diubah. |
| 6. Penyimpangan: lock tidak menutupi `canCreateKey`/`hasStoredRecords`; nama lock global | pass (lihat analisis) | Lihat di bawah. |
| 7. Kandidat kalah di-`zeroKey`; tidak ada kunci polos bocor | pass | QA: semua kandidat (rekaman `createMasterKey`) all-zero setelah sesi; setelah error lock juga all-zero (`zeroKey` di `session.ts` catch sebelum rethrow). Spy `console.*` 0 panggilan di jalur ini. |
| 8. Tanpa `.only`/`.skip`/`console.log`/dead code | pass | grep di file delta + test: kosong. Tidak ada export/komentar mati di diff. |

### Analisis AC6

- Jaminan AC1 utuh: penentu pemenang adalah `saveDeviceUnlock` (cek ulang + `put` di bawah satu lock eksklusif), bukan `has()`/`canCreateKey` awal. Dua tab yang sama-sama lolos `canCreateKey` membuat kandidat, hanya satu tersimpan. Dibuktikan: tab lambat (`canCreateKey` ditahan) menunggu tab cepat selesai penuh dan menulis record; tab lambat lalu kalah (`isFreshKey=false`), `dataKey` sama, dan membaca record pemenang.
- Tidak ada celah data hilang: `openLocalDataSession` baru mengembalikan sesi (dan `writer`) setelah kunci final diketahui, jadi tidak ada record yang disegel dengan kandidat yang kalah. Kandidat kalah dibuang sebelum dipakai apa pun.
- Lock global: dua akun berbeda bersamaan selesai tanpa deadlock, kunci terpisah. Bagian terkunci hanya `has`+`put` IndexedDB (ms), dampak antar-akun diabaikan; trade-off tertulis di `device-slot.ts` (komentar `DEVICE_SLOT_LOCK_NAME`).

## Bug

Tidak ada bug blocking.

## Tiga pilar

- **Keamanan:** kunci polos tidak bocor ke log/state; kandidat kalah di-zero; slot tidak bisa ditimpa diam-diam; tidak ada fallback tanpa lock. Tidak ada secret/dependency baru.
- **Performa:** bagian terkunci hanya dua operasi IndexedDB; pembungkusan kunci dilakukan sebelum lock; `canCreateKey` (jaringan) sengaja di luar lock. Tidak diukur (AC tanpa angka).
- **Kerapian:** gate lint/typecheck PASS; tidak ada `.only/.skip/console.log`; komentar menjelaskan "kenapa". Coverage 80% tidak diukur (tidak dijalankan di T2).

## Sisa risiko / tidak diuji

- Catatan (Low, di luar AC, tidak menggagalkan): urutan `has('device')` -> `hasStoredRecords` tidak atomik. Tab yang kalah balapan dan baru mengecek `hasStoredRecords` setelah tab pemenang sudah menulis record bisa melempar `LocalKeyMissingError` (gagal buka, bukan data hilang; reload membuka normal). Tidak direproduksi karena jendela waktunya antar dua `await` tanpa titik suntik; usul: task terpisah ke `dimas` untuk menimbang cek ulang `has('device')` sebelum melempar.
- Real multi-tab browser (Playwright, dua page) tidak dijalankan: itu T3. Web Locks diuji dengan implementasi Node, bukan browser.
- Artefak QA: `reports/qa-113-device-key-race.md` ini dan `apps/web/app/utils/storage/session.race.qa.test.ts`. Tidak ada commit.
