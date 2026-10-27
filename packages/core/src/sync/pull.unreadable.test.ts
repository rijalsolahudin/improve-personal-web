import { compareHlc, type ServerRecord } from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import { createManualClock } from '../adapters/clock.ts'
import { createMemoryStorage } from '../adapters/memory.ts'
import type { RecordIndexEntry } from '../domain/envelope.ts'
import { RECORD_INDEX_KEEP, type HttpClient, type StorageAdapter } from '../ports.ts'
import { createHlcGenerator, type HlcGenerator } from './hlc.ts'
import { buildRecordWrite, commitLocalWrite } from './outbox.ts'
import { pullDelta } from './pull.ts'

/**
 * Regresi data-loss pull (task #111): blob remote yang GAGAL dibuka (`indexFor` => `'keep'`) tidak
 * boleh menimpa record lokal yang masih terbaca, dan HLC-nya tidak boleh menarik jam lokal.
 */

const START_MS = 1_700_000_000_000
const ID_A = '018f2c4e-0000-7000-8000-00000000000a'
const ID_B = '018f2c4e-0000-7000-8000-00000000000b'
const LOCAL_BLOB = 'LOKAL-TERBACA'
const UNREADABLE_BLOB = 'AAAAAAAA'
const OLD_HLC = '1699999999999-0-deviceb'
/** Jauh di depan jam lokal: kalau di-`observe`, `peek().wallMs` pasti ikut melompat. */
const FAR_FUTURE_HLC = '1900000000000-0-deviceb'
const NEXT_CURSOR = 7
const SYNC_OUTBOX_LIST_LIMIT = 100

const INDEX_A: RecordIndexEntry = {
  recordId: ID_A,
  entityType: 'todo',
  rangeStartMs: START_MS,
  rangeEndMs: null,
  updatedAtMs: START_MS,
}

function remote(id: string, hlc: string, serverSeq: number): ServerRecord {
  return { id, hlc, deleted: false, blob: UNREADABLE_BLOB, serverSeq }
}

function httpWithOnePage(records: ServerRecord[]): HttpClient {
  let call = 0

  return {
    postJson: async <T>(): Promise<T> => {
      throw new Error('pull tidak boleh memakai push')
    },
    getJson: async <T>(): Promise<T> => {
      call += 1
      return (call === 1
        ? { records, nextCursor: NEXT_CURSOR }
        : { records: [], nextCursor: NEXT_CURSOR }) as unknown as T
    },
  } as HttpClient
}

async function seedLocal(storage: StorageAdapter, input: { id: string; index: RecordIndexEntry }) {
  await commitLocalWrite({
    storage,
    write: buildRecordWrite({
      sealed: { id: input.id, hlc: OLD_HLC, deleted: false, blob: LOCAL_BLOB },
      index: input.index,
      op: 'put',
      outbox: { id: `outbox-${input.id}`, queuedAtMs: START_MS },
    }),
  })
}

function setup() {
  const clock = createManualClock(START_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: 'device-a', clock })
  return { storage, hlc }
}

/** Generator asli yang mencatat HLC yang di-`observe` beserta urutannya terhadap transaksi merge. */
function spyOnObserve(hlc: HlcGenerator, events: string[]): HlcGenerator {
  return {
    ...hlc,
    observe: (value) => {
      events.push(`observe:${value}`)
      hlc.observe(value)
    },
  }
}

