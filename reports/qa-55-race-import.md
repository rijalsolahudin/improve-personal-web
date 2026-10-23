# QA #55 — Race pilih berkas import (BUG-R2-1)

Tanggal: 2026-10-23 · Task: Ergonio #55 (`16cd6893-72eb-4f38-8bde-48a9526a3a7c`) · Status saat diperiksa: `review`
Area: `apps/web/app/composables/useBackupImport.ts`, `apps/web/app/components/features/io/BackupImportCard.vue`

> Dokumen ini menyimpan **dua putaran**. Putaran 1 (`GAGAL`, temuan `BUG-55-A`) diarsipkan di bawah
> beserta seluruh buktinya (§7 dst.) supaya jejak bug tidak hilang. Putaran 2 (re-QA setelah rework)
> adalah verdict yang berlaku sekarang.

## VERDICT (re-QA putaran 2): **LULUS**

- **`BUG-55-A` (High, data loss): HILANG.** Snapshot `mode` + `isReplaceConfirmed` sebelum `await`
  (`useBackupImport.ts:136-144`), pemakaian `selectedMode` saat menulis (`:162`), dan
  `disabled: isBusy.value` pada opsi mode di UI (`BackupImportCard.vue:35-40` + `Segmented` -> tombol
  native `disabled`, `ui/Segmented/index.vue:49`). Dibuktikan ulang dengan probe independen yang
  **tidak me-mock** `applyBackupDocument` (adapter memori core asli, jadi `wipe()` benar-benar terjadi
  atau tidak), di level composable **dan** komponen (`mountSuspended` + `HTMLElement.click()` native).
- **`BUG-R2-1` tetap hilang** (tidak rusak oleh fix): 9 test `race2.qa` + probe race independen saya
  hijau; race A/B, race 3 berkas, dan race di mode "ganti semua" tetap memilih berkas terakhir.
- **Uji mutasi membuktikan test baru tidak hampa.** Snapshot+guard dihapus sementara → 5 test gagal
  (`(a)`, `(b)` + 3 test developer); `disabled: isBusy` dihapus sementara → 3 test gagal (`(a+f)`,
  `(f)`, + card test developer). Kedua file produk dipulihkan **byte-identik** (sha256 cocok).
