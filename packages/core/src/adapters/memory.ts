import type { EntityType, RecordIndexEntry } from '../domain/envelope.ts'
import type {
  Clock,
  KeySlotLocal,
  LocalKeyMeta,
  OutboxFailure,
  OutboxRow,
  RangeQuery,
  RecordWrite,
  StickerRecentEntry,
  StorageAdapter,
  StoredRecord,
  StoredSyncState,
  SyncStatePatch,
  TransactionContext,
} from '../ports.ts'
import { RECORD_INDEX_KEEP } from '../ports.ts'
import {
  compareIndexEntries,
  indexOverlapsRange,
  normalizeQueryRange,
} from '../repository/index-entry.ts'

/**
 * `StorageAdapter` in-memory - adapter test (ARCHITECTURE.md §5, AC T23).
 *
 * Tujuannya bukan "adapter palsu yang gampang" tapi **implementasi kedua** yang memenuhi seluruh
 * kontrak `ports.ts`, sehingga `runStorageAdapterContractTests` bisa dipakai tiga kali: memori,
 * IndexedDB (web), dan SQLite (mobile). Kalau adapter memori melanggar kontrak, suite-nya gagal - dan
 * suite itu yang juga akan dijalankan ke dua adapter asli.
 *
 * Yang sengaja dibuat SAMA dengan adapter asli:
 * - **Transaksi benar-benar atomik.** Tiap `runTransaction` bekerja di atas salinan tabel; perubahan
 *   baru dipindahkan ke tabel nyata setelah `fn` selesai tanpa error. `fn` yang melempar error =
 *   tidak ada satu pun tulisan yang tersisa, persis seperti rollback IndexedDB/SQLite.
 * - **Semua operasi diserialkan** lewat satu antrean. `ports.ts` mewajibkan adapter menyelesaikan
 *   commit konkuren secara serial, karena urutan commit dipakai untuk LWW. Test yang tidak
 *   menunggu `commitRecords` pertama harus tetap mendapat hasil yang sama seperti adapter asli.
 * - **Nilai yang keluar selalu salinan.** Pemanggil yang memutasi hasil baca tidak boleh bisa
 *   mengubah isi "disk" - itu bug yang di IndexedDB/SQLite tidak mungkin terjadi.
 *
 * Yang TIDAK bisa diuji di sini (dan tetap wajib diuji di adapter asli): durability `strict`/`FULL`,
 * lock satu-penulis antar tab, dan perilaku saat crash. Itu properti backend, bukan kontrak.
 */

/** Opsi adapter memori. `clock` wajib supaya `createdAtMs`/`updatedAtMs` deterministik di test. */
export type MemoryStorageOptions = {
  readonly clock: Clock
}

/** Alias nama yang dipakai test adapter asli saat memanggil suite kontrak. */
export type MemoryStorage = StorageAdapter

type MemoryTables = {
  readonly records: Map<string, StoredRecord>
  readonly indexes: Map<string, RecordIndexEntry>
  readonly outbox: Map<string, OutboxRow>
  readonly keyMeta: Map<KeySlotLocal, LocalKeyMeta>
  readonly stickers: Map<string, StickerRecentEntry>
  syncState: StoredSyncState | null
}

function cloneTables(tables: MemoryTables): MemoryTables {
  return {
    records: new Map(tables.records),
    indexes: new Map(tables.indexes),
    outbox: new Map(tables.outbox),
    keyMeta: new Map(tables.keyMeta),
    stickers: new Map(tables.stickers),
    syncState: tables.syncState === null ? null : { ...tables.syncState },
  }
}

function emptyTables(): MemoryTables {
  return {
    records: new Map(),
    indexes: new Map(),
    outbox: new Map(),
    keyMeta: new Map(),
    stickers: new Map(),
    syncState: null,
  }
}

/** Salinan keluar supaya pemanggil tidak bisa memutasi "disk" lewat referensi. */
function copyRecord(record: StoredRecord): StoredRecord {
  return { ...record }
}

function copyIndex(entry: RecordIndexEntry): RecordIndexEntry {
  return { ...entry }
}

function copyOutbox(row: OutboxRow): OutboxRow {
  return { ...row }
}

