import {
  CURRENT_STATE_KEY,
  normalizeQueryRange,
  type Clock,
  type EntityType,
  type KeySlotLocal,
  type LocalKeyMeta,
  type OutboxFailure,
  type OutboxRow,
  type RangeQuery,
  type RecordIndexEntry,
  type RecordWrite,
  type StickerRecentEntry,
  type StorageAdapter,
  type StoredRecord,
  type StoredSyncState,
  type SyncOp,
  type SyncStatePatch,
  type SyncStatus,
  type TransactionContext,
} from '@improve-personal/core'
import type { SQLiteBindValue } from 'expo-sqlite'

import type { SqlConnection } from './schema'

/**
 * `StorageAdapter` di atas SQLite + SQLCipher (ARCHITECTURE.md §5, AC T23).
 *
 * Satu koneksi, satu antrean: semua operasi (baca juga) diserialkan. Transaksi memakai
 * `BEGIN IMMEDIATE` manual di koneksi yang sama karena `withExclusiveTransactionAsync` membuka
 * koneksi baru - koneksi itu tidak membawa `PRAGMA key`, jadi tidak bisa membaca DB terenkripsi.
 * Akibatnya operasi lain tidak boleh menyelip di tengah transaksi; antrean yang menjaminnya.
 *
 * Konsekuensi untuk pemanggil (sama dengan adapter memori): di dalam `runTransaction`, jangan
 * memanggil metode `StorageAdapter` lain - pakai `tx`. Panggilan luar akan menunggu transaksi
 * selesai, dan transaksi menunggu panggilan itu (deadlock).
 */

export type SqliteStorageOptions = {
  /** Koneksi yang SUDAH lolos `openEncryptedDatabase` (kunci, cipher, durability, skema). */
  readonly db: SqlConnection
  readonly clock: Clock
}

/** Batas parameter per `IN (...)`; jauh di bawah `SQLITE_MAX_VARIABLE_NUMBER`. */
const MAX_IN_PARAMS = 500

/** `LIMIT -1` = tanpa batas di SQLite. */
const NO_LIMIT = -1

type RecordRow = {
  id: string
  hlc: string
  deleted: number
  blob: string
  created_at_ms: number
  updated_at_ms: number
}

type IndexRow = {
  record_id: string
  entity_type: string
  range_start_ms: number | null
  range_end_ms: number | null
  updated_at_ms: number
  done_rank: number | null
  priority_rank: number | null
}

type OutboxDbRow = {
  id: string
  record_id: string
  op: string
  queued_at_ms: number
  attempts: number
  last_error: string | null
}

type SyncStateRow = {
  device_id: string
  cursor: number
  status: string
  last_pull_at_ms: number | null
  last_push_at_ms: number | null
}

type KeyMetaRow = {
  id: string
  slot: string
  kdf_hint: string | null
  created_at_ms: number
  last_used_at_ms: number | null
}

type StickerRow = { sticker_id: string; used_at_ms: number }

const RECORD_COLUMNS = 'r.id, r.hlc, r.deleted, r.blob, r.created_at_ms, r.updated_at_ms'

// Nilai kolom enum hanya pernah ditulis adapter ini dari tipe core, jadi cast di bawah tidak menerima
// input luar. Skema membatasi `op` dengan CHECK.
function toRecord(row: RecordRow): StoredRecord {
  return {
    id: row.id,
    hlc: row.hlc,
    deleted: row.deleted === 1,
    blob: row.blob,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  }
}

function toIndexEntry(row: IndexRow): RecordIndexEntry {
  return {
    recordId: row.record_id,
    entityType: row.entity_type as EntityType,
    rangeStartMs: row.range_start_ms,
    rangeEndMs: row.range_end_ms,
    updatedAtMs: row.updated_at_ms,
    ...(row.done_rank === null ? {} : { doneRank: row.done_rank as 0 | 1 }),
    ...(row.priority_rank === null ? {} : { priorityRank: row.priority_rank as 0 | 1 | 2 }),
  }
}

function toOutboxRow(row: OutboxDbRow): OutboxRow {
  return {
    id: row.id,
    recordId: row.record_id,
    op: row.op as SyncOp,
    queuedAtMs: row.queued_at_ms,
    attempts: row.attempts,
    lastError: row.last_error,
  }
}

