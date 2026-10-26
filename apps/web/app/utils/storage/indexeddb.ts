import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb'

import { TECH_IDENTITY } from '#shared/tech-identity'

import {
  CURRENT_STATE_KEY,
  STORAGE_TABLES,
  compareIndexEntries,
  indexOverlapsRange,
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

import { RECORD_INDEX_KEEP } from './index-decision'

/**
 * `StorageAdapter` web: IndexedDB (ARCHITECTURE §5, AC T2 & T23).
 *
 * Implementasi ada di sini, bukan di `packages/core`, karena ini batas platform: core cuma memegang
 * portnya. Kontrak yang harus dipenuhi bukan tafsiran - `runStorageAdapterContractTests` di
 * `@improve-personal/core/testing` adalah suite yang sama yang nanti dijalankan ke adapter SQLite
 * mobile, jadi kalau perilaku di sini menyimpang, gagalnya di test yang sama.
 *
 * Aturan §5 yang diterjemahkan di bawah, lengkap dengan alasannya:
 * 1. **Record + index + outbox dalam SATU transaksi** (`runTransaction`). Kalau tidak, crash di
 *    antara keduanya bikin data tersimpan tapi tidak pernah terkirim.
 * 2. **Durability `strict`** - default Chrome sekarang `relaxed`, dan commit terakhir bisa hilang saat
 *    mati listrik/OS crash/disk penuh. Adapter inilah satu-satunya tempat yang tahu, jadi di sini
 *    opsinya dipasang - bukan diharapkan dari default browser.
 * 3. **Dilarang `await` non-IndexedDB di dalam transaksi.** `TransactionContext` sengaja hanya berisi
 *    operasi yang menulis ke transaksi yang sama; tidak ada fetch/timer/crypto di jalur ini.
 * 4. **Satu penulis per origin** lewat Web Locks (`ip-writer`). IndexedDB tidak punya lock antar tab,
 *    jadi dua tab bisa saling menimpa pada pola baca-lalu-tulis (mis. `patchSyncState`).
 *
 * Yang SENGAJA tidak ada di sini: `navigator.storage.persist()` (tugas shell/plugin, §5 butir 6) dan
 * bahan kunci (ada di `SecureKeyStore`, bukan tabel).
 */

/** Nama database default. Satu origin = satu database; test memakai nama sendiri supaya terisolasi. */
export const INDEXED_DB_DATABASE_NAME = TECH_IDENTITY.databasePrefix

/** Versi skema IndexedDB. Naikkan HANYA kalau object store/index berubah, bukan saat entitas berubah. */
const INDEXED_DB_SCHEMA_VERSION = 1

/** Nama lock penulis (ARCHITECTURE §5: "satu penulis per origin di web"). */
const WRITER_LOCK_NAME = TECH_IDENTITY.writerLockName

/**
 * Nama index. Sama dengan nama di `apps/web/docs/database.dbml` Bagian A, supaya reviewer bisa
 * mencocokkan langsung - kecuali tiga penyesuaian yang memang tidak bisa dipetakan apa adanya:
 *
 * - `idx_record_purge` (`deleted, updated_at`) TIDAK dibuat: IndexedDB melarang `boolean` sebagai
 *   kunci index, jadi barisnya tidak akan pernah masuk index ini. Purge di web memakai
 *   `idx_record_hlc`/cursor, bukan index boolean yang diam-diam kosong.
 * - `idx_record_index_type` (index satu kolom `entity_type`) DITAMBAHKAN: di index komposit
 *   `(entity_type, range_start_ms)`, entri dengan `range_start_ms = null` (entitas tanpa dimensi
 *   waktu, mis. `user_prefs`) tidak punya kunci yang sah sehingga hilang dari index - padahal
 *   `listIndexByType` harus mengembalikannya.
 * - `idx_record_index_start` (index satu kolom `range_start_ms`) DITAMBAHKAN: alasan yang sama untuk
 *   query tanpa `entityTypes`. Di index komposit `(range_start_ms, range_end_ms)`, record
 *   bertitik-waktu (`range_end_ms = null` - deadline task, tanggal jurnal) tidak punya kunci yang
 *   sah, jadi query "semua tipe dalam rentang ini" kehilangan hampir semua hasilnya kalau memakai
 *   index itu. Ditemukan lewat suite kontrak, bukan lewat dugaan.
 */
const INDEX_NAMES = {
  recordHlc: 'idx_record_hlc',
  indexTypeRange: 'idx_record_index_type_range',
  indexRange: 'idx_record_index_range',
  indexStart: 'idx_record_index_start',
  indexType: 'idx_record_index_type',
  outboxQueued: 'idx_outbox_queued',
  outboxRecord: 'idx_outbox_record',
  keySlot: 'uq_local_key_slot',
} as const

/**
 * Bentuk baris di disk.
 *
 * Waktu disimpan sebagai `number` epoch-ms (bukan `Date`/`timestamptz` seperti di dbml) supaya bisa
 * dipakai sebagai kunci index dan dibandingkan tanpa konversi - port memakai satuan ms.
 */
type RecordRow = StoredRecord

type IndexRow = RecordIndexEntry

type OutboxStoreRow = OutboxRow

type SyncStateStoreRow = StoredSyncState & { readonly id: string }

type KeyMetaStoreRow = LocalKeyMeta

type StickerStoreRow = StickerRecentEntry

/**
 * Bentuk skema IndexedDB untuk `idb`.
 *
 * Ditulis sebagai type alias (`type`), BUKAN `interface` dan BUKAN `DBSchema & {...}`: `DBSchema`
 * bawaan idb punya index signature `[s: string]: { key; value; indexes? }`, dan meng-intersect
 * dengannya membuat tipe index ikut melebar ke `IDBValidKey` - akibatnya `index('uq_local_key_slot')`
 * kehilangan tipe kuncinya dan `get(slot)` ditolak. Type alias juga yang membuat TS memberi index
 * signature implisit, sehingga skema ini tetap memenuhi constraint `extends DBSchema` di idb.
 */
type LocalDbSchema = {
  record: {
    key: string
    value: RecordRow
    indexes: { [INDEX_NAMES.recordHlc]: string }
  }
  record_index: {
    key: string
    value: IndexRow
    indexes: {
      [INDEX_NAMES.indexTypeRange]: [EntityType, number]
      [INDEX_NAMES.indexRange]: [number, number]
      [INDEX_NAMES.indexStart]: number
      [INDEX_NAMES.indexType]: EntityType
    }
  }
  sync_outbox: {
    key: string
    value: OutboxStoreRow
    indexes: { [INDEX_NAMES.outboxQueued]: number; [INDEX_NAMES.outboxRecord]: string }
  }
  sync_state: { key: string; value: SyncStateStoreRow }
  local_key_meta: {
    key: string
    value: KeyMetaStoreRow
    indexes: { [INDEX_NAMES.keySlot]: KeySlotLocal }
  }
  sticker_recent: { key: string; value: StickerStoreRow }
}

/** Nama store apa pun yang dikenal adapter - dipakai jalur tulis yang tidak butuh tipe sempit. */
type AnyStoreName = keyof LocalDbSchema

/**
 * Runner "satu penulis". Disuntik supaya test tidak butuh Web Locks (node tidak punya), dan supaya
 * perilakunya bisa diperiksa tanpa browser.
 */
export type ExclusiveRunner = <T>(work: () => Promise<T>) => Promise<T>

export type IndexedDbStorageOptions = {
  /** Jam adapter - sama seperti adapter memori, supaya `createdAtMs`/`updatedAtMs` bisa dipatok di test. */
  readonly clock: Clock
  /** Nama database. Test memakai nama unik per kasus supaya tidak saling mewarisi isi. */
  readonly databaseName?: string
  /**
   * Runner lock penulis. Default memakai Web Locks (`navigator.locks`); test menyuntik versi
   * "langsung jalan" karena node tidak punya API itu.
   */
  readonly runExclusive?: ExclusiveRunner
}

const TRANSACTION_STORES = [
  STORAGE_TABLES.record,
  STORAGE_TABLES.recordIndex,
  STORAGE_TABLES.syncOutbox,
  STORAGE_TABLES.syncState,
] as const

const ALL_STORES = [
  STORAGE_TABLES.record,
  STORAGE_TABLES.recordIndex,
  STORAGE_TABLES.syncOutbox,
  STORAGE_TABLES.syncState,
  STORAGE_TABLES.localKeyMeta,
  STORAGE_TABLES.stickerRecent,
] as const

/**
 * Lock penulis berbasis Web Locks.
 *
 * `depth` bukan penghematan: Web Locks TIDAK re-entrant, jadi request kedua dari konteks yang sama
 * akan menunggu lock yang sedang dipegangnya sendiri - deadlock. Konkurensi di dalam satu tab tetap
 * aman tanpa lock karena IndexedDB sendiri menye-rial-kan transaksi `readwrite` pada store yang sama;
 * yang benar-benar butuh lock adalah antar-tab, dan itu tetap dijaga.
 *
 * Kalau Web Locks tidak ada (browser lawas), adapter MENOLAK bekerja alih-alih diam-diam kehilangan
 * jaminan satu-penulis - tanpa lock, dua tab bisa saling menimpa dan tidak ada yang tahu.
 */
export function createWebLocksRunner(lockName: string = WRITER_LOCK_NAME): ExclusiveRunner {
  let depth = 0

  return async <T>(work: () => Promise<T>): Promise<T> => {
    const locks = globalThis.navigator?.locks
    if (locks === undefined) {
      throw new Error(
        `Web Locks API tidak tersedia: adapter IndexedDB butuh lock "${lockName}" supaya tidak ada dua tab yang saling menimpa`,
      )
    }

    if (depth > 0) return work()

    depth += 1
    try {
      return await locks.request(lockName, work)
    } finally {
      depth -= 1
    }
  }
}

function openLocalDatabase(databaseName: string): Promise<IDBPDatabase<LocalDbSchema>> {
  return openDB<LocalDbSchema>(databaseName, INDEXED_DB_SCHEMA_VERSION, {
    upgrade(database) {
      const records = database.createObjectStore(STORAGE_TABLES.record, { keyPath: 'id' })
      records.createIndex(INDEX_NAMES.recordHlc, 'hlc')

      const recordIndex = database.createObjectStore(STORAGE_TABLES.recordIndex, {
        keyPath: 'recordId',
      })
      recordIndex.createIndex(INDEX_NAMES.indexTypeRange, ['entityType', 'rangeStartMs'])
      recordIndex.createIndex(INDEX_NAMES.indexRange, ['rangeStartMs', 'rangeEndMs'])
      recordIndex.createIndex(INDEX_NAMES.indexStart, 'rangeStartMs')
      recordIndex.createIndex(INDEX_NAMES.indexType, 'entityType')

      const outbox = database.createObjectStore(STORAGE_TABLES.syncOutbox, { keyPath: 'id' })
      outbox.createIndex(INDEX_NAMES.outboxQueued, 'queuedAtMs')
      outbox.createIndex(INDEX_NAMES.outboxRecord, 'recordId')

      database.createObjectStore(STORAGE_TABLES.syncState, { keyPath: 'id' })

      const keyMeta = database.createObjectStore(STORAGE_TABLES.localKeyMeta, { keyPath: 'id' })
      // Unik: satu baris per slot (`ports.ts`: `putKeyMeta` menimpa baris slot yang sama).
      keyMeta.createIndex(INDEX_NAMES.keySlot, 'slot', { unique: true })

      database.createObjectStore(STORAGE_TABLES.stickerRecent, { keyPath: 'stickerId' })
    },
  })
}

/** Transaksi tulis: selalu `readwrite` + durability `strict` (aturan §5 butir 4). */
function writeTransaction<TStores extends readonly (keyof LocalDbSchema)[]>(
  database: IDBPDatabase<LocalDbSchema>,
  stores: TStores,
): IDBPTransaction<LocalDbSchema, TStores, 'readwrite'> {
  // `durability: 'strict'` diteruskan ke `IDBDatabase.transaction` - tanpa ini Chrome memakai
  // `relaxed` dan commit terakhir bisa hilang saat listrik mati.
  return database.transaction(stores, 'readwrite', { durability: 'strict' })
}

function emptySyncState(): StoredSyncState {
  return {
    deviceId: '',
    cursor: 0,
    status: 'offline',
    lastPullAtMs: null,
    lastPushAtMs: null,
  }
}

function applySyncStatePatch(
  current: StoredSyncState | null,
  patch: SyncStatePatch,
): StoredSyncState {
  const base = current ?? emptySyncState()

  return {
    deviceId: patch.deviceId ?? base.deviceId,
    cursor: patch.cursor ?? base.cursor,
    status: patch.status ?? base.status,
    lastPullAtMs: patch.lastPullAtMs === undefined ? base.lastPullAtMs : patch.lastPullAtMs,
    lastPushAtMs: patch.lastPushAtMs === undefined ? base.lastPushAtMs : patch.lastPushAtMs,
  }
}

type WriteTx = IDBPTransaction<LocalDbSchema, typeof TRANSACTION_STORES, 'readwrite'>

/**
 * Tulis record + index + baris outbox. Dipanggil HANYA dari dalam `runTransaction` supaya ketiganya
 * ikut transaksi yang sama.
 */
async function putRecordRow(tx: WriteTx, write: RecordWrite, clock: Clock): Promise<void> {
  const records = tx.objectStore(STORAGE_TABLES.record)
  const previous = await records.get(write.sealed.id)
  const nowMs = clock.nowMs()
  // `'keep'` = jangan sentuh `record_index` sama sekali (lihat `storage/index-decision.ts`).
  const index = write.index

  await records.put({
    id: write.sealed.id,
    hlc: write.sealed.hlc,
    deleted: write.sealed.deleted,
    blob: write.sealed.blob,
    // `createdAtMs` dipertahankan dari tulisan pertama: itu pembukuan lokal kapan record masuk,
    // bukan kapan terakhir diubah.
    createdAtMs: previous?.createdAtMs ?? nowMs,
    updatedAtMs: index === null || index === RECORD_INDEX_KEEP ? nowMs : index.updatedAtMs,
  })

  const indexes = tx.objectStore(STORAGE_TABLES.recordIndex)
  if (index === RECORD_INDEX_KEEP) {
    // Index tidak bisa dibangun, tetapi record-nya tetap masuk. Baris index lama DIBIARKAN: menghapus
    // index karena decrypt gagal membuat record hilang dari query/export selamanya (QA T76 B2),
    // sedangkan index basi paling buruk hanya salah menempatkan record di rentang waktu.
  } else if (index === null) {
    // Entitas tanpa dimensi waktu tidak boleh meninggalkan baris index lama yang menunjuk ke record-nya.
    await indexes.delete(write.sealed.id)
  } else {
    await indexes.put({ ...index, recordId: write.sealed.id })
  }

  await tx.objectStore(STORAGE_TABLES.syncOutbox).put({
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
 * Hanya menyentuh `record_index`: `record`/`sync_outbox`/`sync_state` tidak ikut ditulis, karena
 * index yang belum terbangun bukan perubahan data dan server tidak butuh kabar apa pun. Cek
 * keberadaan record memakai `count` (bukan `get`) - transaksi ini tidak butuh isinya, dan id yang
 * tidak ada tidak boleh meninggalkan baris index yatim.
 */
async function putRecordIndexRow(
  tx: WriteTx,
  recordId: string,
  index: RecordIndexEntry | null,
): Promise<void> {
  const records = tx.objectStore(STORAGE_TABLES.record)
  if ((await records.count(recordId)) === 0) return

  const indexes = tx.objectStore(STORAGE_TABLES.recordIndex)
  if (index === null) {
    await indexes.delete(recordId)
    return
  }

  await indexes.put({ ...index, recordId })
}

async function patchSyncStateRow(tx: WriteTx, patch: SyncStatePatch): Promise<void> {
  const store = tx.objectStore(STORAGE_TABLES.syncState)
  const current = await store.get(CURRENT_STATE_KEY)
  await store.put({ id: CURRENT_STATE_KEY, ...applySyncStatePatch(current ?? null, patch) })
}

export function createIndexedDbStorage(options: IndexedDbStorageOptions): IndexedDbStorage {
  const databaseName = options.databaseName ?? INDEXED_DB_DATABASE_NAME
  const runExclusive = options.runExclusive ?? createWebLocksRunner()

  // Dibuka malas (bukan saat factory dipanggil): modul ini boleh di-import di jalur SSR, dan
  // `indexedDB` tidak ada di server.
  let databasePromise: Promise<IDBPDatabase<LocalDbSchema>> | null = null

  function database(): Promise<IDBPDatabase<LocalDbSchema>> {
    databasePromise ??= openLocalDatabase(databaseName)
    return databasePromise
  }

  /**
   * Jalankan satu transaksi tulis tunggal di bawah lock penulis.
   *
   * Store-nya bertipe `AnyStoreName[]` (bukan tuple sempit) supaya helper ini bisa dipakai jalur
   * tulis mana pun tanpa harus menyebut daftar store-nya sebagai literal - `runTransaction` yang
   * butuh tipe sempit membuka transaksinya sendiri di bawah.
   */
  async function write<T>(
    stores: readonly AnyStoreName[],
    work: (tx: IDBPTransaction<LocalDbSchema, AnyStoreName[], 'readwrite'>) => Promise<T>,
  ): Promise<T> {
    return runExclusive(async () => {
      const db = await database()
      const tx = db.transaction([...stores], 'readwrite', { durability: 'strict' })
      try {
        const result = await work(tx)
        await tx.done
        return result
      } catch (error) {
        tx.abort()
        // `done` akan menolak karena abort; ditelan di sini supaya tidak jadi unhandled rejection.
        await tx.done.catch(() => undefined)
        throw error
      }
    })
  }

  return {
    runTransaction: <T>(label: string, fn: (tx: TransactionContext) => Promise<T>): Promise<T> =>
      runExclusive(async () => {
        const db = await database()
        const tx = writeTransaction(db, TRANSACTION_STORES)

        const context: TransactionContext = {
          label,
          putRecord: (write: RecordWrite) => putRecordRow(tx, write, options.clock),
          putRecordIndex: (recordId: string, index: RecordIndexEntry | null) =>
            putRecordIndexRow(tx, recordId, index),
          deleteOutboxRows: async (outboxIds: readonly string[]) => {
            const store = tx.objectStore(STORAGE_TABLES.syncOutbox)
            for (const id of outboxIds) await store.delete(id)
          },
          patchSyncState: (patch: SyncStatePatch) => patchSyncStateRow(tx, patch),
        }

        try {
          const result = await fn(context)
          await tx.done
          return result
        } catch (error) {
          // Rollback: `fn` melempar = tidak ada satu pun tulisan yang tersisa (kontrak `ports.ts`).
          tx.abort()
          await tx.done.catch(() => undefined)
          throw error
        }
      }),

    async getRecord(id: string): Promise<StoredRecord | null> {
      const db = await database()
      return (await db.get(STORAGE_TABLES.record, id)) ?? null
    },

    /**
     * Pembersihan tombstone lama (task #109) - lihat `TombstoneMaintenance`.
     *
     * Scan penuh disengaja: ini aksi pemeliharaan yang dipicu user, bukan jalur panas, dan
     * `record` tidak punya index `deleted` (IndexedDB melarang boolean sebagai kunci index).
     */
    async purgeTombstones(cutoffMs: number): Promise<number> {
      return runExclusive(async () => {
        const db = await database()
        const tx = db.transaction(
          [STORAGE_TABLES.record, STORAGE_TABLES.recordIndex, STORAGE_TABLES.syncOutbox],
          'readwrite',
          { durability: 'strict' },
        )

        const records = tx.objectStore(STORAGE_TABLES.record)
        const indexes = tx.objectStore(STORAGE_TABLES.recordIndex)
        const outbox = tx.objectStore(STORAGE_TABLES.syncOutbox)

        let purged = 0
        let cursor = await records.openCursor()

        while (cursor) {
          const row = cursor.value

          if (row.deleted && row.updatedAtMs < cutoffMs) {
            // Tombstone yang belum terkirim WAJIB dipertahankan: dialah satu-satunya bukti record
            // harus dihapus juga di server.
            const pending = await outbox.index(INDEX_NAMES.outboxRecord).count(row.id)

            if (pending === 0) {
              await cursor.delete()
              await indexes.delete(row.id)
              purged += 1
            }
          }

          cursor = await cursor.continue()
        }

        await tx.done
        return purged
      })
    },

    async getRecords(ids: readonly string[]): Promise<readonly StoredRecord[]> {
      const db = await database()
      const tx = db.transaction(STORAGE_TABLES.record, 'readonly')
      const store = tx.objectStore(STORAGE_TABLES.record)
      const result: StoredRecord[] = []

      for (const id of new Set(ids)) {
        const row = await store.get(id)
        if (row !== undefined) result.push(row)
      }

      return result
    },

    async queryByRange(query: RangeQuery): Promise<readonly StoredRecord[]> {
      const db = await database()
      const types = query.entityTypes ?? []

      // `ports.ts`: query tanpa tipe DAN tanpa rentang = scan penuh - jalur panas dilarang begitu.
      if (types.length === 0 && query.fromMs === undefined && query.toMs === undefined) {
        throw new Error('queryByRange butuh `entityTypes` atau rentang waktu - scan penuh dilarang')
      }

      const range = normalizeQueryRange(query)
      if (range.empty) return []

      const entries = await readIndexEntries(db, types, query)

      const matches = entries
        .filter((entry) => indexOverlapsRange(entry, query.fromMs, query.toMs))
        .sort(compareIndexEntries)

      const records = db
        .transaction(STORAGE_TABLES.record, 'readonly')
        .objectStore(STORAGE_TABLES.record)
      const result: StoredRecord[] = []

      for (const entry of matches) {
        const row = await records.get(entry.recordId)
        if (row === undefined) continue
        if (row.deleted && query.includeDeleted !== true) continue
        result.push(row)
        if (query.limit !== undefined && result.length >= query.limit) break
      }

      return result
    },

    async listIndexByType(entityType: EntityType): Promise<readonly RecordIndexEntry[]> {
      const db = await database()
      const rows = await db.getAllFromIndex(
        STORAGE_TABLES.recordIndex,
        INDEX_NAMES.indexType,
        IDBKeyRange.only(entityType),
      )
      return rows.sort(compareIndexEntries)
    },

    async listOutbox(limit: number): Promise<readonly OutboxRow[]> {
      const db = await database()
      // Index `queued_at` sudah mengurutkan; entri berkunci sama diurutkan IndexedDB berdasarkan
      // primary key (`id`), sama dengan tie-break yang dipakai adapter memori.
      const rows = await db.getAllFromIndex(STORAGE_TABLES.syncOutbox, INDEX_NAMES.outboxQueued)
      return rows.slice(0, Math.max(0, limit))
    },

    async markOutboxFailure(id: string, failure: OutboxFailure): Promise<void> {
      await write([STORAGE_TABLES.syncOutbox], async (tx) => {
        const store = tx.objectStore(STORAGE_TABLES.syncOutbox)
        const row = await store.get(id)
        if (row === undefined) return
        await store.put({ ...row, attempts: row.attempts + 1, lastError: failure.lastError })
      })
    },

    async deleteOutboxRows(ids: readonly string[]): Promise<void> {
      await write([STORAGE_TABLES.syncOutbox], async (tx) => {
        const store = tx.objectStore(STORAGE_TABLES.syncOutbox)
        for (const id of ids) await store.delete(id)
      })
    },

    async countOutbox(): Promise<number> {
      const db = await database()
      return db.count(STORAGE_TABLES.syncOutbox)
    },

    async getSyncState(): Promise<StoredSyncState | null> {
      const db = await database()
      const row = await db.get(STORAGE_TABLES.syncState, CURRENT_STATE_KEY)
      if (row === undefined) return null

      const { id: _id, ...state } = row
      return state
    },

    async putSyncState(state: StoredSyncState): Promise<void> {
      await write([STORAGE_TABLES.syncState], async (tx) => {
        await tx.objectStore(STORAGE_TABLES.syncState).put({ id: CURRENT_STATE_KEY, ...state })
      })
    },

    async getKeyMeta(slot: KeySlotLocal): Promise<LocalKeyMeta | null> {
      const db = await database()
      return (await db.getFromIndex(STORAGE_TABLES.localKeyMeta, INDEX_NAMES.keySlot, slot)) ?? null
    },

    async putKeyMeta(meta: LocalKeyMeta): Promise<void> {
      await write([STORAGE_TABLES.localKeyMeta], async (tx) => {
        const store = tx.objectStore(STORAGE_TABLES.localKeyMeta)
        // Baris lama untuk slot yang sama dibuang dulu: index `slot` unik, jadi `put` tanpa ini
        // akan ditolak ConstraintError - dan kontraknya adalah "menimpa", bukan "gagal".
        const previous = await store.index(INDEX_NAMES.keySlot).get(meta.slot)
        if (previous !== undefined && previous.id !== meta.id) await store.delete(previous.id)
        await store.put(meta)
      })
    },

    async deleteKeyMeta(slot: KeySlotLocal): Promise<void> {
      await write([STORAGE_TABLES.localKeyMeta], async (tx) => {
        const store = tx.objectStore(STORAGE_TABLES.localKeyMeta)
        const previous = await store.index(INDEX_NAMES.keySlot).get(slot)
        if (previous !== undefined) await store.delete(previous.id)
      })
    },

    async listRecentStickers(limit: number): Promise<readonly StickerRecentEntry[]> {
      const db = await database()
      const rows = await db.getAll(STORAGE_TABLES.stickerRecent)
      return rows
        .sort((a, b) =>
          a.usedAtMs === b.usedAtMs
            ? compareIds(a.stickerId, b.stickerId)
            : b.usedAtMs - a.usedAtMs,
        )
        .slice(0, Math.max(0, limit))
    },

    async putRecentSticker(entry: StickerRecentEntry): Promise<void> {
      await write([STORAGE_TABLES.stickerRecent], async (tx) => {
        await tx.objectStore(STORAGE_TABLES.stickerRecent).put(entry)
      })
    },

    async wipe(): Promise<void> {
      await runExclusive(async () => {
        const db = await database()
        const tx = writeTransaction(db, ALL_STORES)
        await Promise.all(ALL_STORES.map((store) => tx.objectStore(store).clear()))
        await tx.done
      })
    },
  }
}

/**
 * Ambil kandidat dari `record_index` - bukan dari `record`, supaya jalur panas tidak pernah mendekripsi
 * apa pun (§6). Kunci rentang dipakai kalau memang bisa mempersempit; sisanya difilter di memori
 * memakai helper yang sama dengan adapter SQLite.
 */
async function readIndexEntries(
  db: IDBPDatabase<LocalDbSchema>,
  types: readonly EntityType[],
  query: RangeQuery,
): Promise<readonly RecordIndexEntry[]> {
  const indexStore = db
    .transaction(STORAGE_TABLES.recordIndex, 'readonly')
    .objectStore(STORAGE_TABLES.recordIndex)

  if (types.length === 0) {
    // Query tanpa tipe: pakai index satu kolom `range_start_ms`. Index komposit
    // `(range_start_ms, range_end_ms)` TIDAK bisa dipakai di sini - record bertitik-waktu punya
    // `range_end_ms = null`, dan `null` bukan kunci IndexedDB yang sah, jadi barisnya hilang dari
    // index itu. Entri tanpa dimensi waktu aman untuk dikecualikan: query ini selalu punya rentang,
    // dan `indexOverlapsRange` memang tidak pernah mencocokkan `range_start_ms = null` dengan rentang.
    const upper = query.toMs ?? Number.POSITIVE_INFINITY
    return indexStore.index(INDEX_NAMES.indexStart).getAll(IDBKeyRange.upperBound(upper))
  }

  const collected: RecordIndexEntry[] = []
  for (const type of types) {
    const rows =
      query.toMs === undefined
        ? // Tanpa batas atas, index `(entity_type, range_start_ms)` tidak bisa dipakai untuk
          // mempersempit - dan entri ber-`range_start_ms` null pun tidak ada di index itu.
          await indexStore.index(INDEX_NAMES.indexType).getAll(IDBKeyRange.only(type))
        : await indexStore
            .index(INDEX_NAMES.indexTypeRange)
            .getAll(IDBKeyRange.bound([type, Number.NEGATIVE_INFINITY], [type, query.toMs]))
    collected.push(...rows)
  }

  return collected
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/** Dipakai test & shell untuk tipe `SyncOp`/`SyncStatus` tanpa impor tambahan dari core. */
export type { SyncOp, SyncStatus }

/** Alias tipe eksplisit: adapter ini memenuhi `StorageAdapter` (dicek `satisfies` di test). */
export type IndexedDbStorage = StorageAdapter & TombstoneMaintenance

/**
 * Kemampuan khas IndexedDB yang tidak ada di port `StorageAdapter`: pembersihan tombstone fisik.
 *
 * Port sengaja tidak memuat operasi hapus fisik (kontrak core hanya kenal tombstone, karena hapus
 * harus ikut tersinkron). Pemeliharaan ruang adalah urusan shell web, jadi kemampuannya ditambahkan
 * di sini dan dideteksi lewat type guard di `compaction.ts`.
 */
export type TombstoneMaintenance = {
  /**
   * Hapus permanen tombstone yang `updatedAtMs < cutoffMs` DAN tidak punya baris outbox pending.
   *
   * Syarat outbox itu yang membuat operasi ini aman: tombstone yang belum terkirim adalah SATU-SATUNYA
   * bukti bahwa record harus dihapus di server. Kalau dibuang sebelum push, record hidup kembali saat
   * pull berikutnya.
   */
  purgeTombstones(cutoffMs: number): Promise<number>
}