describe('pullDelta: blob remote gagal dibuka tidak menimpa data lokal', () => {
  it('mempertahankan record lokal + index lama, dan cursor tetap maju', async () => {
    const { storage, hlc } = setup()
    await seedLocal(storage, { id: ID_A, index: INDEX_A })

    const summary = await pullDelta({
      storage,
      http: httpWithOnePage([remote(ID_A, '1700000005000-0-deviceb', 1)]),
      url: '/v1/sync/pull',
      nowMs: START_MS,
      hlc,
      indexFor: () => RECORD_INDEX_KEEP,
    })

    expect(summary.applied).toBe(0)
    expect(summary.skipped).toBe(1)

    const stored = await storage.getRecord(ID_A)
    expect(stored?.blob).toBe(LOCAL_BLOB)
    expect(stored?.hlc).toBe(OLD_HLC)
    await expect(storage.listIndexByType('todo')).resolves.toEqual([INDEX_A])

    // Cursor ditulis di transaksi merge yang sama; tanpa ini pull macet di halaman yang sama.
    expect(summary.cursor).toBe(NEXT_CURSOR)
    expect((await storage.getSyncState())?.cursor).toBe(NEXT_CURSOR)
  })

  it('tanpa versi lokal, blob tetap disimpan (jalur karantina) tanpa mengarang index', async () => {
    const { storage, hlc } = setup()

    const summary = await pullDelta({
      storage,
      http: httpWithOnePage([remote(ID_A, '1700000005000-0-deviceb', 1)]),
      url: '/v1/sync/pull',
      nowMs: START_MS,
      hlc,
      indexFor: () => RECORD_INDEX_KEEP,
    })

    expect(summary.applied).toBe(1)
    expect((await storage.getRecord(ID_A))?.blob).toBe(UNREADABLE_BLOB)
    await expect(storage.listIndexByType('todo')).resolves.toEqual([])
    expect((await storage.getSyncState())?.cursor).toBe(NEXT_CURSOR)
  })

  it('hanya record yang gagal dibuka yang dilewati; record lain di halaman yang sama diterapkan', async () => {
    const { storage, hlc } = setup()
    await seedLocal(storage, { id: ID_A, index: INDEX_A })

    const summary = await pullDelta({
      storage,
      http: httpWithOnePage([
        remote(ID_A, '1700000005000-0-deviceb', 1),
        remote(ID_B, '1700000005001-0-deviceb', 2),
      ]),
      url: '/v1/sync/pull',
      nowMs: START_MS,
      hlc,
      indexFor: (record) => (record.id === ID_A ? RECORD_INDEX_KEEP : null),
    })

    expect(summary.applied).toBe(1)
    expect(summary.skipped).toBe(1)
    expect((await storage.getRecord(ID_A))?.blob).toBe(LOCAL_BLOB)
    expect((await storage.getRecord(ID_B))?.blob).toBe(UNREADABLE_BLOB)
  })

  it('versi lokal yang mendarat selama dekripsi juga tidak ditimpa blob yang gagal dibuka', async () => {
    const { storage, hlc } = setup()

    const summary = await pullDelta({
      storage,
      http: httpWithOnePage([remote(ID_A, '1700000005000-0-deviceb', 1)]),
      url: '/v1/sync/pull',
      nowMs: START_MS,
      hlc,
      indexFor: async (): Promise<typeof RECORD_INDEX_KEEP> => {
        await Promise.resolve()
        // Lokal belum ada saat snapshot pertama; baru muncul (HLC lebih lama dari remote) di tengah
        // dekripsi. Hanya snapshot kedua yang bisa melindunginya.
        await seedLocal(storage, { id: ID_A, index: INDEX_A })
        return RECORD_INDEX_KEEP
      },
    })

    expect(summary.applied).toBe(0)
    expect((await storage.getRecord(ID_A))?.blob).toBe(LOCAL_BLOB)
    await expect(storage.listIndexByType('todo')).resolves.toEqual([INDEX_A])
  })
})

describe('pullDelta: hlc.observe hanya untuk record yang terverifikasi', () => {
  it('tidak meng-observe HLC record yang gagal dibuka, jam lokal tidak melompat', async () => {
    const { storage, hlc } = setup()
    const events: string[] = []
    const before = hlc.peek()

    await pullDelta({
      storage,
      http: httpWithOnePage([remote(ID_A, FAR_FUTURE_HLC, 1)]),
      url: '/v1/sync/pull',
      nowMs: START_MS,
      hlc: spyOnObserve(hlc, events),
      indexFor: () => RECORD_INDEX_KEEP,
    })

    expect(events).toEqual([])
    expect(hlc.peek()).toEqual(before)
  })

  it('meng-observe record valid sebelum transaksi merge, dan record yang kalah dari lokal', async () => {
    const { storage, hlc } = setup()
    await seedLocal(storage, { id: ID_A, index: INDEX_A })
    const events: string[] = []

    const traced: StorageAdapter = {
      ...storage,
      runTransaction: async (label, fn) => {
        if (label === 'sync.pull.merge') events.push('merge-transaction')
        return storage.runTransaction(label, fn)
      },
    }

    // ID_A: HLC lebih tua dari lokal (skipped). ID_B: record baru yang terbuka (valid).
    const olderThanLocal = '1699999999000-0-deviceb'
    const valid = '1700000005001-0-deviceb'
    await pullDelta({
      storage: traced,
      http: httpWithOnePage([remote(ID_A, olderThanLocal, 1), remote(ID_B, valid, 2)]),
      url: '/v1/sync/pull',
      nowMs: START_MS,
      hlc: spyOnObserve(hlc, events),
      indexFor: () => null,
    })

    expect(events).toEqual([`observe:${olderThanLocal}`, `observe:${valid}`, 'merge-transaction'])
  })

  it('tulisan lokal sesudah pull lebih besar dari HLC valid yang di-observe', async () => {
    const { storage, hlc } = setup()
    const valid = '1800000000000-0-deviceb'

    await pullDelta({
      storage,
      http: httpWithOnePage([remote(ID_A, valid, 1)]),
      url: '/v1/sync/pull',
      nowMs: START_MS,
      hlc,
      indexFor: () => null,
    })

    expect(compareHlc(hlc.tick(), valid)).toBeGreaterThan(0)
  })
})

