# QA report - #108 penanganan QuotaExceededError terpusat + banner

## Verdict

**LULUS DENGAN CATATAN** - AC 1-4 terbukti; satu celah cakupan di jalur tulis lain (F1) jadi
follow-up, bukan blocker (tidak ada data hilang, jalur yang diubah task ini terbukti).

- Tier: T2
- Delta: `utils/storage/{quota,quota-guard,pressure,record-writer}.ts`, `composables/useStorageQuotaAlert.ts`,
  `components/features/shell/StorageQuotaBanner.vue`, `layouts/dashboard.vue`, `i18n/locales/id.json`
- Gate developer: `gate:delta --tier t2` PASS (17 file / 112 test file / 651 test + typecheck) - tidak
  diulang. QA menjalankan test terarah + menambah 1 test regresi ujung-ke-ujung.

## Acceptance criteria

| AC | Hasil | Bukti |
| --- | --- | --- |
| 1. Kuota -> `StorageQuotaError`, pesan asli tetap | pass | `vitest run app/utils/storage/quota.test.ts` (7 test) - DOMException/nama/pesan; `quota.ts:26` `super(cause.message)`; `normalizeStorageError` simpan `cause` |
| 2. Sinyal global + banner `role=alert` (backup + tutup) | pass | `quota-guard.test.ts` (4) + `pressure.test.ts` (4) + `StorageQuotaBanner.qa.test.ts` (4) -> `StorageQuotaBanner.vue:15` `role="alert"`, `:18` href `/app/import-export`, `:19-21` Tutup -> `clearStorageQuotaError`. Sinyal modul, jadi tetap ada saat pindah halaman; test "dipasang setelah kejadian" lulus |
| 3. Tidak ada input user yang dihapus | pass | Delta tidak menyentuh state form; `record-writer.ts:136-149` hanya membungkus commit lalu melempar ulang. Regresi Memo: `useMemos.write.qa.test.ts`, `useMemos.writefix.qa71.test.ts`, `useMemos.persist.qa.test.ts`, `memo.writeerror.qa.test.ts`, `memo.alertflow.qa71.test.ts` -> 39 test PASS (draf tetap, tombol "Coba lagi" tetap) |
| 4. Test deteksi/pemetaan/banner | pass | Perintah QA: 7 file -> **72 test PASS** (exit 0). QA tambah `utils/storage/record-writer.quota.qa108.test.ts`: `writeRecord` nyata dengan adapter yang gagal kuota -> `StorageQuotaError` + `message === 'penuh sekali'` + `storageQuotaState() !== null` (sebelumnya wiring ini hanya terbukti lewat unit test guard) |

## Temuan (di luar AC, tidak menggagalkan task)

| # | Severity | Ringkas | Bukti |
| --- | --- | --- | --- |
| F1 | Medium | Jalur tulis yang TIDAK lewat guard: import backup (`utils/io/import.ts:57` -> `applyBackupImport` core, langsung ke adapter) dan merge pull (`sync/controller.ts:540-550` + `pullDelta` di `:385`). Kuota penuh di sana -> pesan `Import gagal: ...`/status sync error, **tanpa banner**. Klaim handoff "import termasuk" tidak akurat. `repository.ts:175` juga tanpa guard, tetapi `repos.*.write` tidak dipakai produksi (hanya `listAll/getById`) | `grep -n commitLocalWrite app` -> dua pemanggil, hanya `record-writer.ts` yang di-guard |
| F2 | Low | `useStorageQuotaAlert` membaca state di `onMounted` saja - aman karena banner selalu ter-mount di layout; jadi rapuh kalau nanti dipindah ke `Lazy`/`ClientOnly` | `useStorageQuotaAlert.ts:28-33`, test "dipasang setelah kejadian" |

## Tiga pilar

- **Keamanan:** banner tidak memuat data user/ID record, tidak mengklaim "data aman" (teks: "Perubahan
  terakhir belum tersimpan"), hanya tautan internal `/app/import-export`. `atMs` tidak dirender.
- **Performa:** tanpa jalur panas baru - satu `Set` listener + satu objek state; banner `v-if` tanpa
  fetch/watch. Tidak ada perubahan pada write path selain satu wrapper async.
- **Kerapian:** gate delta PASS (prettier+eslint+typecheck). Test tambahan QA lolos
  `prettier --check` dan `eslint --max-warnings 0`. Tidak ada `any`/`it.only`/`console.log` di delta.

## Sisa risiko / tidak diuji

- Simulasi kuota di browser nyata (DevTools storage penuh / isi IndexedDB besar) **tidak dijalankan** -
  butuh sesi login; bukti di sini unit/komponen + test ujung-ke-ujung `writeRecord`.
- Safari/mode privat dan perilaku eviction tidak diuji.
- F1: import/pull belum menerbitkan sinyal - perlu task terpisah kalau ingin cakupan penuh.