function toSyncState(row: SyncStateRow): StoredSyncState {
  return {
    deviceId: row.device_id,
    cursor: row.cursor,
    status: row.status as SyncStatus,
    lastPullAtMs: row.last_pull_at_ms,
    lastPushAtMs: row.last_push_at_ms,
  }
}

function placeholders(count: number): string {
  return new Array<string>(count).fill('?').join(', ')
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

function indexParams(recordId: string, index: RecordIndexEntry): SQLiteBindValue[] {
  return [
    recordId,
    index.entityType,
    index.rangeStartMs,
    index.rangeEndMs,
    index.updatedAtMs,
    index.doneRank ?? null,
    index.priorityRank ?? null,
  ]
}

const UPSERT_INDEX_SQL = `INSERT OR REPLACE INTO record_index
  (record_id, entity_type, range_start_ms, range_end_ms, updated_at_ms, done_rank, priority_rank)
  VALUES (?, ?, ?, ?, ?, ?, ?)`

async function readSyncState(db: SqlConnection): Promise<StoredSyncState | null> {
  const row = await db.getFirstAsync<SyncStateRow>(
    'SELECT device_id, cursor, status, last_pull_at_ms, last_push_at_ms FROM sync_state WHERE id = ?',
    [CURRENT_STATE_KEY],
  )
  return row === null ? null : toSyncState(row)
}

async function writeSyncState(db: SqlConnection, state: StoredSyncState): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_state
      (id, device_id, cursor, status, last_pull_at_ms, last_push_at_ms) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      CURRENT_STATE_KEY,
      state.deviceId,
      state.cursor,
      state.status,
      state.lastPullAtMs,
      state.lastPushAtMs,
    ],
  )
}

