-- =============================================================================
-- REMEDIASI baris perangkat kembar - jalankan HANYA kalau pre-check menemukan baris
-- =============================================================================
--
-- Pasangan dengan `0004-device-installation-duplicates.sql`. Script ini mengubah data, jadi:
--   1. Jalankan pre-check dulu dan simpan hasilnya (audit).
--   2. Pastikan hasil `keep_device_id` masuk akal - itulah perangkat yang sesinya DIPERTAHANKAN.
--   3. Jalankan script ini pada jendela deploy (tidak bersamaan dengan login yang sedang berjalan).
--
-- Aturan keputusan (sama dengan pre-check):
--   DIPERTAHANKAN : `last_seen_at` terbaru, tie-break `created_at` terbaru, lalu `id` terbesar.
--   DI-REVOKE     : semua baris lain pada grup (user_id, installation_id) yang sama.
--
-- Kenapa revoke, bukan rename `installation_id`: baris kembar berasal dari bug lama, satu instalasi
-- seharusnya satu baris. Mengosongkan `installation_id` pada yang kalah akan membuatnya terlihat
-- seperti baris lama dan bisa "diadopsi" instalasi lain pada login berikutnya - duplikat berpindah,
-- bukan hilang. Revoke menjaga riwayat audit dan tidak bisa diadopsi (adopsi hanya menyentuh baris
-- AKTIF tanpa `installation_id`).
--
-- Sesi ikut di-revoke dalam transaksi yang sama supaya token yang dipegang baris yang kalah langsung
-- mati (konsisten dengan `revokeDevice`), bukan hidup sampai kedaluwarsa.
--
-- Script idempotent: dijalankan dua kali, run kedua tidak menemukan baris dan tidak mengubah apa pun.
--
-- Jalankan (contoh):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f apps/web/server/db/precheck/0004-device-installation-remediation.sql
-- =============================================================================

BEGIN;

-- Baris yang kalah: semua kecuali peringkat pertama per (user_id, installation_id).
CREATE TEMP TABLE devices_to_revoke ON COMMIT DROP AS
SELECT ranked.id, ranked.user_id, ranked.installation_id, ranked.keep_id
FROM (
  SELECT
    d.id,
    d.user_id,
    d.installation_id,
    first_value(d.id) OVER w AS keep_id,
    row_number() OVER w AS row_rank
  FROM devices d
  WHERE d.installation_id IS NOT NULL
    AND d.revoked_at IS NULL
  WINDOW w AS (
    PARTITION BY d.user_id, d.installation_id
    ORDER BY d.last_seen_at DESC, d.created_at DESC, d.id DESC
  )
) ranked
WHERE ranked.row_rank > 1;

-- Sesi aktif pada baris yang kalah dimatikan lebih dulu.
UPDATE sessions s
SET revoked_at = now()
FROM devices_to_revoke doomed
WHERE s.device_id = doomed.id
  AND s.revoked_at IS NULL;

-- Baris perangkat di-revoke (soft revoke, riwayat tetap ada untuk audit).
UPDATE devices d
SET revoked_at = now()
FROM devices_to_revoke doomed
WHERE d.id = doomed.id;

SELECT
  doomed.user_id,
  doomed.installation_id,
  doomed.keep_id AS kept_device_id,
  array_agg(doomed.id) AS revoked_device_ids
FROM devices_to_revoke doomed
GROUP BY doomed.user_id, doomed.installation_id, doomed.keep_id
ORDER BY doomed.user_id, doomed.installation_id;

COMMIT;

-- Verifikasi: hasilnya harus 0 baris. Kalau masih ada, JANGAN jalankan migrasi 0004; laporkan
-- temuannya (ada penulis lain yang membuat duplikat baru selama remediasi).
SELECT
  d.user_id,
  d.installation_id,
  count(*)::int AS active_duplicate_rows
FROM devices d
WHERE d.installation_id IS NOT NULL
  AND d.revoked_at IS NULL
GROUP BY d.user_id, d.installation_id
HAVING count(*) > 1;