function applyPutRecord(tables: MemoryTables, write: RecordWrite, clock: Clock): void {
  const previous = tables.records.get(write.sealed.id)
  const nowMs = clock.nowMs()
  const index = write.index

  tables.records.set(write.sealed.id, {
    id: write.sealed.id,
    hlc: write.sealed.hlc,
    deleted: write.sealed.deleted,
    blob: write.sealed.blob,
    createdAtMs: previous?.createdAtMs ?? nowMs,
    // Index yang ditulis bersama record membawa `updatedAtMs` versi data; record tanpa index (dan
    // record `'keep'`, yang index-nya tidak kita sentuh) memakai jam adapter. Keduanya "pembukuan
    // lokal" yang tidak ikut sync (`ports.ts`).
    updatedAtMs: index === null || index === RECORD_INDEX_KEEP ? nowMs : index.updatedAtMs,
  })

  // Index dan record harus selalu sinkron: entitas tanpa dimensi waktu tidak boleh meninggalkan
  // baris index lama yang masih menunjuk ke record-nya. `'keep'` satu-satunya pengecualian: baris
  // index lama DIBIARKAN apa adanya (lihat `ports.ts`), dan kalau belum ada baris index tidak ada
  // yang dibuat - adapter tidak boleh mengarang index.
  if (index === null) {
    tables.indexes.delete(write.sealed.id)
  } else if (index !== RECORD_INDEX_KEEP) {
    tables.indexes.set(write.sealed.id, { ...index, recordId: write.sealed.id })
  }

  tables.outbox.set(write.outbox.id, {
    id: write.outbox.id,
    recordId: write.sealed.id,
    op: write.op,
    queuedAtMs: write.outbox.queuedAtMs,
    attempts: 0,
    lastError: null,
  })
}

/**
 * Bangun ulang satu baris `record_index` (`TransactionContext.putRecordIndex`).
 *
 * Sengaja tidak menulis record dan tidak mengantre baris outbox: index yang belum terbangun tidak
 * berarti datanya berubah, dan hlc record tidak berubah - jadi server tidak butuh kabar apa pun.
 * `recordId` yang tidak ada dilewati supaya index tidak pernah menunjuk record yang tidak bisa dibaca.
 */
function applyPutRecordIndex(
  tables: MemoryTables,
  recordId: string,
  index: RecordIndexEntry | null,
): void {
  if (!tables.records.has(recordId)) return

  if (index === null) {
    tables.indexes.delete(recordId)
    return
  }

  // `recordId` dari argumen yang menang: index harus menunjuk record yang barusan diperiksa ada.
  tables.indexes.set(recordId, { ...index, recordId })
}

