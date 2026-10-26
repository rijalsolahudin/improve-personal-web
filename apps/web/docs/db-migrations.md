# Migrasi & deploy database - apps/web

Runbook untuk migrasi Postgres di `apps/web/server/db/migrations/`. Berlaku untuk operator deploy.
Migrasi **tidak** dijalankan otomatis oleh Nitro; jalankan `db:migrate` sebagai langkah deploy
terpisah.

Database yang disentuh perintah di bawah ditentukan `DATABASE_URL` (fallback `NUXT_DATABASE_URL`).
Jangan jalankan perintah di dokumen ini tanpa memeriksa nilai env-nya lebih dulu - `drizzle-kit` tidak
punya nilai default, persis supaya salah-set tidak diam-diam menulis ke database lain.

```sh
# contoh: database test lokal (BUKAN produksi)
export DATABASE_URL='postgres://postgres:secret@127.0.0.1:5432/improve_personal_test'
pnpm --filter @improve-personal/web exec drizzle-kit migrate
```

Kalau `.env` hanya mengisi `NUXT_DATABASE_URL`, samakan dulu untuk session shell (jangan biarkan
kosong - perintah di bawah akan menolak koneksi):

```sh
export DATABASE_URL="${DATABASE_URL:-$NUXT_DATABASE_URL}"
```

## Urutan deploy yang mengikat

1. **Pre-check** migrasi 0004 (bagian di bawah). Wajib, read-only.
2. **Remediasi** kalau pre-check menemukan baris kembar.
3. **`db:migrate`** - schema harus lebih dulu dari kode baru.
4. **Rilis app versi baru.**

Alasan urutan ini: kode baru menyebut `devices.installation_id` dan `oauth_states.installation_id`
di SELECT/INSERT. Kalau app baru jalan di schema lama, **semua login 500**. Sebaliknya, kode lama
tetap aman di schema baru (kolom nullable, index additive).

## Migrasi 0004 - unique partial index perangkat

`0004_wealthy_tombstone.sql` membuat:

```sql
CREATE UNIQUE INDEX "uq_devices_user_installation_active"
  ON "devices" ("user_id", "installation_id")
  WHERE "installation_id" IS NOT NULL AND "revoked_at" IS NULL;
```

Index ini menegakkan invarian **satu instalasi = satu baris AKTIF per user**. Baris kembar lama
(akibat bug sebelum #80) membuat `CREATE UNIQUE INDEX` gagal. Migrasi berjalan dalam transaksi, jadi
kegagalan tidak meninggalkan index setengah jadi dan tidak tercatat di `drizzle.__drizzle_migrations`;
setelah remediasi, `db:migrate` bisa dijalankan ulang.

### 1. Pre-check (read-only)

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/web/server/db/precheck/0004-device-installation-duplicates.sql
```

- **0 baris** -> aman, lanjut `db:migrate`.
- **Ada baris** -> jangan migrasi. Periksa `user_id`, `installation_id`, `keep_device_id`, dan
  `device_ids`. `keep_device_id` adalah baris yang akan dipertahankan; sisanya akan di-revoke.

Query sengaja menyaring `installation_id IS NOT NULL AND revoked_at IS NULL` - hanya baris itulah yang
masuk index. Baris revoked dengan nilai instalasi yang sama **tidak** melanggar dan tidak perlu
disentuh.

### 2. Remediasi baris kembar (mengubah data)

> Jalankan pada jendela deploy, tidak bersamaan dengan login yang sedang berjalan. Simpan output
> pre-check sebagai bukti audit.

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/web/server/db/precheck/0004-device-installation-remediation.sql
```

Script (satu transaksi, idempotent):

- Memilih baris yang **dipertahankan** per `(user_id, installation_id)`: `last_seen_at` terbaru,
  tie-break `created_at` terbaru lalu `id` terbesar.
- Me-revoke sesi aktif pada baris yang kalah, lalu me-revoke baris perangkatnya (`revoked_at = now()`).
  Riwayat tetap tersimpan untuk audit; baris revoked tidak bisa diadopsi login berikutnya.
- Mencetak daftar baris yang di-revoke dan menjalankan query verifikasi di akhir. Verifikasi **wajib
  0 baris** sebelum `db:migrate`.

Dampak yang disadari: sesi pada baris yang kalah langsung mati. Baris-baris itu adalah duplikat
instalasi yang sama, jadi hanya satu yang bisa menjadi sesi hidup saat ini - dan yang dipertahankan
adalah yang paling baru dipakai.

Alternatif yang **tidak** dipakai script: mengosongkan `installation_id` baris yang kalah. Itu
mempertahankan baris/sesi, tetapi membuatnya terlihat seperti baris lama yang bisa diadopsi instalasi
lain pada login berikutnya - duplikat berpindah, bukan hilang. Kalau produk memutuskan opsi itu,
lakukan manual dan tetap jalankan verifikasi.

### 3. Migrasi

```sh
pnpm --filter @improve-personal/web exec drizzle-kit migrate
```

## Migrasi 0005 - drop index lama perangkat

`0005_zippy_firebird.sql` menghapus `idx_devices_user_installation` karena redundan dengan
`uq_devices_user_installation_active`. Aman karena seluruh query produksi yang mencari perangkat
berdasarkan `installation_id` selalu menyaring baris aktif:

- `findActiveDeviceIdByInstallation` -> `user_id + installation_id + revoked_at IS NULL`
- `ON CONFLICT` insert perangkat -> target + predikat sama dengan unique partial index
- Adopsi baris lama (`installation_id IS NULL`) memakai `idx_devices_user_created` /
  `idx_devices_user_active`; jumlah baris per user dibatasi 10 sehingga tidak butuh index khusus.
- Daftar perangkat memakai `(user_id, created_at)`.

Verifikasi setelah migrasi:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'devices'
ORDER BY indexname;
```

Yang harus ada: `uq_devices_user_installation_active` (unique, partial) dan
`idx_devices_user_created`; `idx_devices_user_installation` harus **hilang**.

Rollback (hanya kalau benar-benar dibutuhkan; index ini additive):

```sql
CREATE INDEX "idx_devices_user_installation"
  ON "devices" USING btree ("user_id", "installation_id");
```

## Index untuk tabel besar

Migrasi 0002/0004 memakai `CREATE INDEX` biasa (di dalam transaksi migrasi). Tabel `devices` kecil
(maks 10 baris aktif per user), jadi lock-nya singkat. Kalau suatu saat tabel ini besar, buat index
berikutnya sebagai migrasi terpisah dengan `CREATE INDEX CONCURRENTLY` di luar transaksi - jangan
mengubah migrasi yang sudah dirilis.
