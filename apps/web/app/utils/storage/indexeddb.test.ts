// @vitest-environment node
//
// Adapter IndexedDB web diuji dua lapis:
// 1. `runStorageAdapterContractTests` - suite kontrak yang SAMA dengan adapter memori (dan nanti
//    adapter SQLite mobile), sesuai AC T23. Kalau perilaku di sini menyimpang, test yang gagal sama.
// 2. Sifat khas backend yang tidak bisa diuji suite kontrak (durability, lock penulis, kunci index
//    yang tidak sah di IndexedDB).
//
// `fake-indexeddb` menyediakan implementasi in-memory; yang benar-benar diuji tetap kode adapter kita.
import 'fake-indexeddb/auto'

import { IDBDatabase, IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createManualClock, type ManualClock } from '@improve-personal/core'
import { runStorageAdapterContractTests } from '@improve-personal/core/testing'

import { createIndexedDbStorage, createWebLocksRunner } from './indexeddb'

let databaseCounter = 0

/**
 * Database BARU per test: IndexedDB menyimpan data per nama, jadi nama unik yang membuat tiap test
 * mulai dari kondisi kosong tanpa perlu membersihkan apa pun.
 */
function createTestStorage(clock: ManualClock) {
  databaseCounter += 1

  return createIndexedDbStorage({
    clock,
    databaseName: `ip-test-${databaseCounter}`,
    // Node tidak punya Web Locks. Karena yang diuji di sini adalah kontrak & perilaku IndexedDB -
    // bukan lock antar-tab - runner-nya diganti versi yang langsung jalan.
    runExclusive: (work) => work(),
  })
}

beforeEach(() => {
  // `idb` membaca `globalThis.indexedDB` saat dipanggil, bukan saat di-import.
  globalThis.indexedDB = new IDBFactory()
})

runStorageAdapterContractTests('IndexedDB', createTestStorage)

