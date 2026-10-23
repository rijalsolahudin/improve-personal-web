import {
  compareHlc,
  syncPushInputSchema,
  type ServerRecord,
  type SyncPushResult,
} from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import { createManualClock, type ManualClock } from '../adapters/clock.ts'
import { createMemoryStorage } from '../adapters/memory.ts'
import type { RecordIndexEntry } from '../domain/envelope.ts'
import {
  HttpError,
  type Clock,
  type HttpClient,
  type HttpRequestInit,
  type StorageAdapter,
} from '../ports.ts'
import { createHlcGenerator, type HlcGenerator } from './hlc.ts'
import { buildRecordWrite, commitLocalWrite, syncOpFor } from './outbox.ts'
import { pullDelta, SYNC_RESET_REQUIRED_CODE, type PullSummary } from './pull.ts'
import { pushOutbox, type PushSummary } from './push.ts'
import { readSyncStatus } from './status.ts'

/**
 * AC T21: "Uji 2 perangkat: edit offline di keduanya → setelah online hasil sama di dua sisi; hapus
 * ikut tersinkron; pull cuma ambil perubahan sejak cursor terakhir (berhalaman)".
 *
 * Seluruh skenario dijalankan dengan `StorageAdapter` memori, `HttpClient` palsu, dan `Clock` manual:
 * tidak ada jaringan, tidak ada timer, tidak ada `Date.now()`. Dua perangkat benar-benar dua instance
 * penyimpanan terpisah, jadi yang diuji adalah konvergensi - bukan panggilan fungsi satu arah.
 *
 * Server palsu di sini SENGAJA memvalidasi payload dengan schema kontrak (`syncPushInputSchema`), jadi
 * payload yang tidak sesuai kontrak (mis. tidak terurut naik berdasarkan `hlc`) gagal sebagai
 * `contractViolations`, bukan lolos diam-diam.
 */

const START_MS = 1_700_000_000_000
const PUSH_URL = '/v1/sync/push'
const PULL_URL = '/v1/sync/pull'

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Blob palsu yang tetap sah sebagai base64 (kontrak: `blob` base64, bukan byte). */
function blobFor(seed: number): string {
  const index = Math.abs(seed) % BASE64_ALPHABET.length
  return BASE64_ALPHABET.slice(index, index + 1).repeat(8)
}

