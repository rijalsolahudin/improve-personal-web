# QA report - #107 Web: durability penyimpanan - persist() + kartu kuota

## Verdict

**LULUS (dengan catatan non-blocking)**

- Tier: T2. Delta: `utils/storage/durability.ts`, `composables/useStorageDurability.ts`,
  `components/features/account/StorageCard.vue`, `pages/app/akun.vue`, `layouts/dashboard.vue`, `i18n/locales/id.json`
- Gate handoff: `gate:delta --tier t2` -> PASS (8 file / 37 test + typecheck). Tidak diulang; QA menjalankan
  test terarah + typecheck ulang (karena QA menambah 1 file test) + test regresi area Akun/shell.
- Test baru QA: `app/components/features/account/StorageCard.qa107.test.ts` (5 test UI, prettier/eslint/typecheck PASS).
  Orkestrator bebas commit atau hapus; tidak mengubah kode produk.

## Acceptance criteria

| AC | Hasil | Bukti |
| --- | --- | --- |
| 1. persist() saat masuk app, sekali, aman tanpa `navigator.storage` | pass | `layouts/dashboard.vue:47` -> `ensureStorageProtection()`; skip persist kalau sudah persistent `durability.ts:115-121` + test `durability.test.ts:129-150`; guard SSR `durability.ts:29-31`. 3 file / 25 test PASS |
| 2. Kartu Penyimpanan: usage vs quota, persen, status, tombol | pass | `StorageCard.vue:33-83`; test baru "50%", "belum aktif", tombol -> 5 test PASS |
| 3. Peringatan >=75% + jalan keluar backup/export | pass | `durability.ts:65-66`, `StorageCard.vue:68` + link `/app/import-export`; test baru "75% + hampir penuh + href" |
| 4. format byte manusiawi (locale id), test util + composable | pass | `durability.ts:40-54` + `durability.test.ts:23-38` (B/KB/MB/GB, "1,5 KB"); composable test 4 test |
| 5. typecheck, lint, prettier, test hijau | pass | `pnpm exec nuxt typecheck` exit 0; prettier & eslint `--max-warnings 0` pada file test baru exit 0; vitest di bawah |

Perintah + hasil (exit 0 semua):

- `vitest run app/utils/storage/durability.test.ts app/composables/useStorageDurability.test.ts app/pages/app/akun.qa.test.ts` -> 3 file / 25 test PASS
- `vitest run app/components/features/account/StorageCard.qa107.test.ts` -> 1 file / 5 test PASS
- `vitest run app/pages/app/akun.dialogs.test.ts app/pages/app/akun.pairing.qa.test.ts` -> 2 file / 9 test PASS
- `vitest run app/layouts/dashboard.qa.test.ts app/layouts/dashboard.test.ts` -> 2 file / 3 test PASS
- `nuxt typecheck` -> exit 0 tanpa diagnostik

## Bug

Tidak ada bug blocking (Critical/High). Catatan non-blocking untuk task lanjutan:

| # | Severity | Ringkas | Reproduksi | Bukti |
| --- | --- | --- | --- | --- |
| 1 | Low | Angka 75% tampil tanpa peringatan pada rasio 74,5–74,99% (persen dibulatkan, ambang pakai rasio mentah) | usage 3,0 MB / quota 4,0 MB -> "75%" tapi tidak ada banner hampir penuh | `useStorageDurability.ts:36` vs `durability.ts:66`, `StorageCard.vue:68` |
| 2 | Low | Status bisa basi saat pertama kali persist() baru diberikan: kartu (child) mount & membaca `persisted()` sebelum layout memanggil persist() (parent `onMounted` belakangan), dan hasil persist tidak dibagi lewat state | muat langsung `/app/akun` saat belum persistent -> persist di-grant, kartu tetap "belum aktif" sampai reload/klik | `layouts/dashboard.vue:47`, `StorageCard.vue:11-21`, `useStorageDurability.ts:68` |
| 3 | Low | Browser punya `navigator.storage` tapi tanpa `persist`: status berubah null -> "belum aktif" dan tombol tidak memberi umpan balik saat gagal/ditolak | klik "Minta perlindungan" di browser tanpa persist -> tombol tetap ada, tanpa pesan | `useStorageDurability.ts:60`, `durability.ts:101-108` |

## Copy & keamanan

- Tidak ada klaim "data aman". `protectedHint` menyatakan browser tidak menghapus otomatis saat ruang menipis - sesuai
  semantik persistent storage, bukan jaminan absolut (hapus manual/clear site data tetap menghapus).
- Klaim recovery ("selama passkey atau kode pemulihan masih ada") konsisten dengan definisi app: "kode pemulihan"
  = 24 kata + envelope dalam satu string (`RecoveryBackupCard.vue:3-8`), jadi bukan klaim 24 kata saja cukup.
- Tidak ada secret/PII baru, tidak ada akses `navigator` di luar guard SSR, tidak ada server route berubah.

## Tiga pilar

- **Keamanan:** delta hanya membaca `StorageManager`; tidak menyimpan/menulis data sensitif, tidak ada log.
- **Performa:** tanpa dependency baru; satu pembacaan `estimate()`/`persisted()` saat mount + `Intl.NumberFormat`
  di computed. Tidak ada jalur panas berubah.
- **Kerapian:** guard SSR, tipe eksplisit, tanpa `any`/`console`, komponen 167 baris; typecheck/lint/prettier PASS.

## Sisa risiko / tidak diuji

- Perilaku `persist()` nyata di Chrome/Firefox/Safari (izin otomatis vs prompt vs ditolak) dan tampilan kartu di
  browser sungguhan **belum diverifikasi** - butuh sesi browser; T2 tidak menjalankan E2E.
- Simulasi kuota hampir penuh via DevTools dan efek persist pada eviction Safari 7 hari belum diuji.
- `/app/**` adalah SPA (`nuxt.config.ts:178`), jadi risiko hydration mismatch pada kartu ini tidak berlaku saat ini;
  kalau route diubah ke SSR, `isSupported` (computed non-reaktif dari `navigator`) perlu ditinjau ulang.
- Bundle/Lighthouse tidak diukur (tidak ada AC angka; itu T3).
