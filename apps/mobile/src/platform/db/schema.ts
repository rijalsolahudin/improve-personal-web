import type { SQLiteDatabase } from 'expo-sqlite'

/**
 * Skema fisik Bagian A `apps/web/docs/database.dbml` untuk SQLite (ARCHITECTURE.md §5-§6).
 *
 * Waktu disimpan sebagai epoch ms (`*_ms`, INTEGER), sama dengan bentuk di `ports.ts`, supaya adapter
 * tidak perlu konversi tanggal di jalur panas. Isi data user hanya ada di `record.blob` (ciphertext);
 * SQLCipher menambah lapisan kedua untuk metadata plaintext (hlc, index rentang).
 */

/** Subset koneksi `expo-sqlite` yang dipakai adapter - tanpa API yang membuka koneksi baru. */
export type SqlConnection = Pick<
  SQLiteDatabase,
  'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync' | 'closeAsync'
>

export const SCHEMA_VERSION = 1

const SCHEMA_V1 = `
CREATE TABLE record (
  id TEXT PRIMARY KEY NOT NULL,
  hlc TEXT NOT NULL,
  deleted INTEGER NOT NULL CHECK (deleted IN (0, 1)),
  blob TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_record_purge ON record (deleted, updated_at_ms);
CREATE INDEX idx_record_hlc ON record (hlc);

CREATE TABLE record_index (
  record_id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL,
  range_start_ms INTEGER,
  range_end_ms INTEGER,
  updated_at_ms INTEGER NOT NULL,
  done_rank INTEGER,
  priority_rank INTEGER
);
CREATE INDEX idx_record_index_type_range ON record_index (entity_type, range_start_ms);
CREATE INDEX idx_record_index_range ON record_index (range_start_ms, range_end_ms);

CREATE TABLE sync_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  record_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('put', 'delete')),
  queued_at_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX idx_outbox_queued ON sync_outbox (queued_at_ms, id);
CREATE INDEX idx_outbox_record ON sync_outbox (record_id);

CREATE TABLE sync_state (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  cursor INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  last_pull_at_ms INTEGER,
  last_push_at_ms INTEGER
);

CREATE TABLE local_key_meta (
  id TEXT PRIMARY KEY NOT NULL,
  slot TEXT NOT NULL UNIQUE,
  kdf_hint TEXT,
  created_at_ms INTEGER NOT NULL,
  last_used_at_ms INTEGER
);

CREATE TABLE sticker_recent (
  sticker_id TEXT PRIMARY KEY NOT NULL,
  used_at_ms INTEGER NOT NULL
);
`

/** Hasil migrasi: `newer` = DB dibuat versi app yang lebih baru; jangan disentuh (data-loss). */
export type MigrationResult = 'ok' | 'newer'

/**
 * Bawa DB ke `SCHEMA_VERSION` dalam satu transaksi (DDL SQLite ikut transaksi).
 *
 * Versi disimpan di `PRAGMA user_version`. DB dari app yang lebih baru tidak di-downgrade: lebih aman
 * menolak membuka daripada menulis dengan skema lama di atas skema baru.
 */
export async function migrateSchema(db: SqlConnection): Promise<MigrationResult> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  const current = row?.user_version ?? 0
  if (current > SCHEMA_VERSION) return 'newer'
  if (current === SCHEMA_VERSION) return 'ok'

  await db.execAsync('BEGIN IMMEDIATE')
  try {
    await db.execAsync(SCHEMA_V1)
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    await db.execAsync('COMMIT')
  } catch (error) {
    await db.execAsync('ROLLBACK').catch(() => undefined)
    throw error
  }
  return 'ok'
}
