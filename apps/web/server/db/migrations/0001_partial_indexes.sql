-- Index PARTIAL - SQL tangan, karena DBML belum bisa menulis `WHERE` dan bentuk SQL-nya harus persis
-- seperti `apps/web/docs/server.dbml` (dbml menandai tiap index di bawah dengan komentar "PARTIAL").
--
-- Berkas ini dibuat lewat `drizzle-kit generate --custom --name=partial_indexes` supaya terdaftar
-- benar di `meta/_journal.json` (drizzle-kit sendiri yang menulis entri + snapshot-nya). Karena itu
-- jangan di-rename: tag di journal harus sama dengan nama berkas, dan `drizzle-kit generate`
-- berikutnya akan memakai nomor 0002 ke atas.
--
-- Kenapa index partial, bukan index biasa: ketiga index di bawah ini hanya dipakai untuk query yang
-- selalu menyaring satu nilai tetap (`WHERE revoked_at IS NULL`, `consumed_at IS NULL`,
-- `deleted`). Index penuh akan ikut menyimpan baris yang sudah tidak relevan (sesi revoked, OTP
-- terpakai, record hidup) sehingga lebih besar dan lebih lambat diperbarui - sementara
-- `records`/`sessions` adalah tabel yang paling sering ditulis di server ini.
--
-- Perawatan: kalau predikat di dbml berubah, ubah berkas ini (index baru tidak akan muncul sendiri
-- dari `schema.ts` - drizzle-kit tidak menghasilkan index partial dari skema ini).

-- Daftar perangkat aktif per user (halaman "Perangkat", PRD F15). `revoked_at` ikut jadi kolom index
-- supaya satu index melayani "10 device aktif" (count) dan riwayat per user.
CREATE INDEX "idx_devices_user_active" ON "devices" USING btree ("user_id","revoked_at") WHERE "revoked_at" IS NULL;--> statement-breakpoint

-- Validasi sesi: cari sesi hidup milik user (mis. revoke semua perangkat). Sesi revoked tidak
-- pernah dibaca lagi tapi tetap disimpan untuk jejak audit.
CREATE INDEX "idx_sessions_user_active" ON "sessions" USING btree ("user_id","revoked_at") WHERE "revoked_at" IS NULL;--> statement-breakpoint

-- Batas "berapakali OTP diminta untuk email ini" + brute-force kode: hanya challenge yang belum
-- dikonsumsi yang dihitung. `created_at` ada di index supaya rentang waktunya tidak perlu sort
-- ulang saat tabelnya sudah besar.
CREATE INDEX "idx_otp_email_open" ON "otp_challenges" USING btree ("email_hash","created_at") WHERE "consumed_at" IS NULL;--> statement-breakpoint

-- Job `purge-tombstones`: cari tombstone yang sudah lewat 90 hari. Tanpa index ini, scan-nya
-- tumbuh mengikuti seluruh isi `records` (semua ciphertext user), dan job cron yang jalan tiap hari
-- akan makin lama sendiri. `WHERE deleted` + `updated_at` mempersempit ke tombstone saja.
CREATE INDEX "idx_records_purge" ON "records" USING btree ("deleted","updated_at") WHERE "deleted";
