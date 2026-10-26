-- `idx_devices_user_installation` redundan dengan unique partial index
-- `uq_devices_user_installation_active` (migrasi 0004): semua pencarian perangkat berdasarkan
-- `installation_id` menyaring `revoked_at IS NULL`, dan target `ON CONFLICT` memakai index partial
-- yang sama. Index biasa ini hanya menambah biaya tulis. Runbook: `apps/web/docs/db-migrations.md`.
DROP INDEX "idx_devices_user_installation";