- **Gerbang:** vitest regresi **62/62** (14 file), composables **287/287** (45 file), eslint
  `--max-warnings 0` exit 0, prettier exit 0. `nuxt typecheck`: lihat §0.6 — exit 1 **hanya** karena
  satu file untracked milik sesi lain (`useMemos.persist.qa.test.ts`, area memo/#54); dengan file itu
  dikecualikan, typecheck **exit 0** dan **nol** error dari file #55.
- **Tidak ada bug baru yang blocking.** Dua catatan Low (bukan regresi, tidak menghalangi `done`) ada
  di §0.8.

### Verdict putaran 1 (arsip, sudah tidak berlaku): **GAGAL** (blocking, bug baru di jalur yang sama)

- **BUG-R2-1 (race dua kali pilih berkas): HILANG.** Semua AC-A lulus dan dibuktikan ulang dengan probe
  independen (bukan memakai helper test developer), termasuk race 3 berkas dan race di mode
  "ganti semua". Guard `selectionId` memang menangkap bug: saat guard dihapus sementara, **9/16** test
  race gagal; setelah dipulihkan, 40/40 hijau.
- **Namun ditemukan bug baru `BUG-55-A` (High, data loss) di file & alur yang sama**: `applyImport`
  membaca `mode` **setelah** `await`, sedangkan tombol mode di UI **tidak di-disable** saat
  `isBusy`. User bisa menekan "Ganti semua" selagi "Mengimpor…", dan import yang sudah lolos gerbang
  sebagai `merge` dieksekusi sebagai `replace-all` **tanpa konfirmasi** → seluruh data lokal yang tidak
  ada di berkas terhapus. Dibuktikan di level composable dan level komponen (`mountSuspended`, klik
  nyata pada tombol). Detail bukti: §7.
- AC-55.4 (typecheck/eslint/prettier) hijau. Catatan: percobaan `nuxt typecheck` pertama gagal karena
  file probe milik sesi QA paralel (`app/pages/app/probe54.tmp.qa.test.ts`, untracked, mtime 21:43) yang
  saat itu setengah jadi; rerun setelah file itu selesai → exit 0. Bukan disebabkan diff #55.

Rekomendasi putaran 1 (sudah dieksekusi oleh `dimas`): snapshot `mode`/`isReplaceConfirmed` sebelum
`await` + disable `Segmented` saat `isBusy`, lalu jadikan probe mode sebagai test permanen.

## 0. Re-QA putaran 2 — verifikasi `BUG-55-A` hilang

### 0.1 Diff yang diperiksa (kode produk, tidak saya ubah)

`useBackupImport.ts` (+49/−14 terhadap HEAD):

- `hasImportableDocument` (`:62-65`) = `document !== null && preview !== null && totalRecords > 0`,
  dipakai `canApply` (`:68`) **dan** `applyImport` (`:127`) — satu aturan, dua pemakai.
- `applyImport`: `if (isBusy.value) return` (`:125`) lalu snapshot
  `const selectedMode = mode.value; const isConfirmed = isReplaceConfirmed.value` (`:136-137`)
  **sebelum** `await localData.ensure()`; gerbang replace-all tanpa konfirmasi menulis pesan jelas
  (`:141-144`, konstanta `:43-44`); penulisan memakai `mode: selectedMode` (`:162`).
- `selectionId` (guard `BUG-R2-1`) tetap utuh: dinaikkan di `clearSelection` (`:79`), dicek setelah
  `await` (`:100`).

`BackupImportCard.vue` (+17/−7):

- `modeOptions` jadi `computed<SegmentedOption<ImportMode>[]>` dengan `disabled: isBusy.value` pada
  kedua opsi (`:35-40`); `Segmented` tidak diubah dan memang meneruskan ke tombol native
  (`:disabled="option.disabled"`, `ui/Segmented/index.vue:49`).
- Input berkas (`:73`), checkbox konfirmasi (`:100`), dan tombol import (`:108`, via `canApply`)
  tetap mati saat `isBusy` — sekarang mode ikut, jadi konsisten.

### 0.2 Reproduksi independen (adapter nyata, bukan mock)

Test baru (milik QA, tidak menyentuh kode produk):

- `apps/web/app/composables/useBackupImport.modeLock.qa.test.ts` — 5 test, `applyBackupDocument`
  **asli** di atas `createMemoryStorage` + provider plaintext; 3 record lama ber-id yang tidak ada di
  berkas jadi penanda: merge = record lama bertahan, replace-all = hilang.
- `apps/web/app/components/features/io/BackupImportCard.modeLock.qa.test.ts` — 4 test, `mountSuspended`
  + `HTMLElement.click()` native + adapter memori yang sama.

| # | Skenario | Expected | Actual |
|---|---|---|---|
| a | Import mulai di mode merge, lalu `mode` diubah ke `replace-all` **dan** konfirmasi dicentang selagi "Mengimpor…" | eksekusi tetap merge; data lama utuh; `wipe` 0× | **PASS** (composable + UI). Di UI tombol mode memang tidak bisa diklik, jadi jalur ini hanya mungkin programatik — dan tetap merge |
| b | replace-all tanpa centang | ditolak, pesan "belum dikonfirmasi … tidak ada data yang diubah", `wipe` 0×, 0 transaksi, record lama utuh, record berkas tidak masuk, pilihan tidak dibuang | **PASS** (composable: `wipe=0`, `transactions=0`; UI: tombol import native `disabled`, klik native tidak menulis) |
| c | replace-all dengan centang | tetap jalan: `wipe` 1×, hanya isi berkas tersisa, status "Semua data diganti. Import selesai, 2 data masuk." | **PASS** (composable + UI end-to-end lewat komponen) |
| d | double submit | 1× tulis | **PASS** — composable: jumlah transaksi sama dengan satu submit (baseline pembanding); UI: dua klik native dalam tick yang sama → `wipe` 1×, teks status muncul sekali |
| e | race A/B | nama+preview+dokumen milik B; A tidak pernah ditulis; data lama tidak terhapus | **PASS** (9 test `race2.qa` + probe saya) |
| f | `Segmented` benar-benar disabled saat busy | properti DOM `disabled === true`, klik native tidak mengubah `aria-pressed`, blok konfirmasi tidak muncul, dan hidup lagi setelah import selesai/gagal | **PASS** (`HTMLButtonElement.disabled` true untuk kedua opsi; `aria-pressed` "Gabung" tetap `true` setelah klik native; setelah jalur gagal sesi, `disabled` kembali `false`) |

### 0.3 Uji mutasi — bukti test menangkap regresi

Backup: `cp … /tmp/opencode/qa55b/`, sha256 sebelum:
`useBackupImport.ts a757dec2…1efc22`, `BackupImportCard.vue 5e704484…bcdf563`.

**Mutasi A** — hapus blok snapshot + gerbang, dan `mode: selectedMode` → `mode: mode.value`
(replika `BUG-55-A`):

```
$ pnpm --filter @improve-personal/web exec vitest run \
    app/composables/useBackupImport.modeLock.qa.test.ts \
    app/composables/useBackupImport.mode.qa.test.ts \
    app/composables/useBackupImport.round2.qa.test.ts
  × applyImport menolak dijalankan tanpa konfirmasi, walau dipanggil langsung dan mode sudah ganti semua
  × mode yang berubah setelah import mulai tidak boleh mengubah keputusan mode (butuh konfirmasi baru)
  × replace-all tanpa konfirmasi lewat jalur programatik ditolak dengan pesan jelas, tanpa menulis
  × (a) mode merge mulai diimport lalu diubah ke replace-all (+dicentang) saat "Mengimpor…": eksekusi tetap merge dan data lama utuh
  × (b) replace-all tanpa centang ditolak dengan pesan jelas: wipe tidak dipanggil, record lama & baru tidak tersentuh
 Tests  5 failed | 4 passed (9)
```

**Mutasi B** — `modeOptions` dikembalikan ke array tanpa `disabled: isBusy`:

```
$ pnpm --filter @improve-personal/web exec vitest run \
    app/components/features/io/BackupImportCard.modeLock.qa.test.ts \
    app/components/features/io/BackupImportCard.mode.qa.test.ts \
    app/components/features/io/BackupImportCard.test.ts \
    app/components/features/io/io.round2.qa.test.ts
  × "Ganti semua" tidak bisa dipilih selagi import berjalan (tanpa konfirmasi)
  × (a+f) saat "Mengimpor…" tombol mode benar-benar disabled: klik native tidak mengubah mode, eksekusi tetap merge
  × (f) jalur gagal: tombol mode hidup lagi setelah import selesai (disabled tidak nyangkut) dan tidak ada data ditulis
 Test Files  2 failed | 2 passed (4)
      Tests  3 failed | 14 passed (17)
```

Pemulihan diverifikasi `sha256sum -c /tmp/opencode/qa55b/sha-before.txt` → **OK** untuk kedua file;
`git diff --stat` kembali `52 insertions(+), 14 deletions(-)` (sama seperti sebelum mutasi).

### 0.4 Test developer: tidak ada assertion yang dilemahkan

- `race2.qa` (9 test): assertion membandingkan **seluruh** state terlihat (`fileName`, `previewExportedAt`,
  `previewRecords`, `error`, `status`) dengan `toEqual`, plus dokumen yang benar-benar dikirim ke
  `applyBackupDocument` (`exportedAtMs` + jumlah record). Tidak ada yang dilemahkan.
- `mode.qa` (2 test): test 1 mengunci `mode: 'merge'` **dan** memastikan konfirmasi masih `false`;
  test 2 memastikan `applyBackupDocument` **tidak** dipanggil + pesan error + `isBusy=false`.
  Assertion `toBeDefined()` pada `disabled` di `BackupImportCard.mode.qa` sekarang benar (dulu mengunci
  bug: assertion-nya `defined` saat tombol hidup); test itu gagal saat mutasi B — jadi bukan hampa.
- Tidak ada `it.only`/`describe.only`/`.skip`/`xit` di seluruh file terkait; tidak ada file `*probe*`
  tersisa (`git ls-files | grep -i probe` kosong; sisa `.probe` hanya artefak paket di
  `apps/web/node_modules/.probe`). Nama file probe putaran 1 sudah diganti developer menjadi
  `race2.qa` / `mode.qa` / `BackupImportCard.mode.qa`; rujukan nama lama di §1/§5/§6 adalah arsip.

### 0.5 Regresi (verbatim)

```
$ pnpm --filter @improve-personal/web exec vitest run \
    app/composables/useBackupImport.round2.qa.test.ts \
    app/composables/useBackupImport.race.qa.test.ts \
    app/composables/useBackupImport.race2.qa.test.ts \
    app/composables/useBackupImport.mode.qa.test.ts \
    app/components/features/io app/utils/io
 Test Files  14 passed (14)
      Tests  62 passed (62)
```

```
$ pnpm --filter @improve-personal/web exec vitest run app/composables
 Test Files  45 passed (45)
      Tests  287 passed (287)
```

```
$ pnpm --filter @improve-personal/web exec vitest run \
    app/composables/useBackupImport.round2.qa.test.ts \
    app/composables/useBackupImport.race.qa.test.ts \
    app/composables/useBackupImport.race2.qa.test.ts \
    app/composables/useBackupImport.mode.qa.test.ts \
    app/composables/useBackupImport.modeLock.qa.test.ts \
    app/components/features/io app/utils/io
 Test Files  15 passed (15)
      Tests  67 passed (67)
```

### 0.6 Typecheck — hasil jujur (ada gangguan sesi lain)

`nuxt typecheck` penuh **exit 1**, dengan **satu** error dan bukan dari #55:

```
app/composables/useMemos.persist.qa.test.ts(519,5): error TS2349: This expression is not callable.
  Type 'never' has no call signatures.
TYPECHECK_EXIT=1
```

File itu untracked milik sesi QA paralel (area memo, mtime `23:12:05`, bukan bagian #55). Untuk
membuktikan file #55 bersih, typecheck project `app` dijalankan dengan konfigurasi bayangan identik
(salinan `.nuxt/tsconfig.app.json` di direktori yang sama, hanya menambahkan file di atas ke
`exclude`), lalu konfigurasi bayangan dihapus:

```
$ pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.app.qa55.json
SHADOW_TYPECHECK_EXIT=0    # nol error; tidak ada output error TS
```

Grep seluruh log typecheck penuh: **tidak ada** baris error yang menyebut `useBackupImport` atau
`BackupImportCard`.

### 0.7 Lint & format

```
$ pnpm --filter @improve-personal/web exec eslint --max-warnings 0 \
    app/composables/useBackupImport.ts \
    app/composables/useBackupImport.mode.qa.test.ts \
    app/composables/useBackupImport.modeLock.qa.test.ts \
    app/composables/useBackupImport.race2.qa.test.ts \
    app/components/features/io/BackupImportCard.vue \
    app/components/features/io/BackupImportCard.mode.qa.test.ts \
    app/components/features/io/BackupImportCard.modeLock.qa.test.ts
ESLINT_EXIT=0

$ pnpm exec prettier --check <9 file: composable, 5 test composable, card, 2 test card>
All matched files use Prettier code style!
PRETTIER_EXIT=0
```

### 0.8 Cek tiga pilar (putaran 2) & catatan

**Keamanan.** Tidak ada jalur baru yang melewati validasi: `readBackupFileText` (pagar `File.size`) →
`validateBackupText` → `applyBackupImport` tetap sama; guard baru hanya menolak lebih awal. Pesan
`REPLACE_ALL_UNCONFIRMED_MESSAGE` (`useBackupImport.ts:43`) generik, tanpa detail internal/PII. Tidak
ada `v-html`/`innerHTML` baru; nama berkas tetap teks. `wipe()` terbukti tidak pernah terpanggil pada
jalur tanpa konfirmasi (bukti `transactions=0` + isi adapter utuh).

**Performa.** Tambahan hanya satu `computed` (`hasImportableDocument`) dan dua pembacaan ref sebelum
`await`; `modeOptions` jadi `computed` (satu array 2 item, di-cache). Tidak ada I/O atau `JSON.parse`
baru. Suite tetap ~5 s.

**Kerapian.** Duplikasi aturan "dokumen bisa diimpor" dihapus lewat `hasImportableDocument`; komentar
menjelaskan "kenapa" (jendela `await` + `wipe()`), tanpa `any`/`@ts-ignore`/`console.*`; `Segmented`
tidak diubah (prop `disabled` sudah ada). Test regresi permanen ada (9 test baru dari saya + 12 test
developer) tanpa `.only`/`.skip`.

Catatan Low (bukan blocker, bukan regresi):

1. **Pesan penolakan replace-all tidak reachable lewat UI.** Karena tombol import `:disabled="!canApply"`,
   user tidak akan pernah melihat `REPLACE_ALL_UNCONFIRMED_MESSAGE`; pesan itu hanya muncul pada
   pemanggilan programatik. Ini memang disengaja (pertahanan berlapis), cukup dicatat supaya tidak
   dianggap dead code.
2. **Fokus keyboard hilang saat import mulai.** Tombol yang sedang fokus (Import, lalu opsi mode) jadi
   `disabled` sehingga browser memindahkan fokus ke `body`. Perilaku ini sudah ada sebelum fix untuk
   tombol Import (`:108`); fix menambah satu elemen yang ikut disabled. Tidak ada regresi aksesibilitas
   baru yang terukur, tapi kandidat perbaikan UX (`aria-busy` + fokus ke status `aria-live`).

## 1. Scope & test plan

| Diuji | Level | Alasan |
|---|---|---|
| `selectFile` dua kali berurutan (A lambat → B cepat), urutan selesai dibalik | composable (unit) | Inti BUG-R2-1; butuh kontrol deterministik atas `File.text()` |
| A selesai setelah B **gagal parse** / **gagal baca** | composable | Guard harus menahan juga jalur error, bukan hanya sukses |
| Ganti berkas saat preview A sedang tampil | composable | Memastikan preview lama hilang seketika (tidak "nama B + preview A") |
| Race 3 berkas selesai tidak berurutan (C, B, A) | composable | Bukti token tidak sekadar "last call wins" untuk 2 permintaan |
| Berkas kebesaran lalu berkas valid | composable | Pagar `File.size` tetap jalan setelah perubahan |
| Mode "ganti semua" setelah race | composable | AC-55.2: hanya dokumen berkas terakhir yang dieksekusi |
| Pilih berkas saat `applyImport` berjalan | composable | Interleaving selection ↔ apply; cek state campuran |
| Double submit `applyImport` | composable | Regresi `canApply`/`isBusy` |
| Mode diubah saat `applyImport` berjalan | composable **+ komponen** | Probe perluasan: invarian "apply memeriksa ulang aturan konfirmasi" |

Tidak diuji (dan alasannya): `File.text()` tidak bisa dibatalkan (API platform), jadi "pembatalan
baca" tidak bisa dibuktikan — yang diuji adalah **hasil basi diabaikan**. Baca berkas 32 MB nyata tidak
dijalankan (mahal; batas ukuran sudah diuji di `app/utils/io`).

Data uji: dokumen backup valid dari `buildBackupDocument`/`serializeBackup` dengan `exportedAtMs`
**berbeda per berkas** (A/B/C), sehingga `preview.exportedAtMs` bisa dipakai membuktikan preview mana
yang tampil — bukan hanya jumlah record. Mock hanya di batas: `applyBackupDocument` (modul IO) dan
`useLocalData.ensure`; `readBackupFileText` + `validateBackupText` asli ikut berjalan.

File test yang saya tambahkan (tidak ada kode produk yang diubah):

- `apps/web/app/composables/useBackupImport.race.probe.qa.test.ts` — 9 test, **hijau** (regresi permanen yang saya rekomendasikan dipertahankan).
- `apps/web/app/composables/useBackupImport.modeProbe.qa.test.ts` — 1 test, **merah by design** (bukti `BUG-55-A`, level composable).
- `apps/web/app/components/features/io/BackupImportCard.modeProbe.qa.test.ts` — 1 test, **merah by design** (bukti `BUG-55-A`, level UI/klik).

## 2. Diff yang diperiksa

`git diff -- apps/web/app/composables/useBackupImport.ts` → hanya +10 baris:

```
+  // Token pilihan aktif. `clearSelection` menaikkannya, sehingga hasil baca berkas lama yang baru
+  // selesai setelah user memilih berkas lain tahu dirinya basi dan tidak menimpa state terbaru.
+  let selectionId = 0
+
   function clearSelection(): void {
+    selectionId += 1
     fileName.value = null
     ...
   async function selectFile(file: File): Promise<void> {
     clearSelection()
+    const selectedId = selectionId
     ...
     const read = await readBackupFileText(file, BACKUP_MAX_BYTES)
+    // Berkas lain sudah dipilih (atau pilihan dibuang) saat berkas ini masih dibaca: hasilnya basi,
+    // termasuk pesan errornya - yang terakhir dipilih harus menang.
+    if (selectedId !== selectionId) return
```

Kontrak composable ke UI **tidak berubah**: objek return tetap 8 field yang sama; `BackupImportCard.vue`
tidak diubah dan tetap memakai `{ isBusy, error, status, fileName, preview, mode, isReplaceConfirmed, canApply, selectFile, applyImport }`.

## 3. Hasil per acceptance criteria

| AC | Hasil | Bukti |
|---|---|---|
| **AC-55.1** Guard permintaan; nama/preview/isi konsisten dengan berkas terakhir (B) | **PASS** | `apps/web/app/composables/useBackupImport.ts:94`; probe `useBackupImport.race.probe.qa.test.ts` test 1 & 3 & 5; `race.qa.test.ts` (test developer) — semua hijau. A yang selesai belakangan tidak mengubah `fileName`, `preview.exportedAtMs`, maupun dokumen yang dikirim ke `applyBackupDocument` |
| **AC-55.2** Mode "ganti semua" setelah race hanya mengeksekusi berkas terakhir | **PASS** | probe test 7: `applyBackupDocument` dipanggil 1×, `{exportedAtMs: EXPORTED_B, recordCount: 2, mode: 'replace-all'}`, status "Semua data diganti", pilihan dikosongkan setelah sukses |
| **AC-55.3** Test regresi dengan dua permintaan ber-delay berbeda, permintaan lama diabaikan | **PASS** | Test developer 7 kasus + 9 kasus independen saya. **Uji guard dihapus** (§5) membuktikan test benar-benar menangkap bug |
| **AC-55.4** typecheck, eslint `--max-warnings 0`, prettier hijau | **PASS** | §6: typecheck exit 0, eslint exit 0, prettier exit 0 (lihat catatan file probe sesi paralel) |

## 4. Bukti race hilang (skenario + hasil)

Semua dijalankan lewat probe independen. Ekspektasi state akhir selalu "nama & preview & dokumen dari
berkas terakhir", `error` hanya milik berkas terakhir.

| # | Skenario | Expected | Actual |
|---|---|---|---|
| 1 | A lambat → B cepat; A selesai setelah B tampil; lalu apply | B (2 record, exportedAt B) | **PASS** |
| 2 | A lambat selesai setelah **B gagal parse** | `fileName=B`, `preview=null`, `error` milik B, `canApply=false` | **PASS** |
| 3 | A **gagal dibaca** (`File.text()` reject) selesai setelah B sukses | B utuh, `error=null` | **PASS** |
| 4 | Ganti berkas saat preview A tampil (B masih dibaca) | seketika `fileName=B`, `preview=null`, `canApply=false` → lalu preview B | **PASS** |
| 5 | Tiga berkas selesai tidak berurutan (C, B, A) | C menang; apply memakai C | **PASS** |
| 6 | Berkas kebesaran → berkas valid | `error=null`, preview valid | **PASS** |
| 7 | Mode "ganti semua" setelah race | hanya dokumen B dieksekusi | **PASS** |
| 8 | Pilih berkas saat `applyImport` berjalan | import tetap memakai snapshot A; akhir: tanpa nama/preview yatim, `canApply=false`, status sukses | **PASS** (lihat catatan L-1) |
| 9 | Double submit `applyImport` | `applyBackupDocument` 1× | **PASS** |

Tidak ada kombinasi state campuran yang lolos: setiap assertion memakai `fileName` + `preview.exportedAtMs`
+ `preview.totalRecords` + `error` + `status` sekaligus, dan dokumen yang benar-benar ditulis diperiksa
dari argumen `applyBackupDocument` (`exportedAtMs` + jumlah record).

## 5. Uji "guard benar-benar menangkap bug"

Backup: `cp apps/web/app/composables/useBackupImport.ts /tmp/opencode/qa55/useBackupImport.ts.bak`
(sha256 `73ae9f0b…30f02`). Lalu baris `if (selectedId !== selectionId) return` dihapus sementara
(termasuk komentarnya), test dijalankan, file dipulihkan dari backup (sha256 kembali sama; `git diff`
kembali hanya +10 baris).

Perintah:

```
pnpm --filter @improve-personal/web exec vitest run \
  app/composables/useBackupImport.race.qa.test.ts \
  app/composables/useBackupImport.race.probe.qa.test.ts
```

Hasil dengan guard dihapus (**9 failed | 7 passed**):

```
× berkas lambat (A) lalu berkas cepat (B): nama, preview, dan dokumen mengikuti B
× hasil A yang selesai setelah B gagal tidak menghidupkan preview basi
× import memakai dokumen berkas terakhir setelah perlombaan (mode gabung)
× A lambat lalu B cepat: setelah A selesai, nama + preview tetap milik B (bukan campuran)
× A lambat selesai setelah B gagal parse: error B tidak tertimpa, preview A tidak muncul
× A gagal dibaca (file.text reject) lalu B sukses: error A tidak muncul setelah B tampil
× tiga berkas selesai tidak berurutan (C, B, lalu A): yang menang tetap C
× mode "ganti semua" setelah race hanya mengeksekusi dokumen berkas terakhir
× memilih berkas saat applyImport berjalan: import tetap memakai dokumen semula, tanpa state campuran
Tests  9 failed | 7 passed (16)
```

Contoh kegagalan khas (persis bug asli BUG-R2-1, nama B + isi A):

```
FAIL … > hasil A yang selesai setelah B gagal tidak menghidupkan preview basi
AssertionError: expected { rows: [ { …(3) } ], …(3) } to be null
+ Received:
{ "exportedAtMs": 1700000000000, "totalRecords": 3, "rows": [ { "label": "preferensi", "count": 3, "type": "user_prefs" } ] }
```

Setelah guard dipulihkan: **40/40 hijau** (§6). Artinya test bukan sekadar hijau karena kebetulan —
tanpa guard, 9 test jatuh.

## 6. Regresi & gerbang (verbatim)

```
$ pnpm --filter @improve-personal/web exec vitest run \
    app/composables/useBackupImport.round2.qa.test.ts \
    app/composables/useBackupImport.race.qa.test.ts \
    app/composables/useBackupImport.race.probe.qa.test.ts app/utils/io
 Test Files  8 passed (8)
      Tests  40 passed (40)
```

```
$ pnpm --filter @improve-personal/web exec nuxt typecheck
TYPECHECK_EXIT=0
```

Catatan transparan: percobaan pertama (`21:42`) gagal dengan
`app/pages/app/probe54.tmp.qa.test.ts(337,46): error TS2304: Cannot find name 'DailyGoalReviewCard'` —
file untracked milik sesi QA paralel (#54) yang baru dibuat 21:43 dan masih setengah jadi. Rerun setelah
file itu lengkap: exit 0. Tidak ada error dari file #55.

```
$ pnpm --filter @improve-personal/web exec eslint --max-warnings 0 \
    app/composables/useBackupImport.ts \
    app/composables/useBackupImport.race.qa.test.ts \
    app/composables/useBackupImport.race.probe.qa.test.ts \
    app/composables/useBackupImport.modeProbe.qa.test.ts \
    app/components/features/io/BackupImportCard.modeProbe.qa.test.ts
ESLINT_EXIT=0

$ pnpm exec prettier --check <10 file terkait: composable, 2 test developer, 3 probe, card, io/read-file, io/import, io/preview>
All matched files use Prettier code style!
PRETTIER_EXIT=0
```

Regresi UI (kontrak tidak berubah):

```
$ pnpm --filter @improve-personal/web exec vitest run \
    app/components/features/io/BackupImportCard.test.ts \
    app/components/features/io/io.round2.qa.test.ts
 Test Files  3 passed (3)
      Tests  13 passed (13)
```

## 7. Bug baru

### BUG-55-A — Mode import bisa berubah ke "ganti semua" saat import berjalan, dieksekusi tanpa konfirmasi (High, data loss)

**Langkah reproduksi (level UI, terbukti dengan `mountSuspended`):**

1. Pilih berkas backup valid yang berisi ≥1 record; preview "N data" tampil, mode "Gabung".
2. Tekan **Import data** (tombol berubah "Mengimpor…"; request data lokal ditahan).
3. Selagi "Mengimpor…", tekan **Ganti semua** — tombol ini **tidak disabled** (beda dengan input berkas
   `:disabled="isBusy"` dan checkbox konfirmasi `:disabled="isBusy"`).
4. Import selesai.

**Expected:** mode yang dipakai adalah mode yang lolos `canApply` saat import dimulai (`merge`), atau
perubahan mode membatalkan/menunda import dan menuntut konfirmasi baru. `replace-all` tanpa centang
konfirmasi tidak boleh pernah sampai ke `applyBackupDocument`.

**Actual:** `applyBackupDocument` menerima `mode: 'replace-all'` tanpa `isReplaceConfirmed`.

```
$ pnpm --filter @improve-personal/web exec vitest run \
    app/composables/useBackupImport.modeProbe.qa.test.ts \
    app/components/features/io/BackupImportCard.modeProbe.qa.test.ts
 FAIL  … mode yang berubah setelah import mulai tidak boleh mengubah keputusan mode …
 FAIL  … "Ganti semua" tidak bisa dipilih selagi import berjalan (tanpa konfirmasi) …
AssertionError: expected { target: { clock: { …(1) } }, …(3) } to match object { mode: 'merge' }
-   "mode": "merge",
+   "mode": "replace-all",
 Test Files  2 failed (2)
      Tests  2 failed (2)
```

**Dampak:** `replace-all` di core menghapus seluruh record lokal lalu menulis isi berkas (`wipe()`),
jadi record yang tidak ada di berkas hilang — dipicu satu klik pada jendela import, tanpa konfirmasi
apa pun. Ini juga melanggar invarian yang ditulis sendiri di komentar composable
(`useBackupImport.ts:31-32`: "`applyImport` memeriksa ulang aturan yang sama supaya jalur programatik
tidak bisa melewatinya") — pemeriksaan itu hanya di awal (`:118`), tidak sebelum menulis (`:136-141`).

**Bukti `path:line`:**

- `apps/web/app/composables/useBackupImport.ts:118` — gerbang `canApply` hanya sekali, sebelum `await`.
- `apps/web/app/composables/useBackupImport.ts:128` + `:136-141` — `mode: mode.value` dibaca **setelah**
  `await localData.ensure()` dan setelah `applyBackupDocument` mulai; `mode`/`isReplaceConfirmed` tidak
  di-snapshot (berbeda dengan `document` yang di-snapshot di `:120`).
- `apps/web/app/components/features/io/BackupImportCard.vue:90` — `<Segmented v-model="mode" …>` tanpa
  `disabled`; bandingkan `:68` (input berkas) dan `:95` (checkbox konfirmasi) yang `:disabled="isBusy"`.
- `apps/web/app/components/ui/Segmented/index.vue:49` — tombol opsi hanya disabled kalau
  `option.disabled`, dan `modeOptions` di card tidak menyetelnya.

**Saran perbaikan (untuk `dimas`, bukan saya):** snapshot keputusan saat lolos gerbang, mis.
`const selectedMode = mode.value; const isConfirmed = isReplaceConfirmed.value` sebelum `await`, pakai
nilai snapshot itu saat memanggil `applyBackupDocument`, dan/atau `:disabled="isBusy"` pada `Segmented`.
Tambah test regresi dari probe di atas (bisa dipertahankan apa adanya setelah hijau).

### Catatan L-1 (Low, tidak reachable lewat UI) — pilihan berkas saat import berjalan dibuang diam-diam

`applyImport` memanggil `clearSelection()` setelah sukses (`useBackupImport.ts:146`), yang menaikkan
token; `selectFile` yang dimulai saat import berjalan lalu dianggap basi (`:94`) sehingga
`fileName`/`preview` berakhir `null` tanpa pesan apa pun ke user. Saat ini input berkas `disabled` saat
`isBusy` (`BackupImportCard.vue:68`) jadi tidak bisa dipicu user biasa — hanya lewat jalur programatik.
Bukan blocker; cukup dicatat kalau nanti input berkas di-enable saat import.

## 8. Cek tiga pilar

**Keamanan**

- Tidak ada input baru yang masuk storage tanpa validasi: `readBackupFileText` (pagar `File.size`) →
  `validateBackupText` → `applyBackupImport` (invarian ulang di core) tetap utuh; guard hanya menambah
  early-return. `BACKUP_MAX_BYTES` tetap dicek sebelum `file.text()`.
- Tidak ada secret/PII baru, tidak ada `v-html`/`innerHTML`; nama berkas dirender sebagai teks
  (`BackupImportCard.vue:71`).
- **Temuan keamanan/integritas data:** `BUG-55-A` (mode replace-all tanpa konfirmasi) — lihat §7.

**Performa**

- Guard = satu perbandingan integer per pemilihan berkas; tidak ada pembacaan/`JSON.parse` tambahan,
  tidak ada alokasi baru. `shallowRef` untuk dokumen tetap dipakai.
- Tidak ada request/jaringan baru. Tidak ada regresi terukur (test suite tetap 3-5 s; tidak ada loop
  tambahan pada 50.000 record).

**Kerapian**

- Perubahan +10 baris, satu variabel lokal, komentar menjelaskan "kenapa" (basaya hasil baca), tanpa
  `any`/`@ts-ignore`/`console.*`, tanpa dead code. `selectionId` tidak diekspos keluar composable.
- Test regresi ada (7 test developer + 9 test independen), tanpa `.only`/`.skip`, assertion tidak
  dilemahkan. typecheck/eslint/prettier hijau.

## 9. Coverage & celah yang tersisa

1. `File.text()` tidak bisa di-abort; guard hanya mengabaikan hasil basi. Untuk berkas sangat besar,
   pembacaan A tetap memakan memori sampai selesai walau sudah basi. Pagar 32 MB membatasi dampaknya,
   tapi pembatalan sesungguhnya butuh `AbortController` + pembacaan stream (`File.stream()`), bukan
   `text()`. Catat sebagai backlog performa, bukan blocker #55.
2. Jalur `replace-all` nyata ke IndexedDB/SQLite (termasuk jendela `wipe()` → tulis) masih hanya diuji
   dengan adapter memori — celah lama dari `reports/qa-t12-import-export.md`, bukan regresi #55.
3. Race pada `applyImport` yang sedang menulis lalu **aplikasi di-kill** tidak bisa diuji unit; perlu
   test integrasi adapter.
4. `BUG-55-A` perlu test regresi permanen; dua probe saya sudah siap dipakai (tinggal dipertahankan
   setelah fix, atau digabung ke `BackupImportCard.test.ts`).
5. E2E Playwright untuk alur pilih-berkas-di-OS belum ada; semua bukti di sini level composable/komponen.

## 10. Rekomendasi

1. **Fix `BUG-55-A`** (snapshot `mode` + `isReplaceConfirmed` sebelum `await`; disable `Segmented` saat
   `isBusy`), lalu jadikan dua probe mode sebagai test regresi permanen.
2. Pertahankan `useBackupImport.race.probe.qa.test.ts` (9 test) sebagai jaring regresi race; ia menguji
   hal yang tidak dicakup test developer (race 3 berkas, race jalur error baca, interleaving
   `applyImport`, double submit).
3. Baru setelah itu #55 layak `done`. Kalau orchestrator memecah `BUG-55-A` ke task terpisah, catat
   bahwa #55 sendiri (race selectFile) sudah lulus penuh.