function recordIdFor(n: number): string {
  return `018f2c4e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

function queryParam(url: string, key: string): string {
  const match = new RegExp(`[?&]${key}=([^&]*)`).exec(url)
  return match?.[1] ?? ''
}

// -----------------------------------------------------------------------------
// Server palsu: relay ciphertext + LWW HLC, sama seperti `apps/web/server` (tapi tanpa DB)
// -----------------------------------------------------------------------------

type ServerRow = ServerRecord

type FakeServer = {
  readonly http: HttpClient
  readonly contractViolations: readonly string[]
  readonly pushSizes: readonly number[]
  readonly pullCalls: readonly { readonly cursor: number; readonly limit: number }[]
  readonly serverSeqOf: (id: string) => number | null
  readonly rowOf: (id: string) => ServerRow | undefined
  readonly setPurgeWatermarkBreach: (active: boolean) => void
  readonly purgeRows: (ids: readonly string[]) => void
}

function createFakeServer(options?: { readonly rejectBlobs?: readonly string[] }): FakeServer {
  const rows = new Map<string, ServerRow>()
  const contractViolations: string[] = []
  const pushSizes: number[] = []
  const pullCalls: { cursor: number; limit: number }[] = []
  const rejectBlobs = new Set(options?.rejectBlobs ?? [])

  let seq = 0
  let purgeWatermarkBreach = false

  const http: HttpClient = {
    postJson: async <T>(_url: string, body: unknown, _init?: HttpRequestInit): Promise<T> => {
      void _url
      void _init

      const parsed = syncPushInputSchema.safeParse(body)
      if (!parsed.success) {
        contractViolations.push(
          parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; '),
        )
        throw new HttpError(400, 'VALIDATION_FAILED', 'push tidak sesuai kontrak')
      }

      pushSizes.push(parsed.data.records.length)

      const results: SyncPushResult['results'] = parsed.data.records.map((record) => {
        if (rejectBlobs.has(record.blob)) return { id: record.id, status: 'rejected' }

        const existing = rows.get(record.id)
        if (existing === undefined) {
          seq += 1
          rows.set(record.id, { ...record, serverSeq: seq })
          return { id: record.id, status: 'applied', serverSeq: seq }
        }

        const order = compareHlc(record.hlc, existing.hlc)
        if (order > 0) {
          seq += 1
          rows.set(record.id, { ...record, serverSeq: seq })
          return { id: record.id, status: 'applied', serverSeq: seq }
        }
        if (order === 0) return { id: record.id, status: 'applied', serverSeq: existing.serverSeq }

        return {
          id: record.id,
          status: 'stale',
          serverSeq: existing.serverSeq,
          serverHlc: existing.hlc,
        }
      })

      return { results } as unknown as T
    },

    getJson: async <T>(url: string, _init?: HttpRequestInit): Promise<T> => {
      void _init

      const cursor = Number(queryParam(url, 'cursor'))
      const limit = Number(queryParam(url, 'limit'))
      pullCalls.push({ cursor, limit })

      if (cursor > 0 && purgeWatermarkBreach) {
        purgeWatermarkBreach = false
        throw new HttpError(409, SYNC_RESET_REQUIRED_CODE, 'cursor di bawah watermark purge')
      }

      const page = [...rows.values()]
        .filter((row) => row.serverSeq > cursor)
        .sort((a, b) => a.serverSeq - b.serverSeq)
        .slice(0, limit)

      const last = page.at(-1)
      const nextCursor = last === undefined ? cursor : last.serverSeq

      return { records: page, nextCursor } as unknown as T
    },
  }

  return {
    http,
    contractViolations,
    pushSizes,
    pullCalls,
    serverSeqOf: (id) => rows.get(id)?.serverSeq ?? null,
    rowOf: (id) => rows.get(id),
    setPurgeWatermarkBreach: (active) => {
      purgeWatermarkBreach = active
    },
    purgeRows: (ids) => {
      for (const id of ids) rows.delete(id)
    },
  }
}

// -----------------------------------------------------------------------------
// Perangkat
// -----------------------------------------------------------------------------

type Device = {
  readonly deviceId: string
  readonly clock: Clock
  readonly manualClock: ManualClock | null
  readonly storage: StorageAdapter
  readonly hlc: HlcGenerator
  readonly write: (
    recordId: string,
    seed: number,
    options?: { readonly deleted?: boolean; readonly index?: RecordIndexEntry | null },
  ) => Promise<void>
}

function createDevice(options: { readonly deviceId: string; readonly clock?: Clock }): Device {
  const manualClock = options.clock === undefined ? createManualClock(START_MS) : null
  const clock = options.clock ?? manualClock ?? createManualClock(START_MS)

  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: options.deviceId, clock })

  let outboxCounter = 0

  return {
    deviceId: options.deviceId,
    clock,
    manualClock,
    storage,
    hlc,
    write: async (recordId, seed, writeOptions) => {
      outboxCounter += 1
      const sealed = {
        id: recordId,
        hlc: hlc.tick(),
        deleted: writeOptions?.deleted ?? false,
        blob: blobFor(seed),
      }

      await commitLocalWrite({
        storage,
        write: buildRecordWrite({
          sealed,
          index: writeOptions?.index ?? null,
          op: syncOpFor(sealed),
          outbox: { id: `outbox-${options.deviceId}-${outboxCounter}`, queuedAtMs: clock.nowMs() },
        }),
      })
    },
  }
}

async function push(device: Device, server: FakeServer, maxBatch?: number): Promise<PushSummary> {
  return pushOutbox({
    storage: device.storage,
    http: server.http,
    url: PUSH_URL,
    nowMs: device.clock.nowMs(),
    hlc: device.hlc,
    ...(maxBatch === undefined ? {} : { maxBatch }),
  })
}

async function pull(
  device: Device,
  server: FakeServer,
  options?: { readonly pageLimit?: number },
): Promise<PullSummary> {
  return pullDelta({
    storage: device.storage,
    http: server.http,
    url: PULL_URL,
    nowMs: device.clock.nowMs(),
    hlc: device.hlc,
    ...(options?.pageLimit === undefined ? {} : { pageLimit: options.pageLimit }),
  })
}

async function sync(device: Device, server: FakeServer): Promise<void> {
  await push(device, server)
  await pull(device, server)
}

/** Versi record di satu perangkat, dipakai untuk membandingkan konvergensi dua sisi. */
async function versionOf(
  device: Device,
  ids: readonly string[],
): Promise<ReadonlyMap<string, { hlc: string; deleted: boolean; blob: string }>> {
  const records = await device.storage.getRecords(ids)
  return new Map(
    records.map((record) => [
      record.id,
      { hlc: record.hlc, deleted: record.deleted, blob: record.blob },
    ]),
  )
}

function expectConverged(
  left: ReadonlyMap<string, { hlc: string; deleted: boolean; blob: string }>,
  right: ReadonlyMap<string, { hlc: string; deleted: boolean; blob: string }>,
  ids: readonly string[],
): void {
  for (const id of ids) {
    expect(left.get(id)).toEqual(right.get(id))
    expect(left.get(id)).toBeDefined()
  }
}

// -----------------------------------------------------------------------------
// Skenario AC T21
// -----------------------------------------------------------------------------

describe('sync engine - dua perangkat', () => {
  it('edit offline di dua sisi konvergen setelah online', async () => {
    const server = createFakeServer()
    const a = createDevice({ deviceId: 'devicea' })
    const b = createDevice({ deviceId: 'deviceb' })

    const r1 = recordIdFor(1)
    const r2 = recordIdFor(2)
    const r3 = recordIdFor(3)

    await a.write(r1, 1)
    await a.write(r2, 2)
    await b.write(r3, 3)

    expect(await a.storage.countOutbox()).toBe(2)
    expect(await b.storage.countOutbox()).toBe(1)

    // Sisi A jalan duluan, lalu sisi B, lalu sisi A lagi (pull kedua itu yang membawa kerja B).
    await sync(a, server)
    await sync(b, server)
    await sync(a, server)

    const ids = [r1, r2, r3]
    expectConverged(await versionOf(a, ids), await versionOf(b, ids), ids)

    expect(server.contractViolations).toEqual([])
    expect(await a.storage.countOutbox()).toBe(0)
    expect(await b.storage.countOutbox()).toBe(0)
    expect(await readSyncStatus({ storage: a.storage, online: true })).toBe('synced')
  })

  it('hapus (tombstone) ikut tersinkron dan tidak dikirim balik oleh perangkat penerima', async () => {
    const server = createFakeServer()
    const a = createDevice({ deviceId: 'devicea' })
    const b = createDevice({ deviceId: 'deviceb' })
    const r1 = recordIdFor(10)

    await a.write(r1, 1)
    await sync(a, server)
    await pull(b, server)

    expect((await b.storage.getRecord(r1))?.deleted).toBe(false)
    expect(await b.storage.countOutbox()).toBe(0)

    if (a.manualClock !== null) a.manualClock.advance(1_000)
    await a.write(r1, 1, { deleted: true })
    await sync(a, server)

    const pullResult = await pull(b, server)
    expect(pullResult.applied).toBe(1)

    const onB = await b.storage.getRecord(r1)
    expect(onB?.deleted).toBe(true)

    // Record hasil pull tidak boleh ikut masuk outbox - kalau iya, tiap pull memicu push balik.
    expect(await b.storage.countOutbox()).toBe(0)
    expectConverged(await versionOf(a, [r1]), await versionOf(b, [r1]), [r1])
  })

  it('pull cuma mengambil delta, dan halaman mengikuti limit (berhalaman)', async () => {
    const server = createFakeServer()
    const a = createDevice({ deviceId: 'devicea' })
    const b = createDevice({ deviceId: 'deviceb' })

    const ids: string[] = []
    for (let index = 0; index < 5; index += 1) {
      const id = recordIdFor(20 + index)
      ids.push(id)
      await a.write(id, index + 1)
    }

    await sync(a, server)

    // Semua pull milik B dihitung dari titik ini; pull milik A saat `sync` di atas tidak ikut.
    const callsBeforeB = server.pullCalls.length

    const first = await pull(b, server, { pageLimit: 2 })
    expect(first.pages).toBe(3)
    expect(first.applied).toBe(5)

    const cursorAfterFirst = first.cursor
    expect(cursorAfterFirst).toBe(server.serverSeqOf(ids[4] ?? '') ?? -1)

    const second = await pull(b, server, { pageLimit: 2 })
    expect(second.applied).toBe(0)
    expect(second.pages).toBe(0)
    expect(second.cursor).toBe(cursorAfterFirst)

    // Cursor yang dipakai benar-benar naik halaman demi halaman, bukan mengulang dari 0. Halaman
    // pendek TIDAK mengakhiri pull; selesai hanya saat server mengirim halaman kosong pada cursor
    // terakhir (probe ke-5, lalu sekali lagi di pull kedua).
    const callsForB = server.pullCalls.slice(callsBeforeB)
    expect(callsForB.map((call) => call.cursor)).toEqual([0, 2, 4, 5, 5])
    expect(callsForB.every((call) => call.limit === 2)).toBe(true)
  })

  it('409 SYNC_RESET_REQUIRED: cursor direset ke 0 lalu full pull', async () => {
    const server = createFakeServer()
    const a = createDevice({ deviceId: 'devicea' })
    const b = createDevice({ deviceId: 'deviceb' })

    const r1 = recordIdFor(30)
    const r2 = recordIdFor(31)
    await a.write(r1, 1)
    await sync(a, server)

    const firstPull = await pull(b, server)
    expect(firstPull.applied).toBe(1)
    expect(firstPull.cursor).toBeGreaterThan(0)

    // Server membersihkan tombstone/lama (watermark purge naik) dan perangkat A menulis data baru:
    // cursor B sekarang di bawah watermark.
    server.purgeRows([r1])
    if (a.manualClock !== null) a.manualClock.advance(1_000)
    await a.write(r2, 2)
    await sync(a, server)

    server.setPurgeWatermarkBreach(true)

    const callsBeforeReset = server.pullCalls.length
    const afterReset = await pull(b, server)
    expect(afterReset.resets).toBe(1)
    expect(afterReset.applied).toBe(1)
    expect(afterReset.status).not.toBe('error')

    // Permintaan setelah reset memakai cursor 0 (full pull), bukan cursor lama; lalu satu probe
    // kosong pada cursor terakhir untuk memastikan delta habis.
    expect(server.pullCalls.slice(callsBeforeReset).map((call) => call.cursor)).toEqual([1, 0, 2])
    expect((await b.storage.getRecord(r2))?.blob).toBe(blobFor(2))
  })

  it('edit bersamaan satu record: satu pemenang yang sama di dua sisi', async () => {
    const server = createFakeServer()
    const a = createDevice({ deviceId: 'devicea' })
    const b = createDevice({ deviceId: 'deviceb' })
    const r1 = recordIdFor(40)

    await a.write(r1, 1)
    expect(b.manualClock).not.toBeNull()
    if (b.manualClock !== null) b.manualClock.advance(5_000)
    await b.write(r1, 2)

    await push(a, server)
    await push(b, server)
    await pull(a, server)
    await pull(b, server)

    const winner = await versionOf(a, [r1])
    expectConverged(winner, await versionOf(b, [r1]), [r1])
    // Pemenangnya adalah hlc yang lebih besar (B, yang menulis belakangan) - satu versi utuh.
    expect(winner.get(r1)?.blob).toBe(blobFor(2))
  })

  it('jawaban stale mengadopsi serverHlc supaya tulisan lokal berikutnya menang', async () => {
    const server = createFakeServer()
    const a = createDevice({
      deviceId: 'devicez',
      clock: createManualClock(START_MS + 60_000),
    })
    const b = createDevice({ deviceId: 'devicea', clock: createManualClock(START_MS) })
    const r1 = recordIdFor(45)

    await a.write(r1, 1)
    await sync(a, server)

    // B belum pernah pull, jadi HLC-nya masih di belakang A: kiriman pertama kalah (`stale`).
    await b.write(r1, 2)
    const firstPush = await push(b, server)
    expect(firstPush.stale).toBe(1)
    expect(await b.storage.countOutbox()).toBe(0)

    // Tanpa `observe(serverHlc)` HLC B tetap di bawah A dan tulisan berikutnya kalah lagi selamanya.
    await b.write(r1, 3)
    const secondPush = await push(b, server)
    expect(secondPush.applied).toBe(1)
    expect(server.rowOf(r1)?.blob).toBe(blobFor(3))
  })

  it('jam perangkat ngaco tidak menang melawan HLC', async () => {
    const server = createFakeServer()

    // Perangkat B jam dindingnya 2035-an, tapi jam monotoniknya di belakang A: HLC-nya tetap kecil.
    const skewedClock: Clock = {
      nowMs: () => START_MS + 500_000_000_000,
      monotonicMs: () => START_MS - 5_000,
    }

    const a = createDevice({ deviceId: 'devicea' })
    const b = createDevice({ deviceId: 'deviceb', clock: skewedClock })

    const r1 = recordIdFor(50)
    await b.write(r1, 9)
    await a.write(r1, 1)

    const hlcB = (await b.storage.getRecord(r1))?.hlc ?? ''
    const hlcA = (await a.storage.getRecord(r1))?.hlc ?? ''
    expect(compareHlc(hlcA, hlcB)).toBe(1)
    expect(b.clock.nowMs()).toBeGreaterThan(a.clock.nowMs())

    await sync(b, server)
    await sync(a, server)
    await sync(b, server)

    const onA = await versionOf(a, [r1])
    expectConverged(onA, await versionOf(b, [r1]), [r1])
    // Pemenang = versi HLC lebih besar (A), walau jam dinding B jauh "lebih baru".
    expect(onA.get(r1)?.blob).toBe(blobFor(1))
  })

  it('batch push dipecah mengikuti SYNC_MAX_BATCH (dan payload sesuai kontrak)', async () => {
    const server = createFakeServer()
    const a = createDevice({ deviceId: 'devicea' })

    await a.write(recordIdFor(60), 1)
    await a.write(recordIdFor(61), 2)
    await a.write(recordIdFor(62), 3)

    const first = await push(a, server, 2)
    expect(first.sent).toBe(2)
    expect(first.applied).toBe(2)
    expect(first.status).toBe('pending')

    const second = await push(a, server, 2)
    expect(second.sent).toBe(1)
    expect(second.status).toBe('synced')

    expect(server.pushSizes).toEqual([2, 1])
    expect(server.contractViolations).toEqual([])
  })

  it('beberapa baris outbox untuk satu record dikirim sekali lalu selesai bersama', async () => {
    const server = createFakeServer()
    const a = createDevice({ deviceId: 'devicea' })
    const r1 = recordIdFor(70)

    await a.write(r1, 1)
    expect(a.manualClock).not.toBeNull()
    if (a.manualClock !== null) a.manualClock.advance(1_000)
    await a.write(r1, 2)

    expect(await a.storage.countOutbox()).toBe(2)

    const result = await push(a, server)
    expect(result.sent).toBe(1)
    expect(result.applied).toBe(1)
    expect(await a.storage.countOutbox()).toBe(0)
    expect(server.pushSizes).toEqual([1])
  })
})

describe('sync engine - kegagalan', () => {
  it('status rejected: baris outbox disimpan dengan attempts + pesan generik', async () => {
    const rejectedBlob = blobFor(1)
    const server = createFakeServer({ rejectBlobs: [rejectedBlob] })
    const a = createDevice({ deviceId: 'devicea' })
    const r1 = recordIdFor(80)

    await a.write(r1, 1)

    const result = await push(a, server)
    expect(result.rejected).toBe(1)
    expect(result.applied).toBe(0)
    expect(result.status).toBe('error')

    const rows = await a.storage.listOutbox(10)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.attempts).toBe(1)
    expect(rows[0]?.lastError).toBe('REJECTED')
    expect(rows[0]?.lastError ?? '').not.toContain(rejectedBlob)
    expect(await readSyncStatus({ storage: a.storage, online: true, hasError: true })).toBe('error')
  })

  it('push tidak pernah menggeser cursor pull', async () => {
    const server = createFakeServer()
    const a = createDevice({ deviceId: 'devicea' })
    const b = createDevice({ deviceId: 'deviceb' })

    const r1 = recordIdFor(82)
    await a.write(r1, 1)
    await sync(a, server)

    // B sudah punya cursor hasil pull; push berikutnya tidak boleh melompatkannya ke `serverSeq`
    // record sendiri (`packages/contracts/src/sync.ts`: itu bisa melewati record perangkat lain).
    const before = await pull(b, server)
    if (b.manualClock !== null) b.manualClock.advance(1_000)
    await b.write(recordIdFor(83), 2)

    await push(b, server)

    const state = await b.storage.getSyncState()
    expect(state?.cursor).toBe(before.cursor)
    expect(state?.lastPushAtMs).toBe(b.clock.nowMs())
  })

  it('gagal jaringan (bukan jawaban server): status offline, outbox utuh', async () => {
    const offlineHttp: HttpClient = {
      postJson: async () => {
        throw new Error('network down')
      },
      getJson: async () => {
        throw new Error('network down')
      },
    }

    const clock = createManualClock(START_MS)
    const storage = createMemoryStorage({ clock })
    const hlc = createHlcGenerator({ deviceId: 'devicea', clock })

    await commitLocalWrite({
      storage,
      write: buildRecordWrite({
        sealed: { id: recordIdFor(90), hlc: hlc.tick(), deleted: false, blob: blobFor(1) },
        index: null,
        op: 'put',
        outbox: { id: 'outbox-offline', queuedAtMs: clock.nowMs() },
      }),
    })

    const pushResult = await pushOutbox({
      storage,
      http: offlineHttp,
      url: PUSH_URL,
      nowMs: clock.nowMs(),
      hlc,
    })
    expect(pushResult.status).toBe('offline')
    expect(await storage.countOutbox()).toBe(1)

    const pullResult = await pullDelta({
      storage,
      http: offlineHttp,
      url: PULL_URL,
      nowMs: clock.nowMs(),
      hlc,
    })
    expect(pullResult.status).toBe('offline')
    expect((await storage.getSyncState())?.status).toBe('offline')
  })
})
