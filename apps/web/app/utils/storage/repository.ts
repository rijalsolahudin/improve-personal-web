import {
  buildRecordWrite,
  commitLocalWrite,
  type CryptoProvider,
  type EntityType,
  type EntityRecord,
  type OutboxIntent,
  type RangeIndexInput,
  type RangeQuerySpec,
  type Repository,
  type RepositorySet,
  type SaveRecordInput,
  type SecureKeyMaterial,
  type StorageAdapter,
} from '@improve-personal/core'

import { decodeRecord } from './record-codec'

/**
 * Repository web: satu-satunya pintu fitur ke data (AC T2).
 *
 * Pemisahan tanggung jawabnya mengikuti `repository/types.ts` di core:
 * - **Repository** bekerja pada baris fisik (`record` + `record_index` + outbox) dan hanya tahu
 *   membaca (dekripsi + validasi + migrasi lewat `record-codec.ts`).
 * - **Penulisan** memakai `record-writer.ts`: `save`/`softDelete` di sini menerima `blob` yang SUDAH
 *   tersegel, karena mengenkripsi adalah tugas lapisan use case - itu yang membuat repository bisa
 *   diuji tanpa kripto sama sekali.
 *
 * Aturan yang dipegang:
 * - Query jalur panas lewat index (`listByRange`) - tidak pernah memindai seluruh tabel lalu
 *   mendekripsi semuanya.
 * - Tombstone tidak dianggap data: `getById` mengembalikan `null`, dan hanya `listAll` yang
 *   menampilkannya (dipakai export F10 & migrasi).
 * - Record dengan tipe LAIN ditolak dengan pesan jelas, bukan dikembalikan sebagai data tipe ini.
 */

export type RepositoryDeps = {
  readonly storage: StorageAdapter
  readonly provider: CryptoProvider
  readonly dataKey: SecureKeyMaterial
}

export function createRepository<T>(deps: RepositoryDeps, entityType: EntityType): Repository<T> {
  async function toEntityRecord(id: string): Promise<EntityRecord<T> | null> {
    const stored = await deps.storage.getRecord(id)
    if (stored === null) return null

    const record = await decodeRecord(deps.provider, deps.dataKey, stored)

    if (record.type !== entityType) {
      throw new Error(`record ${id} bertipe "${record.type}", bukan "${entityType}"`)
    }

    return record as EntityRecord<T>
  }

  return {
    entityType,

    async getById(id: string): Promise<EntityRecord<T> | null> {
      const record = await toEntityRecord(id)

      // Tombstone bukan data bagi UI; `listAll` yang menyediakannya untuk export/migrasi.
      if (record === null || record.deleted) return null
      return record
    },

    async getManyById(ids: readonly string[]): Promise<readonly EntityRecord<T>[]> {
      const stored = await deps.storage.getRecords([...new Set(ids)])
      const records: EntityRecord<T>[] = []

      for (const row of stored) {
        if (row.deleted) continue
        const record = await decodeRecord(deps.provider, deps.dataKey, row)
        if (record.type !== entityType) continue
        records.push(record as EntityRecord<T>)
      }

      return records
    },

    async listByRange(query: RangeQuerySpec): Promise<readonly EntityRecord<T>[]> {
      const rows = await deps.storage.queryByRange({
        entityTypes: [entityType],
        fromMs: query.fromMs,
        toMs: query.toMs,
        includeDeleted: query.includeDeleted ?? false,
        limit: query.limit,
      })

      const records: EntityRecord<T>[] = []
      for (const row of rows) {
        const record = await decodeRecord(deps.provider, deps.dataKey, row)
        if (record.type !== entityType) continue
        records.push(record as EntityRecord<T>)
      }

      // Adapter mengurutkan naik berdasarkan `range_start_ms`; urutan turun cukup dibalik di sini -
      // bukan dengan query kedua, yang cuma menggandakan pembacaan index yang sama.
      return query.order === 'desc' ? records.reverse() : records
    },

    async save(input: SaveRecordInput): Promise<void> {
      await writeSealed(deps, {
        id: input.id,
        hlc: input.hlc,
        deleted: input.deleted,
        blob: input.blob,
        index: input.index,
        outbox: input.outbox,
      })
    },

    async softDelete(input: {
      readonly id: string
      readonly hlc: string
      readonly blob: string
      readonly index: RangeIndexInput | null
      readonly outbox: OutboxIntent
    }): Promise<void> {
      await writeSealed(deps, { ...input, deleted: true })
    },

    async listAll(options?: {
      readonly includeDeleted?: boolean
    }): Promise<readonly EntityRecord<T>[]> {
      // Id diambil dari `record_index` (satu query index), bukan dari memindai tabel record.
      const entries = await deps.storage.listIndexByType(entityType)
      const stored = await deps.storage.getRecords(entries.map((entry) => entry.recordId))

      const records: EntityRecord<T>[] = []
      for (const row of stored) {
        if (row.deleted && options?.includeDeleted === false) continue
        const record = await decodeRecord(deps.provider, deps.dataKey, row)
        if (record.type !== entityType) continue
        records.push(record as EntityRecord<T>)
      }

      return records
    },
  }
}

/** Semua repository yang dipakai fitur (bentuknya ditentukan `RepositorySet` di core). */
export function createRepositorySet(deps: RepositoryDeps): RepositorySet {
  return {
    schedule: createRepository(deps, 'schedule'),
    todo: createRepository(deps, 'todo'),
    countdown: createRepository(deps, 'countdown'),
    habit: createRepository(deps, 'habit'),
    journal: createRepository(deps, 'journal_entry'),
    goal: createRepository(deps, 'goal'),
    decoration: createRepository(deps, 'decoration'),
    userPrefs: createRepository(deps, 'user_prefs'),
  }
}

/**
 * Satu-satunya jalur tulis di modul ini: record + index + outbox dalam SATU transaksi.
 *
 * Memakai `commitLocalWrite` dari core (bukan `tx.putRecord` langsung) supaya aturan atomisitasnya
 * hidup di satu tempat yang sama dengan adapter mobile nanti.
 */
async function writeSealed(
  deps: RepositoryDeps,
  input: {
    readonly id: string
    readonly hlc: string
    readonly deleted: boolean
    readonly blob: string
    readonly index: RangeIndexInput | null
    readonly outbox: OutboxIntent
  },
): Promise<void> {
  await commitLocalWrite({
    storage: deps.storage,
    write: buildRecordWrite({
      sealed: {
        id: input.id,
        hlc: input.hlc,
        deleted: input.deleted,
        blob: input.blob,
      },
      index: input.index === null ? null : { ...input.index, recordId: input.id },
      op: input.deleted ? 'delete' : 'put',
      outbox: input.outbox,
    }),
    label: 'record.save',
  })
}