function applySyncStatePatch(
  current: StoredSyncState | null,
  patch: SyncStatePatch,
): StoredSyncState {
  const base: StoredSyncState = current ?? {
    // State belum pernah ditulis: `deviceId` kosong sampai `putSyncState` dipanggil shell.
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

export function createMemoryStorage(options: MemoryStorageOptions): StorageAdapter {
  let tables = emptyTables()

  // Satu antrean untuk semua operasi: `ports.ts` mewajibkan commit konkuren diselesaikan serial.
  let tail: Promise<unknown> = Promise.resolve()

  function serialize<T>(work: () => Promise<T> | T): Promise<T> {
    const run = tail.then(work, work)
    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  return {
    runTransaction: <T>(label: string, fn: (tx: TransactionContext) => Promise<T>): Promise<T> =>
      serialize(async () => {
        const draft = cloneTables(tables)

        const tx: TransactionContext = {
          label,
          putRecord: async (write: RecordWrite) => {
            applyPutRecord(draft, write, options.clock)
          },
          putRecordIndex: async (recordId: string, index: RecordIndexEntry | null) => {
            applyPutRecordIndex(draft, recordId, index)
          },
          deleteOutboxRows: async (outboxIds: readonly string[]) => {
            for (const id of outboxIds) draft.outbox.delete(id)
          },
          patchSyncState: async (patch: SyncStatePatch) => {
            draft.syncState = applySyncStatePatch(draft.syncState, patch)
          },
        }

        const result = await fn(tx)

        // Commit: hanya di titik ini perubahan menyentuh tabel nyata.
        tables = draft
        return result
      }),

    getRecord: (id: string) =>
      serialize(() => {
        const record = tables.records.get(id)
        return record === undefined ? null : copyRecord(record)
      }),

    getRecords: (ids: readonly string[]) =>
      serialize(() => {
        const result: StoredRecord[] = []
        for (const id of new Set(ids)) {
          const record = tables.records.get(id)
          if (record !== undefined) result.push(copyRecord(record))
        }
        return result
      }),

    queryByRange: (query: RangeQuery) =>
      serialize(() => {
        // `ports.ts`: query tanpa tipe DAN tanpa rentang = scan penuh - jalur panas dilarang begitu.
        const hasTypes = query.entityTypes !== undefined && query.entityTypes.length > 0
        if (!hasTypes && query.fromMs === undefined && query.toMs === undefined) {
          throw new Error(
            'queryByRange butuh `entityTypes` atau rentang waktu - scan penuh dilarang',
          )
        }

        const range = normalizeQueryRange(query)
        if (range.empty) return []

        const types = hasTypes ? new Set<EntityType>(query.entityTypes) : null

        const matches = [...tables.indexes.values()]
          .filter(
            (entry) =>
              (types === null || types.has(entry.entityType)) &&
              indexOverlapsRange(entry, query.fromMs, query.toMs),
          )
          .sort(compareIndexEntries)

        const result: StoredRecord[] = []
        for (const entry of matches) {
          const record = tables.records.get(entry.recordId)
          if (record === undefined) continue
          if (record.deleted && query.includeDeleted !== true) continue
          result.push(copyRecord(record))
          if (query.limit !== undefined && result.length >= query.limit) break
        }

        return result
      }),

    listIndexByType: (entityType: EntityType) =>
      serialize(() =>
        [...tables.indexes.values()]
          .filter((entry) => entry.entityType === entityType)
          .sort(compareIndexEntries)
          .map(copyIndex),
      ),

    listOutbox: (limit: number) =>
      serialize(() =>
        [...tables.outbox.values()]
          .sort((a, b) =>
            a.queuedAtMs === b.queuedAtMs ? compareIds(a.id, b.id) : a.queuedAtMs - b.queuedAtMs,
          )
          .slice(0, Math.max(0, limit))
          .map(copyOutbox),
      ),

    markOutboxFailure: (id: string, failure: OutboxFailure) =>
      serialize(() => {
        const row = tables.outbox.get(id)
        if (row === undefined) return
        tables.outbox.set(id, { ...row, attempts: row.attempts + 1, lastError: failure.lastError })
      }),

    deleteOutboxRows: (ids: readonly string[]) =>
      serialize(() => {
        for (const id of ids) tables.outbox.delete(id)
      }),

    countOutbox: () => serialize(() => tables.outbox.size),

    getSyncState: () =>
      serialize(() => (tables.syncState === null ? null : { ...tables.syncState })),

    putSyncState: (state: StoredSyncState) =>
      serialize(() => {
        tables.syncState = { ...state }
      }),

    getKeyMeta: (slot: KeySlotLocal) =>
      serialize(() => {
        const meta = tables.keyMeta.get(slot)
        return meta === undefined ? null : { ...meta }
      }),

    putKeyMeta: (meta: LocalKeyMeta) =>
      serialize(() => {
        tables.keyMeta.set(meta.slot, { ...meta })
      }),

    deleteKeyMeta: (slot: KeySlotLocal) =>
      serialize(() => {
        tables.keyMeta.delete(slot)
      }),

    listRecentStickers: (limit: number) =>
      serialize(() =>
        [...tables.stickers.values()]
          .sort((a, b) =>
            a.usedAtMs === b.usedAtMs
              ? compareIds(a.stickerId, b.stickerId)
              : b.usedAtMs - a.usedAtMs,
          )
          .slice(0, Math.max(0, limit))
          .map((entry) => ({ ...entry })),
      ),

    putRecentSticker: (entry: StickerRecentEntry) =>
      serialize(() => {
        tables.stickers.set(entry.stickerId, { ...entry })
      }),

    wipe: () =>
      serialize(() => {
        tables = emptyTables()
      }),
  }
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}
