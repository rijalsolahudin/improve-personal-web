/**
 * Bentuk baris lapisan FISIK (Bagian A `database.dbml`) dalam bentuk yang dipakai core.
 *
 * Ini cuma re-export terpusat supaya `domain/storage.ts` jadi satu tempat yang jelas berbeda dari
 * `domain/entities/*` (payload domain Bagian B). Tipe sebenarnya hidup di `ports.ts` karena hanya
 * adapter platform yang menyentuhnya - core tidak pernah memegang transaction handle.
 */

export type {
  LocalKeyMeta,
  OutboxFailure,
  OutboxRow,
  RangeQuery,
  RecordWrite,
  StoredRecord,
  StoredSyncState,
  StickerRecentEntry,
  SyncStatePatch,
  TransactionContext,
} from '../ports.ts'

export { CURRENT_STATE_KEY, KEY_SLOTS_LOCAL } from '../ports.ts'

export type { KeySlotLocal } from '../ports.ts'

export type { RecordIndexEntry, SyncOp, SyncStatus } from './envelope.ts'

export { SYNC_OPS, SYNC_STATUSES, syncOpSchema, syncStatusSchema } from './envelope.ts'

/** Nama tabel fisik, dipakai adapter untuk pesan error/log yang konsisten. */
export const STORAGE_TABLES = {
  record: 'record',
  recordIndex: 'record_index',
  syncOutbox: 'sync_outbox',
  syncState: 'sync_state',
  localKeyMeta: 'local_key_meta',
  stickerRecent: 'sticker_recent',
} as const

export type StorageTable = (typeof STORAGE_TABLES)[keyof typeof STORAGE_TABLES]
