-- =============================================================================
-- PRE-CHECK WAJIB sebelum migrasi 0004 (unique partial index perangkat)
-- =============================================================================
--
-- Migrasi `0004_wealthy_tombstone.sql` membuat:
--
--   CREATE UNIQUE INDEX "uq_devices_user_installation_active"
--     ON "devices" ("user_id", "installation_id")
--     WHERE "installation_id" IS NOT NULL AND "revoked_at" IS NULL;
--
-- Kalau satu user punya lebih dari satu baris AKTIF dengan `installation_id` yang sama, CREATE INDEX
-- gagal (`could not create unique index`). Migrasi lalu di-rollback; app versi baru tidak boleh
-- dirilis sebelum ini beres.
--
-- Query di bawah READ-ONLY (tidak mengubah apa pun) dan mengembalikan HANYA baris yang benar-benar
-- melanggar index tersebut:
--   * `installation_id IS NOT NULL` - baris lama tanpa nilai tidak ikut index.
--   * `revoked_at IS NULL`        - baris revoked boleh berbagi nilai (riwayat audit).
--
-- Hasil KOSONG (0 baris) = aman, lanjutkan `db:migrate`.
-- Ada baris = jalankan `0004-device-installation-remediation.sql` lebih dulu, lalu ulangi query ini.
--
-- Kolom `keep_device_id` = baris yang akan DIPERTAHANKAN oleh script remediasi:
-- `last_seen_at` terbaru, lalu `created_at` terbaru, lalu `id` terbesar. `device_ids` sudah diurutkan
-- dengan aturan yang sama, jadi semua setelah elemen pertama adalah baris yang akan di-revoke.
--
-- Jalankan (contoh):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f apps/web/server/db/precheck/0004-device-installation-duplicates.sql
-- =============================================================================

SELECT
  d.user_id,
  d.installation_id,
  count(*)::int AS active_duplicate_rows,
  (array_agg(d.id ORDER BY d.last_seen_at DESC, d.created_at DESC, d.id DESC))[1] AS keep_device_id,
  array_agg(d.id ORDER BY d.last_seen_at DESC, d.created_at DESC, d.id DESC) AS device_ids,
  max(d.last_seen_at) AS newest_last_seen_at
FROM devices d
WHERE d.installation_id IS NOT NULL
  AND d.revoked_at IS NULL
GROUP BY d.user_id, d.installation_id
HAVING count(*) > 1
ORDER BY active_duplicate_rows DESC, d.user_id, d.installation_id;
