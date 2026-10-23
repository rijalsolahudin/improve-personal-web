import type { ServerRecord } from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import { createManualClock } from '../adapters/clock.ts'
import { createMemoryStorage } from '../adapters/memory.ts'
import type { RecordIndexEntry } from '../domain/envelope.ts'
import type { HttpClient, StorageAdapter } from '../ports.ts'
import { createHlcGenerator } from './hlc.ts'
import { buildRecordWrite, commitLocalWrite, syncOpFor } from './outbox.ts'
import { pullDelta } from './pull.ts'

/**
 * Regresi QA T21/T22: `indexFor` boleh asinkron, tetapi WAJIB selesai SEBELUM transaksi tulis.
 *
 * `ports.ts` butir 3 melarang `await` non-storage di tengah `runTransaction` (IndexedDB auto-commit
 * kalau ada pekerjaan lain diselipkan). Shell web membangun index hasil pull dengan mendekripsi blob,
 * jadi jalur ini nyata: kalau core memanggil `indexFor()` di dalam callback transaksi, sisa tulisan
 * halaman itu bisa hilang tanpa error. Test ini mengunci urutannya, bukan implementasinya.
 */

const START_MS = 1_700_000_000_000
const RECORD_ID = '018f2c4e-0000-7000-8000-000000000001'

function remoteRecord(input: {
  readonly id: string
  readonly hlc: string
  readonly serverSeq: number
}): ServerRecord {
  return {
    id: input.id,
    hlc: input.hlc,
    deleted: false,
    // Blob palsu yang tetap sah sebagai base64; isi tidak dibuka oleh core.
    blob: 'AAAAAAAA',
    serverSeq: input.serverSeq,
  }
}

function httpWithPages(
  pages: readonly { readonly records: ServerRecord[]; readonly next: number }[],
) {
  let call = 0

  return {
    postJson: async <T>(): Promise<T> => {
      throw new Error('pull tidak boleh memakai push')
    },
    getJson: async <T>(): Promise<T> => {
      const page = pages[call]
      call += 1

      return { records: page?.records ?? [], nextCursor: page?.next ?? 0 } as unknown as T
    },
  } as HttpClient
}

const INDEX: RecordIndexEntry = {
  recordId: RECORD_ID,
  entityType: 'todo',
  rangeStartMs: START_MS,
  rangeEndMs: null,
  updatedAtMs: START_MS,
}

describe('pullDelta: indexFor asinkron di luar transaksi', () => {
  it('menunggu indexFor selesai sebelum runTransaction, lalu menyimpan index-nya', async () => {
    const clock = createManualClock(START_MS)
    const storage = createMemoryStorage({ clock })
    const hlc = createHlcGenerator({ deviceId: 'device-a', clock })

    const order: string[] = []
    const traced: StorageAdapter = {
      ...storage,
      runTransaction: async (label, fn) => {
        if (label === 'sync.pull.merge') order.push('merge-transaction')
        return storage.runTransaction(label, fn)
      },
    }

    const http = httpWithPages([
      {
        records: [remoteRecord({ id: RECORD_ID, hlc: hlc.tick(), serverSeq: 1 })],
        next: 1,
      },
    ])

    const summary = await pullDelta({
      storage: traced,
      http,
      url: '/v1/sync/pull',
      nowMs: START_MS,
      hlc,
      indexFor: async () => {
        // Satu tick microtask: cukup untuk membuktikan nilainya benar-benar ditunggu.
        await Promise.resolve()
        order.push('indexFor')
        return INDEX
      },
    })

    expect(summary.applied).toBe(1)
    expect(order.indexOf('indexFor')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('indexFor')).toBeLessThan(order.indexOf('merge-transaction'))
    await expect(storage.listIndexByType('todo')).resolves.toEqual([INDEX])
  })

  it('tidak memanggil indexFor untuk record yang versi lokalnya menang', async () => {
    const clock = createManualClock(START_MS)
    const storage = createMemoryStorage({ clock })
    const hlc = createHlcGenerator({ deviceId: 'device-a', clock })
    const localHlc = hlc.tick()

    await commitLocalWrite({
      storage,
      write: buildRecordWrite({
        sealed: { id: RECORD_ID, hlc: localHlc, deleted: false, blob: 'AAAAAAAA' },
        index: null,
        op: syncOpFor({ deleted: false }),
        outbox: { id: 'outbox-local', queuedAtMs: START_MS },
      }),
    })

    let indexCalls = 0
    const http = httpWithPages([
      {
        records: [remoteRecord({ id: RECORD_ID, hlc: '1699999999999-0-device-b', serverSeq: 1 })],
        next: 1,
      },
    ])

    const summary = await pullDelta({
      storage,
      http,
      url: '/v1/sync/pull',
      nowMs: START_MS,
      hlc,
      indexFor: () => {
        indexCalls += 1
        return INDEX
      },
    })

    expect(summary.applied).toBe(0)
    expect(summary.skipped).toBe(1)
    expect(indexCalls).toBe(0)
  })
})
