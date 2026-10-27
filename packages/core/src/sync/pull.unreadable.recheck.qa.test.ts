import type { ServerRecord } from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import { createManualClock } from '../adapters/clock.ts'
import { createMemoryStorage } from '../adapters/memory.ts'
import type { RecordIndexEntry } from '../domain/envelope.ts'
import { RECORD_INDEX_KEEP, type HttpClient } from '../ports.ts'
import { createHlcGenerator } from './hlc.ts'
import { buildRecordWrite, commitLocalWrite } from './outbox.ts'
import { pullDelta } from './pull.ts'

/** QA #111 re-check BUG-1: tombstone remote + indexFor 'keep' (LWW, cursor, outbox, record_index). */

const START_MS = 1_700_000_000_000
const ID = '018f2c4e-0000-7000-8000-0000000000bb'
const OLDER_HLC = '1699999999999-0-deviceb'
const NEWER_HLC = '1700000005000-0-deviceb'
const CURSOR = 9
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
      return (
        call === 1 ? { records, nextCursor: CURSOR } : { records: [], nextCursor: CURSOR }
      ) as T
    },
  } as HttpClient
}

async function run(local: { hlc: string; deleted: boolean } | null, remote: ServerRecord) {
  const clock = createManualClock(START_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: 'device-a', clock })
  if (local !== null) {
    await commitLocalWrite({
      storage,
      write: buildRecordWrite({
        sealed: { id: ID, hlc: local.hlc, deleted: local.deleted, blob: 'LOKAL' },
        index: INDEX,
        op: local.deleted ? 'delete' : 'put',
        outbox: { id: 'o1', queuedAtMs: START_MS },
      }),
    })
    await storage.deleteOutboxRows(['o1'])
  }
  const summary = await pullDelta({
    storage,
    http: http([remote]),
    url: '/v1/sync/pull',
    nowMs: START_MS,
    hlc,
    indexFor: () => RECORD_INDEX_KEEP,
  })
  const index = (await storage.listIndexByType('todo')).find((entry) => entry.recordId === ID)
  return { storage, hlc, summary, index, outbox: await storage.countOutbox() }
}

const tombstone = (hlc: string): ServerRecord => ({
  id: ID,
  hlc,
  deleted: true,
  blob: 'AAAAAAAA',
  serverSeq: 1,
})

describe('QA #111 re-check: tombstone remote + keep', () => {
  it('lokal hidup lebih tua: dihapus dengan HLC remote, index yatim hilang, tidak masuk outbox', async () => {
    const r = await run({ hlc: OLDER_HLC, deleted: false }, tombstone(NEWER_HLC))
    const stored = await r.storage.getRecord(ID)
    expect(stored?.deleted).toBe(true)
    expect(stored?.hlc).toBe(NEWER_HLC)
    expect(r.summary.applied).toBe(1)
    expect(r.summary.cursor).toBe(CURSOR)
    expect(r.outbox).toBe(0)
    expect(r.index).toBeUndefined()
  })

  it('lokal hidup lebih baru: lokal utuh, cursor maju', async () => {
    const r = await run({ hlc: NEWER_HLC, deleted: false }, tombstone(OLDER_HLC))
    const stored = await r.storage.getRecord(ID)
    expect(stored).toMatchObject({ deleted: false, hlc: NEWER_HLC, blob: 'LOKAL' })
    expect(r.summary).toMatchObject({ applied: 0, skipped: 1, cursor: CURSOR })
    expect(r.index).toBeDefined()
  })

  it('HLC sama: dilewati, lokal utuh, cursor maju', async () => {
    const r = await run({ hlc: NEWER_HLC, deleted: false }, tombstone(NEWER_HLC))
    expect(await r.storage.getRecord(ID)).toMatchObject({ deleted: false, blob: 'LOKAL' })
    expect(r.summary).toMatchObject({ applied: 0, skipped: 1, cursor: CURSOR })
  })

  it('tanpa lokal: tombstone tersimpan, tanpa index, tidak masuk outbox, cursor maju', async () => {
    const r = await run(null, tombstone(NEWER_HLC))
    expect(await r.storage.getRecord(ID)).toMatchObject({ deleted: true, hlc: NEWER_HLC })
    expect(r.summary).toMatchObject({ applied: 1, cursor: CURSOR })
    expect(r.index).toBeUndefined()
    expect(r.outbox).toBe(0)
  })
})
