import type { ServerRecord } from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import { createManualClock } from '../adapters/clock.ts'
import { createMemoryStorage } from '../adapters/memory.ts'
import type { RecordIndexEntry } from '../domain/envelope.ts'
import { RECORD_INDEX_KEEP, type HttpClient } from '../ports.ts'
import { createHlcGenerator } from './hlc.ts'
import { buildRecordWrite, commitLocalWrite } from './outbox.ts'
import { pullDelta } from './pull.ts'

/** QA #111: celah adversarial di luar test developer (tombstone, HLC identik, halaman campuran). */

const START_MS = 1_700_000_000_000
const ID = '018f2c4e-0000-7000-8000-0000000000aa'
const LOCAL_HLC = '1699999999999-0-deviceb'
const NEWER_HLC = '1700000005000-0-deviceb'
const INDEX: RecordIndexEntry = {
  recordId: ID,
  entityType: 'todo',
  rangeStartMs: START_MS,
  rangeEndMs: null,
  updatedAtMs: START_MS,
}

function http(records: ServerRecord[]): HttpClient {
  let call = 0
  return {
    postJson: async () => {
      throw new Error('no push')
    },
    getJson: async <T>(): Promise<T> => {
      call += 1
      return (call === 1 ? { records, nextCursor: 5 } : { records: [], nextCursor: 5 }) as T
    },
  } as HttpClient
}

async function setup(local?: { hlc: string; deleted: boolean }) {
  const clock = createManualClock(START_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: 'device-a', clock })
  if (local !== undefined) {
    await commitLocalWrite({
      storage,
      write: buildRecordWrite({
        sealed: { id: ID, hlc: local.hlc, deleted: local.deleted, blob: 'LOKAL' },
        index: INDEX,
        op: local.deleted ? 'delete' : 'put',
        outbox: { id: 'o1', queuedAtMs: START_MS },
      }),
    })
  }
  return { storage, hlc }
}

const pull = (
  s: Awaited<ReturnType<typeof setup>>,
  record: ServerRecord,
  indexFor: () => typeof RECORD_INDEX_KEEP,
) =>
  pullDelta({
    storage: s.storage,
    http: http([record]),
    url: '/v1/sync/pull',
    nowMs: START_MS,
    hlc: s.hlc,
    indexFor,
  })

describe('QA #111: tombstone remote + indexFor keep', () => {
  it('tombstone remote yang lebih baru tetap menghapus record lokal walau blob-nya tak terbaca', async () => {
    const s = await setup({ hlc: LOCAL_HLC, deleted: false })
    await pull(
      s,
      { id: ID, hlc: NEWER_HLC, deleted: true, blob: 'AAAAAAAA', serverSeq: 1 },
      () => RECORD_INDEX_KEEP,
    )

    expect((await s.storage.getRecord(ID))?.deleted).toBe(true)
  })
})

describe('QA #111: HLC identik + keep', () => {
  it('HLC sama dengan lokal: dilewati, blob lokal utuh', async () => {
    const s = await setup({ hlc: LOCAL_HLC, deleted: false })
    const summary = await pull(
      s,
      { id: ID, hlc: LOCAL_HLC, deleted: false, blob: 'AAAAAAAA', serverSeq: 1 },
      () => RECORD_INDEX_KEEP,
    )
    expect(summary.applied).toBe(0)
    expect((await s.storage.getRecord(ID))?.blob).toBe('LOKAL')
  })
})

describe('QA #111: lokal tombstone + remote keep', () => {
  it('tombstone lokal tidak dihidupkan lagi oleh blob remote yang tak terbaca', async () => {
    const s = await setup({ hlc: LOCAL_HLC, deleted: true })
    await pull(
      s,
      { id: ID, hlc: NEWER_HLC, deleted: false, blob: 'AAAAAAAA', serverSeq: 1 },
      () => RECORD_INDEX_KEEP,
    )
    expect((await s.storage.getRecord(ID))?.deleted).toBe(true)
  })
})