describe('sifat khas IndexedDB (di luar kontrak StorageAdapter)', () => {
  const START_MS = 1_700_000_000_000

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('transaksi tulis memakai durability `strict`, bukan default `relaxed` browser', async () => {
    // Aturan §5: default Chrome `relaxed` - commit terakhir bisa hilang saat mati listrik/OS crash.
    // Ini satu-satunya tempat opsinya dipasang, jadi ini juga tempatnya diuji.
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction')
    const storage = createTestStorage(createManualClock(START_MS))

    await storage.putSyncState({
      deviceId: 'devicea',
      cursor: 0,
      status: 'pending',
      lastPullAtMs: null,
      lastPushAtMs: null,
    })

    const durabilities = spy.mock.calls.map(
      (call) => (call[2] as IDBTransactionOptions | undefined)?.durability,
    )
    expect(durabilities).toContain('strict')
  })

  it('lock penulis diambil untuk operasi tulis, dan TIDAK diambil untuk baca', async () => {
    const locked: string[] = []
    const storage = createIndexedDbStorage({
      clock: createManualClock(START_MS),
      databaseName: `ip-lock-${(databaseCounter += 1)}`,
      runExclusive: (work) => {
        locked.push('write')
        return work()
      },
    })

    await storage.runTransaction('lock.probe', async (tx) => {
      await tx.putRecord({
        sealed: { id: 'rec-1', hlc: `${START_MS}-0-devicea`, deleted: false, blob: 'blob' },
        index: null,
        op: 'put',
        outbox: { id: 'outbox-1', queuedAtMs: START_MS },
      })
    })
    await storage.putRecentSticker({ stickerId: 's-1', usedAtMs: START_MS })

    expect(locked).toHaveLength(2)

    // Baca tidak menahan lock: IndexedDB sudah memberi snapshot konsisten, dan baca yang ikut
    // mengantre di lock tulis cuma bikin UI menunggu tanpa manfaat.
    await storage.getRecord('rec-1')
    await storage.listOutbox(5)
    await storage.queryByRange({ entityTypes: ['todo'], fromMs: 0, toMs: START_MS + 1 })

    expect(locked).toHaveLength(2)
  })

  it('entri index tanpa dimensi waktu tetap terbaca (kunci `null` tidak sah di index komposit)', async () => {
    // Inilah alasan `idx_record_index_type` ada: di index `(entity_type, range_start_ms)`, baris
    // dengan `range_start_ms = null` tidak punya kunci yang sah sehingga hilang dari index -
    // padahal `listIndexByType` dan query tanpa batas waktu harus mengembalikannya.
    const storage = createTestStorage(createManualClock(START_MS))

    await storage.runTransaction('index.nullStart', async (tx) => {
      await tx.putRecord({
        sealed: { id: 'rec-prefs', hlc: `${START_MS}-0-devicea`, deleted: false, blob: 'blob' },
        index: {
          recordId: 'rec-prefs',
          entityType: 'user_prefs',
          rangeStartMs: null,
          rangeEndMs: null,
          updatedAtMs: START_MS,
        },
        op: 'put',
        outbox: { id: 'outbox-prefs', queuedAtMs: START_MS },
      })
    })

    const entries = await storage.listIndexByType('user_prefs')
    expect(entries.map((entry) => entry.recordId)).toEqual(['rec-prefs'])

    // Tanpa batas waktu, entri itu tetap dianggap cocok (`indexOverlapsRange`: start null = cocok
    // hanya kalau query memang tidak punya rentang).
    const records = await storage.queryByRange({ entityTypes: ['user_prefs'] })
    expect(records.map((record) => record.id)).toEqual(['rec-prefs'])

    // Dengan rentang waktu, entitas tanpa dimensi waktu tidak boleh ikut.
    const ranged = await storage.queryByRange({
      entityTypes: ['user_prefs'],
      fromMs: START_MS - 1_000,
      toMs: START_MS + 1_000,
    })
    expect(ranged).toEqual([])
  })

  it('banyak tipe dalam satu query digabung dan tetap urut naik & terbatas', async () => {
    const storage = createTestStorage(createManualClock(START_MS))
    const at = (id: string, type: 'todo' | 'schedule', ms: number) =>
      storage.runTransaction('seed', async (tx) => {
        await tx.putRecord({
          sealed: { id, hlc: `${ms}-0-devicea`, deleted: false, blob: `blob-${id}` },
          index: {
            recordId: id,
            entityType: type,
            rangeStartMs: ms,
            rangeEndMs: null,
            updatedAtMs: ms,
          },
          op: 'put',
          outbox: { id: `outbox-${id}`, queuedAtMs: ms },
        })
      })

    await at('todo-lambat', 'todo', START_MS + 5_000)
    await at('schedule-cepat', 'schedule', START_MS + 1_000)
    await at('todo-cepat', 'todo', START_MS + 2_000)

    const all = await storage.queryByRange({
      entityTypes: ['todo', 'schedule'],
      fromMs: 0,
      toMs: START_MS + 9_000,
    })
    expect(all.map((record) => record.id)).toEqual(['schedule-cepat', 'todo-cepat', 'todo-lambat'])

    const limited = await storage.queryByRange({
      entityTypes: ['todo', 'schedule'],
      fromMs: 0,
      toMs: START_MS + 9_000,
      limit: 2,
    })
    expect(limited.map((record) => record.id)).toEqual(['schedule-cepat', 'todo-cepat'])
  })
})

describe('createWebLocksRunner', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tanpa Web Locks: MENOLAK jalan, bukan diam-diam kehilangan jaminan satu-penulis', async () => {
    // Jaminan satu-penulis antar tab datang dari lock ini. Kalau hilang tanpa suara, dua tab bisa
    // saling menimpa (mis. `patchSyncState`) dan tidak ada yang tahu.
    vi.stubGlobal('navigator', {})

    const runner = createWebLocksRunner()
    await expect(runner(async () => 'ok')).rejects.toThrow(/Web Locks/)
  })

  it('dengan Web Locks: work dijalankan di dalam lock', async () => {
    const requested: string[] = []
    let executed = false

    vi.stubGlobal('navigator', {
      locks: {
        request: async (name: string, work: () => Promise<unknown>) => {
          requested.push(name)
          const result = await work()
          executed = true
          return result
        },
      },
    })

    const result = await createWebLocksRunner()(async () => 'selesai')

    expect(result).toBe('selesai')
    expect(requested).toEqual(['ip-writer'])
    expect(executed).toBe(true)
  })
})