describe('pullDelta: tombstone remote tetap diterapkan walau indexFor => keep', () => {
  const TOMBSTONE_HLC = '1700000005000-0-deviceb'

  function tombstone(hlc: string): ServerRecord {
    return { id: ID_A, hlc, deleted: true, blob: UNREADABLE_BLOB, serverSeq: 1 }
  }

  function pullTombstone(s: ReturnType<typeof setup>, record: ServerRecord, hlc = s.hlc) {
    return pullDelta({
      storage: s.storage,
      http: httpWithOnePage([record]),
      url: '/v1/sync/pull',
      nowMs: START_MS,
      hlc,
      indexFor: () => RECORD_INDEX_KEEP,
    })
  }

  it('menandai record lokal hidup sebagai deleted dengan HLC remote dan menghapus index-nya', async () => {
    const s = setup()
    await seedLocal(s.storage, { id: ID_A, index: INDEX_A })

    const summary = await pullTombstone(s, tombstone(TOMBSTONE_HLC))

    expect(summary.applied).toBe(1)
    expect(summary.skipped).toBe(0)
    const stored = await s.storage.getRecord(ID_A)
    expect(stored?.deleted).toBe(true)
    expect(stored?.hlc).toBe(TOMBSTONE_HLC)
    // Record sudah mati: tidak boleh ada entri index yatim (sama seperti penghapusan lokal).
    await expect(s.storage.listIndexByType('todo')).resolves.toEqual([])
    expect((await s.storage.getSyncState())?.cursor).toBe(NEXT_CURSOR)
  })

  it('tidak mengirim balik tombstone hasil pull ke server', async () => {
    const s = setup()
    await seedLocal(s.storage, { id: ID_A, index: INDEX_A })
    await s.storage.runTransaction('test.clear-outbox', async (tx) => {
      await tx.deleteOutboxRows([`outbox-${ID_A}`])
    })

    await pullTombstone(s, tombstone(TOMBSTONE_HLC))

    await expect(s.storage.listOutbox(SYNC_OUTBOX_LIST_LIMIT)).resolves.toEqual([])
  })

  it('meng-observe HLC tombstone yang diterapkan, jam lokal melewatinya', async () => {
    const s = setup()
    await seedLocal(s.storage, { id: ID_A, index: INDEX_A })
    const events: string[] = []

    await pullTombstone(s, tombstone(FAR_FUTURE_HLC), spyOnObserve(s.hlc, events))

    expect(events).toEqual([`observe:${FAR_FUTURE_HLC}`])
    expect(s.hlc.peek().wallMs).toBeGreaterThanOrEqual(1_900_000_000_000)
  })

  it('tombstone yang kalah LWW dari lokal yang lebih baru dilewati; lokal dan index utuh', async () => {
    const s = setup()
    await seedLocal(s.storage, { id: ID_A, index: INDEX_A })

    const summary = await pullTombstone(s, tombstone('1699999990000-0-deviceb'))

    expect(summary.applied).toBe(0)
    expect(summary.skipped).toBe(1)
    const stored = await s.storage.getRecord(ID_A)
    expect(stored?.deleted).toBe(false)
    expect(stored?.blob).toBe(LOCAL_BLOB)
    await expect(s.storage.listIndexByType('todo')).resolves.toEqual([INDEX_A])
    expect((await s.storage.getSyncState())?.cursor).toBe(NEXT_CURSOR)
  })

  it('tombstone dengan HLC identik dengan lokal dilewati', async () => {
    const s = setup()
    await seedLocal(s.storage, { id: ID_A, index: INDEX_A })

    const summary = await pullTombstone(s, tombstone(OLD_HLC))

    expect(summary.applied).toBe(0)
    expect((await s.storage.getRecord(ID_A))?.deleted).toBe(false)
  })

  it('tanpa versi lokal, tombstone tetap tersimpan (jalur karantina) tanpa mengarang index', async () => {
    const s = setup()

    const summary = await pullTombstone(s, tombstone(TOMBSTONE_HLC))

    expect(summary.applied).toBe(1)
    const stored = await s.storage.getRecord(ID_A)
    expect(stored?.deleted).toBe(true)
    expect(stored?.hlc).toBe(TOMBSTONE_HLC)
    await expect(s.storage.listIndexByType('todo')).resolves.toEqual([])
    expect((await s.storage.getSyncState())?.cursor).toBe(NEXT_CURSOR)
  })

  it('tombstone yang menang tetap diterapkan walau lokal mendarat di tengah dekripsi dan masih lebih tua', async () => {
    const s = setup()

    const summary = await pullDelta({
      storage: s.storage,
      http: httpWithOnePage([tombstone(TOMBSTONE_HLC)]),
      url: '/v1/sync/pull',
      nowMs: START_MS,
      hlc: s.hlc,
      indexFor: async (): Promise<typeof RECORD_INDEX_KEEP> => {
        await Promise.resolve()
        await seedLocal(s.storage, { id: ID_A, index: INDEX_A })
        return RECORD_INDEX_KEEP
      },
    })

    expect(summary.applied).toBe(1)
    expect((await s.storage.getRecord(ID_A))?.deleted).toBe(true)
  })
})
