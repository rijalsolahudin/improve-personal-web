# QA report - #109 compaction tombstone lokal >90 hari

## Verdict

**GAGAL (blocking)** - AC 3 tidak terpenuhi: aksi "Bersihkan riwayat terhapus" **tidak muncul** di
Kartu Penyimpanan setelah halaman dimuat normal, karena `canCompact` bergantung pada variabel modul
non-reaktif. AC 1, 2, 4 lulus dengan bukti. Mesin purge-nya sendiri tidak punya jalur data-loss.

- Tier: T2
- Delta: `utils/storage/indexeddb.ts` (+test), `utils/storage/compaction.ts` (+test),
  `components/features/account/StorageCard.vue`, `i18n/locales/id.json`
- Gate developer: `gate:delta --tier t2` PASS (17 file / 112 test file / 651 test + typecheck) - tidak
  diulang. QA: 7 file -> **72 test PASS** (exit 0) + regresi akun/shell 12 file / 43 test PASS.

## Acceptance criteria

| AC | Hasil | Bukti |
| --- | --- | --- |
| 1. `purgeTombstones(cutoffMs)` hapus record+index hanya untuk tombstone < cutoff tanpa outbox pending | pass | `indexeddb.test.ts:326-353` - 'old-synced' terhapus (record+index, outbox tetap kosong), 'old-pending'/'new-tombstone'/'live' utuh; `indexeddb.ts:460` `row.deleted && row.updatedAtMs < cutoffMs`; `:463` `count(outbox) === 0`. Satu transaksi + `durability:'strict'` (`:447`) di bawah lock penulis |
| 2. Util pakai `SYNC_TOMBSTONE_RETENTION_DAYS`, aman tanpa dukungan adapter | pass | `compaction.ts:20` (konstanta kontrak, `packages/contracts/src/sync.ts:54` = 90); `compaction.test.ts` (4) - adapter tanpa `purgeTombstones` -> `0`, bukan error; type guard `:25` |
| 3. Kartu Penyimpanan punya aksi + hasil jumlah; estimate disegarkan | **fail** | Perilakunya benar **bila tombol tampil** (QA `StorageCard.compact.qa109.test.ts`: 3 test PASS - klik -> `3 record dibersihkan.`, `estimate()` dipanggil 2x). Tetapi tombol tidak dirender setelah muat normal - lihat Bug 1 |
| 4. Test adapter (tua vs baru vs pending) + util | pass | `indexeddb.test.ts:297-370` membedakan tiga keadaan + cutoff eksklusif + idempoten; `compaction.test.ts` |

## Bug

| # | Severity | Ringkas | Reproduksi | Bukti |
| --- | --- | --- | --- | --- |
| 1 | High | Tombol "Bersihkan riwayat terhapus" tidak muncul pada muat normal halaman Akun (reload/direct link), jadi AC 3 tidak bisa dipakai user | 1. Mount `StorageCard` saat sesi data lokal belum terbuka (`localData.current() === null`) - keadaan ini yang terjadi saat reload, karena `akun.vue` membuka sesi lewat `account.load()` di `onMounted`. 2. Sesi terbuka (`opened` terisi). 3. `canCompact` tidak dihitung ulang: `opened` variabel modul non-reaktif, dan `useStorageDurability.refresh()` hanya jalan sekali saat mount. 4. Parent re-render (devices/estimate) tidak menolong. Expected: tombol muncul begitu sesi siap. Actual: tidak ada sampai ada dependency reaktif lain berubah (mis. pindah halaman lalu kembali) | `StorageCard.vue:30` `canCompact = computed(() => localData.current() !== null)`; `useLocalData.ts:186-191` `current()` membaca `opened` (modul, non-reaktif); `useStorageDurability.ts:68-70` refresh hanya `onMounted`. Reproduksi: probe vitest (dihapus setelah gagal) - 2 test gagal, teks kartu tanpa "Bersihkan riwayat terhapus" setelah sesi dibuka & setelah parent re-render |

Saran perbaikan: bikin `canCompact` reaktif - mis. expose `opened` lewat `useState`/ref, atau hitung
dari `localData.state.value.status === 'ready'` (state itu `useState`, memicu render). Tambahkan test
regresi: tombol muncul saat sesi dibuka **setelah** mount.

## Tiga pilar

- **Keamanan data:** purge hanya menyentuh `record` + `record_index`; outbox tidak dihapus; transaksi
  atomik (gagal di tengah = tidak ada yang terhapus). Tidak menyentuh kunci/kripto. Tidak ada data
  user yang dikirim keluar.
- **Performa:** scan penuh `record` hanya saat user menekan tombol (bukan jalur panas), di bawah lock
  penulis. Tidak ada dampak ke render/pull.
- **Kerapian:** gate delta PASS. Catatan: `StorageCard.vue` tetap <= 211 baris; tidak ada `console.log`.

## Sisa risiko / tidak diuji

- Cutoff memakai jam dinding perangkat (`updatedAtMs`), bukan HLC. Jam perangkat meleset > 90 hari
  bisa mempurge tombstone yang sebenarnya baru (risiko eksotis; urutan merge tetap HLC).
- Tombstone hasil pull/import diberi `updatedAtMs = waktu pull` (`utils/io/index-entry.ts:35`), jadi
  pembersihannya tertunda 90 hari sejak pull - konservatif (tidak berbahaya), bukan bug.
- Perilaku nyata `await` di dalam cursor IndexedDB (count + delete + continue) belum diuji di browser
  sungguhan; `fake-indexeddb` lebih permisif. Kalau transaksi nonaktif, tx abort - tidak ada data hilang.
- Skenario "perangkat offline > 90 hari" (harusnya `SYNC_RESET_REQUIRED` + full pull) tidak diuji di
  sini; kesetaraan retensi server belum diverifikasi end-to-end, hanya konstanta yang sama.
- Purge setelah sync lintas perangkat (record terhapus tidak hidup lagi) belum diuji - butuh 2 sesi.
