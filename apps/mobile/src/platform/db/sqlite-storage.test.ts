// Adapter SQLite diuji dua lapis (sama dengan adapter IndexedDB web):
// 1. `runStorageAdapterContractTests` - suite kontrak yang SAMA dengan adapter memori dan IndexedDB
//    (AC T23). Driver-nya SQLite asli (`node:sqlite`) lewat fake expo-sqlite di jest.setup.
// 2. Sifat khas backend yang tidak dicakup kontrak: query lewat index, flag todo, batas transaksi.
import {
  createManualClock,
  pointIndex,
  type ManualClock,
  type TransactionContext,
} from '@improve-personal/core'
import { runStorageAdapterContractTests } from '@improve-personal/core/testing'

import { fakeSqlite } from '../../../jest/fakeExpoSqlite'
import { openEncryptedDatabase } from './open'
import { createSqliteStorage } from './sqlite-storage'

const KEY = new Uint8Array(32).fill(7)
const START_MS = 1_700_000_000_000

let databaseCounter = 0

async function createTestStorage(clock: ManualClock) {
  databaseCounter += 1
  const name = `contract-${databaseCounter}.db`
  const db = await openEncryptedDatabase({ name, key: KEY })
  return { name, storage: createSqliteStorage({ db, clock }) }
}

runStorageAdapterContractTests('sqlite', async (clock) => (await createTestStorage(clock)).storage)

function recordId(n: number): string {
  return `018f2c4e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

describe('createSqliteStorage - sifat backend', () => {
  it('query rentang memakai index (entity_type, range_start_ms), bukan scan tabel record', async () => {
    const { name } = await createTestStorage(createManualClock(START_MS))
    const raw = fakeSqlite.raw(name)
    if (raw === undefined) throw new Error('DB test tidak terbuat')

    const plan = raw
      .prepare(
        `EXPLAIN QUERY PLAN SELECT r.id FROM record_index i JOIN record r ON r.id = i.record_id
          WHERE i.entity_type IN ('todo') AND i.range_start_ms IS NOT NULL
            AND COALESCE(i.range_end_ms, i.range_start_ms) >= 0 AND i.range_start_ms <= 10
            AND r.deleted = 0
          ORDER BY i.range_start_ms, i.record_id LIMIT -1`,
      )
      .all()
      .map((row) => String(row.detail))
      .join('\n')

    expect(plan).toContain('idx_record_index_type_range')
    expect(plan).not.toMatch(/SCAN r\b/)
  })

  it('flag todo (doneRank/priorityRank) ikut tersimpan di record_index', async () => {
    const { storage } = await createTestStorage(createManualClock(START_MS))

    await storage.runTransaction('test.write', async (tx) => {
      await tx.putRecord({
        sealed: { id: recordId(1), hlc: `${START_MS}-0-a`, deleted: false, blob: 'c' },
        index: {
          ...pointIndex(recordId(1), 'todo', START_MS, START_MS),
          doneRank: 1,
          priorityRank: 0,
        },
        op: 'put',
        outbox: { id: 'o-1', queuedAtMs: START_MS },
      })
    })

    const [entry] = await storage.listIndexByType('todo')
    expect(entry?.doneRank).toBe(1)
    expect(entry?.priorityRank).toBe(0)
  })

  it('getRecords tetap benar untuk id melebihi satu batch IN (...)', async () => {
    const { storage } = await createTestStorage(createManualClock(START_MS))
    const ids = Array.from({ length: 1_200 }, (_, i) => recordId(i + 1))

    await storage.runTransaction('test.bulk', async (tx) => {
      for (const id of ids) {
        await tx.putRecord({
          sealed: { id, hlc: `${START_MS}-0-a`, deleted: false, blob: 'c' },
          index: null,
          op: 'put',
          outbox: { id: `o-${id}`, queuedAtMs: START_MS },
        })
      }
    })

    expect(await storage.getRecords(ids)).toHaveLength(ids.length)
    await storage.deleteOutboxRows(ids.map((id) => `o-${id}`))
    expect(await storage.countOutbox()).toBe(0)
  })

  it('TransactionContext ditolak setelah transaksi selesai (tidak menulis di luar transaksi)', async () => {
    const { storage } = await createTestStorage(createManualClock(START_MS))
    const leaked = await storage.runTransaction('test.leak', async (tx: TransactionContext) => tx)

    await expect(leaked.patchSyncState({ cursor: 9 })).rejects.toThrow('setelah transaksi selesai')
    expect(await storage.getSyncState()).toBeNull()
  })

  it('data bertahan setelah DB ditutup lalu dibuka ulang dengan kunci yang sama', async () => {
    const clock = createManualClock(START_MS)
    const { name, storage } = await createTestStorage(clock)
    await storage.putRecentSticker({ stickerId: 's-1', usedAtMs: START_MS })

    const reopened = createSqliteStorage({
      db: await openEncryptedDatabase({ name, key: KEY }),
      clock,
    })
    expect(await reopened.listRecentStickers(5)).toEqual([{ stickerId: 's-1', usedAtMs: START_MS }])
  })
})