/** `BEGIN IMMEDIATE` .. `COMMIT`; error apa pun = `ROLLBACK` lalu error aslinya dilempar ulang. */
async function inTransaction<T>(db: SqlConnection, work: () => Promise<T>): Promise<T> {
  await db.execAsync('BEGIN IMMEDIATE')
  try {
    const result = await work()
    await db.execAsync('COMMIT')
    return result
  } catch (error) {
    await db.execAsync('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function deleteOutbox(db: SqlConnection, ids: readonly string[]): Promise<void> {
  for (const part of chunk(ids, MAX_IN_PARAMS)) {
    await db.runAsync(`DELETE FROM sync_outbox WHERE id IN (${placeholders(part.length)})`, part)
  }
}

function mergeSyncState(current: StoredSyncState | null, patch: SyncStatePatch): StoredSyncState {
  // Sama dengan adapter memori: `deviceId` kosong sampai shell memanggil `putSyncState`.
  const base: StoredSyncState = current ?? {
    deviceId: '',
    cursor: 0,
    status: 'offline',
    lastPullAtMs: null,
    lastPushAtMs: null,
  }
  return {
    deviceId: patch.deviceId ?? base.deviceId,
    cursor: patch.cursor ?? base.cursor,
    status: patch.status ?? base.status,
    lastPullAtMs: patch.lastPullAtMs === undefined ? base.lastPullAtMs : patch.lastPullAtMs,
    lastPushAtMs: patch.lastPushAtMs === undefined ? base.lastPushAtMs : patch.lastPushAtMs,
  }
}

function createTransactionContext(
  db: SqlConnection,
  clock: Clock,
  label: string,
  isOpen: () => boolean,
): TransactionContext {
  // Operasi setelah transaksi selesai akan menulis di luar transaksi - tolak, jangan diam-diam.
  function guard(): void {
    if (!isOpen()) throw new Error('TransactionContext dipakai setelah transaksi selesai')
  }

  return {
    label,
    putRecord: async (write: RecordWrite) => {
      guard()
      const nowMs = clock.nowMs()
      const { sealed, index } = write
      await db.runAsync(
        `INSERT INTO record (id, hlc, deleted, blob, created_at_ms, updated_at_ms)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            hlc = excluded.hlc, deleted = excluded.deleted, blob = excluded.blob,
            updated_at_ms = excluded.updated_at_ms`,
        [
          sealed.id,
          sealed.hlc,
          sealed.deleted ? 1 : 0,
          sealed.blob,
          nowMs,
          index === null ? nowMs : index.updatedAtMs,
        ],
      )
      if (index === null) {
        await db.runAsync('DELETE FROM record_index WHERE record_id = ?', [sealed.id])
      } else {
        await db.runAsync(UPSERT_INDEX_SQL, indexParams(sealed.id, index))
      }
      await db.runAsync(
        `INSERT OR REPLACE INTO sync_outbox (id, record_id, op, queued_at_ms, attempts, last_error)
          VALUES (?, ?, ?, ?, 0, NULL)`,
        [write.outbox.id, sealed.id, write.op, write.outbox.queuedAtMs],
      )
    },
    putRecordIndex: async (recordId: string, index: RecordIndexEntry | null) => {
      guard()
      if (index === null) {
        await db.runAsync('DELETE FROM record_index WHERE record_id = ?', [recordId])
        return
      }
      // Index yatim dilarang: hanya ditulis kalau record-nya ada (ports.ts `putRecordIndex`).
      const exists = await db.getFirstAsync('SELECT 1 AS found FROM record WHERE id = ?', [
        recordId,
      ])
      if (exists === null) return
      await db.runAsync(UPSERT_INDEX_SQL, indexParams(recordId, index))
    },
    deleteOutboxRows: async (outboxIds: readonly string[]) => {
      guard()
      await deleteOutbox(db, outboxIds)
    },
    patchSyncState: async (patch: SyncStatePatch) => {
      guard()
      await writeSyncState(db, mergeSyncState(await readSyncState(db), patch))
    },
  }
}

export function createSqliteStorage(options: SqliteStorageOptions): StorageAdapter {
  const { db, clock } = options

  // ports.ts: commit konkuren wajib diselesaikan serial. Baca ikut antrean karena satu koneksi.
  let tail: Promise<unknown> = Promise.resolve()

  function serialize<T>(work: () => Promise<T>): Promise<T> {
    const run = tail.then(work, work)
    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  return {
    runTransaction: <T>(label: string, fn: (tx: TransactionContext) => Promise<T>) =>
      serialize(async () => {
        let isOpen = true
        try {
          return await inTransaction(db, () =>
            fn(createTransactionContext(db, clock, label, () => isOpen)),
          )
        } finally {
          isOpen = false
        }
      }),

    getRecord: (id: string) =>
      serialize(async () => {
        const row = await db.getFirstAsync<RecordRow>(
          `SELECT ${RECORD_COLUMNS} FROM record r WHERE r.id = ?`,
          [id],
        )
        return row === null ? null : toRecord(row)
      }),

    getRecords: (ids: readonly string[]) =>
      serialize(async () => {
        const result: StoredRecord[] = []
        for (const part of chunk([...new Set(ids)], MAX_IN_PARAMS)) {
          const rows = await db.getAllAsync<RecordRow>(
            `SELECT ${RECORD_COLUMNS} FROM record r WHERE r.id IN (${placeholders(part.length)})`,
            part,
          )
          for (const row of rows) result.push(toRecord(row))
        }
        return result
      }),

    queryByRange: (query: RangeQuery) =>
      serialize(async () => {
        const types = query.entityTypes ?? []
        if (types.length === 0 && query.fromMs === undefined && query.toMs === undefined) {
          throw new Error(
            'queryByRange butuh `entityTypes` atau rentang waktu - scan penuh dilarang',
          )
        }
        const range = normalizeQueryRange(query)
        if (range.empty) return []

        // Semantik sama dengan `indexOverlapsRange` core, tapi dievaluasi lewat index SQLite.
        const where: string[] = []
        const params: SQLiteBindValue[] = []
        if (types.length > 0) {
          where.push(`i.entity_type IN (${placeholders(types.length)})`)
          params.push(...types)
        }
        if (range.fromMs !== undefined || range.toMs !== undefined) {
          where.push('i.range_start_ms IS NOT NULL')
        }
        if (range.fromMs !== undefined) {
          where.push('COALESCE(i.range_end_ms, i.range_start_ms) >= ?')
          params.push(range.fromMs)
        }
        if (range.toMs !== undefined) {
          where.push('i.range_start_ms <= ?')
          params.push(range.toMs)
        }
        if (query.includeDeleted !== true) where.push('r.deleted = 0')
        params.push(query.limit === undefined ? NO_LIMIT : Math.max(0, query.limit))

        const rows = await db.getAllAsync<RecordRow>(
          `SELECT ${RECORD_COLUMNS} FROM record_index i JOIN record r ON r.id = i.record_id
            WHERE ${where.join(' AND ')}
            ORDER BY i.range_start_ms, i.record_id LIMIT ?`,
          params,
        )
        return rows.map(toRecord)
      }),

    listIndexByType: (entityType: EntityType) =>
      serialize(async () => {
        const rows = await db.getAllAsync<IndexRow>(
          `SELECT record_id, entity_type, range_start_ms, range_end_ms, updated_at_ms, done_rank,
              priority_rank
            FROM record_index WHERE entity_type = ? ORDER BY range_start_ms, record_id`,
          [entityType],
        )
        return rows.map(toIndexEntry)
      }),

    listOutbox: (limit: number) =>
      serialize(async () => {
        const rows = await db.getAllAsync<OutboxDbRow>(
          `SELECT id, record_id, op, queued_at_ms, attempts, last_error FROM sync_outbox
            ORDER BY queued_at_ms, id LIMIT ?`,
          [Math.max(0, limit)],
        )
        return rows.map(toOutboxRow)
      }),

    markOutboxFailure: (id: string, failure: OutboxFailure) =>
      serialize(async () => {
        await db.runAsync(
          'UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?',
          [failure.lastError, id],
        )
      }),

    deleteOutboxRows: (ids: readonly string[]) => serialize(() => deleteOutbox(db, ids)),

    countOutbox: () =>
      serialize(async () => {
        const row = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM sync_outbox')
        return row?.n ?? 0
      }),

    getSyncState: () => serialize(() => readSyncState(db)),

    putSyncState: (state: StoredSyncState) => serialize(() => writeSyncState(db, state)),

    getKeyMeta: (slot: KeySlotLocal) =>
      serialize(async () => {
        const row = await db.getFirstAsync<KeyMetaRow>(
          `SELECT id, slot, kdf_hint, created_at_ms, last_used_at_ms FROM local_key_meta
            WHERE slot = ?`,
          [slot],
        )
        if (row === null) return null
        return {
          id: row.id,
          slot: row.slot as KeySlotLocal,
          kdfHint: row.kdf_hint,
          createdAtMs: row.created_at_ms,
          lastUsedAtMs: row.last_used_at_ms,
        }
      }),

    putKeyMeta: (meta: LocalKeyMeta) =>
      serialize(async () => {
        // REPLACE membuang baris lama yang bentrok di `slot` (UNIQUE) maupun `id`: satu baris per slot.
        await db.runAsync(
          `INSERT OR REPLACE INTO local_key_meta (id, slot, kdf_hint, created_at_ms, last_used_at_ms)
            VALUES (?, ?, ?, ?, ?)`,
          [meta.id, meta.slot, meta.kdfHint, meta.createdAtMs, meta.lastUsedAtMs],
        )
      }),

    deleteKeyMeta: (slot: KeySlotLocal) =>
      serialize(async () => {
        await db.runAsync('DELETE FROM local_key_meta WHERE slot = ?', [slot])
      }),

    listRecentStickers: (limit: number) =>
      serialize(async () => {
        const rows = await db.getAllAsync<StickerRow>(
          `SELECT sticker_id, used_at_ms FROM sticker_recent
            ORDER BY used_at_ms DESC, sticker_id LIMIT ?`,
          [Math.max(0, limit)],
        )
        return rows.map((row): StickerRecentEntry => ({
          stickerId: row.sticker_id,
          usedAtMs: row.used_at_ms,
        }))
      }),

    putRecentSticker: (entry: StickerRecentEntry) =>
      serialize(async () => {
        await db.runAsync(
          'INSERT OR REPLACE INTO sticker_recent (sticker_id, used_at_ms) VALUES (?, ?)',
          [entry.stickerId, entry.usedAtMs],
        )
      }),

    wipe: () =>
      serialize(async () => {
        await inTransaction(db, () =>
          db.execAsync(`DELETE FROM record_index; DELETE FROM record; DELETE FROM sync_outbox;
            DELETE FROM sync_state; DELETE FROM local_key_meta; DELETE FROM sticker_recent;`),
        )
      }),
  }
}
