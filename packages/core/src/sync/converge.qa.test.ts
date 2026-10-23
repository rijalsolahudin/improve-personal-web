import {
  compareHlc,
  syncPushInputSchema,
  type ServerRecord,
  type SyncPushResult,
} from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import { createManualClock, type ManualClock } from '../adapters/clock.ts'
import { createMemoryStorage } from '../adapters/memory.ts'
import { HttpError, type HttpClient, type HttpRequestInit, type StorageAdapter } from '../ports.ts'
import { createHlcGenerator, type HlcGenerator } from './hlc.ts'
import { buildRecordWrite, commitLocalWrite, syncOpFor } from './outbox.ts'
import { pullDelta, type PullSummary } from './pull.ts'
import { pushOutbox, type PushSummary } from './push.ts'
import { readSyncStatus } from './status.ts'

/**
 * Test regresi QA untuk AC T21: konvergensi dua perangkat dan status sync.
 *
 * Berkas ini sengaja terpisah dari `engine.test.ts` karena setiap test di sini mereproduksi bug yang
 * ditemukan QA (laporan `reports/qa-t21-sync-engine.md`), bukan perilaku yang sudah benar:
 *
 * - `BUG-1` (High): HLC lokal tidak pernah `observe()` HLC hasil pull, jadi edit yang dilakukan
 *   SETELAH pull bisa kalah dari versi lama perangkat lain yang jamnya lebih maju. Baris outbox
 *   dihapus sebagai `stale`, status jadi `synced`, dan dua perangkat berhenti sepakat tanpa error.
 * - `BUG-2` (Medium): `pullDelta` berhenti saat `records.length < limit`. Server boleh memotong
 *   halaman karena plafon BYTE (`SYNC_MAX_PULL_BYTES`), dan kontrak `packages/contracts/src/sync.ts`
 *   menyatakan klien WAJIB melanjutkan dari `nextCursor`, bukan menganggap halaman pendek = selesai.
 * - `BUG-3` (Medium): `pullDelta` menimpa status `error` (baris outbox `rejected`) menjadi `pending`,
 *   jadi kegagalan permanen terlihat seperti antrean biasa.
 *
 * Ketiganya sudah diperbaiki di kode produk, jadi berjalan sebagai `it` biasa - bukan `it.fails`.
 * Assertion sengaja tetap ditulis terhadap bunyi AC/ARCHITECTURE, bukan terhadap implementasi.
 *
 * Dua test `REGRESI:` di bawah menjaga perilaku yang tidak boleh kambuh saat perbaikan dirapikan:
 * deteksi `lastError` di seluruh antrean (bukan baris pertama saja) dan pagar anti-loop pull saat
 * server tidak memajukan `nextCursor`.
 */

const START_MS = 1_700_000_000_000
const PUSH_URL = '/v1/sync/push'
const PULL_URL = '/v1/sync/pull'

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Blob palsu yang tetap sah sebagai base64 (kontrak `sealedRecordDtoSchema`). */
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

type ServerRow = ServerRecord

type FakeServer = {
  readonly http: HttpClient
  readonly pullCalls: readonly { readonly cursor: number; readonly limit: number }[]
  readonly serverSeqOf: (id: string) => number | null
}

/**
 * Server relay mini: LWW HLC + cursor `serverSeq`.
 *
 * `pageCap` meniru pemotongan halaman oleh plafon byte di server nyata
 * (`apps/web/server/services/sync.ts` `takeWithinByteBudget`): halaman boleh LEBIH PENDEK dari
 * `limit` yang diminta klien walau masih ada record setelahnya.
 */
function createFakeServer(options?: {
  readonly rejectBlobs?: readonly string[]
  readonly pageCap?: number
}): FakeServer {
  const rows = new Map<string, ServerRow>()
  const pullCalls: { cursor: number; limit: number }[] = []
  const rejectBlobs = new Set(options?.rejectBlobs ?? [])
  const pageCap = options?.pageCap ?? Number.POSITIVE_INFINITY

  let seq = 0

  const http: HttpClient = {
    postJson: async <T>(_url: string, body: unknown, _init?: HttpRequestInit): Promise<T> => {
      void _url
      void _init

      const parsed = syncPushInputSchema.safeParse(body)
      if (!parsed.success)
        throw new HttpError(400, 'VALIDATION_FAILED', 'push tidak sesuai kontrak')

      const results: SyncPushResult['results'] = parsed.data.records.map((record) => {
        if (rejectBlobs.has(record.blob)) return { id: record.id, status: 'rejected' }

        const existing = rows.get(record.id)
        if (existing === undefined || compareHlc(record.hlc, existing.hlc) > 0) {
          seq += 1
          rows.set(record.id, { ...record, serverSeq: seq })
          return { id: record.id, status: 'applied', serverSeq: seq }
        }

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

      const page = [...rows.values()]
        .filter((row) => row.serverSeq > cursor)
        .sort((a, b) => a.serverSeq - b.serverSeq)
        .slice(0, Math.min(limit, pageCap))

      const last = page.at(-1)
      return {
        records: page,
        nextCursor: last === undefined ? cursor : last.serverSeq,
      } as unknown as T
    },
  }

  return {
    http,
    pullCalls,
    serverSeqOf: (id) => rows.get(id)?.serverSeq ?? null,
  }
}

type Device = {
  readonly deviceId: string
  readonly storage: StorageAdapter
  readonly hlc: HlcGenerator
  readonly clock: ManualClock
  readonly write: (recordId: string, seed: number, deleted?: boolean) => Promise<void>
}

function createDevice(options: { readonly deviceId: string; readonly clock: ManualClock }): Device {
  const storage = createMemoryStorage({ clock: options.clock })
  const hlc = createHlcGenerator({ deviceId: options.deviceId, clock: options.clock })
  let outboxCounter = 0

  return {
    deviceId: options.deviceId,
    storage,
    hlc,
    clock: options.clock,
    write: async (recordId, seed, deleted = false) => {
      outboxCounter += 1
      const sealed = { id: recordId, hlc: hlc.tick(), deleted, blob: blobFor(seed) }
      await commitLocalWrite({
        storage,
        write: buildRecordWrite({
          sealed,
          index: null,
          op: syncOpFor(sealed),
          outbox: {
            id: `outbox-${options.deviceId}-${outboxCounter}`,
            queuedAtMs: options.clock.nowMs(),
          },
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

async function versionOf(
  device: Device,
  id: string,
): Promise<{ hlc: string; deleted: boolean; blob: string } | null> {
  const record = await device.storage.getRecord(id)
  return record === null ? null : { hlc: record.hlc, deleted: record.deleted, blob: record.blob }
}

describe('QA T21 - konvergensi dua perangkat', () => {
  it('BUG-1: edit lokal SETELAH pull tetap menang walau jam perangkat lain lebih maju', async () => {
    const server = createFakeServer()

    // Perangkat A jamnya 60 detik di depan B. Ini normal antar perangkat; HLC ada justru untuk
    // membuat perbandingan tetap benar saat jam tidak sepakat.
    const a = createDevice({
      deviceId: 'devicez',
      clock: createManualClock(START_MS + 60_000),
    })
    const b = createDevice({ deviceId: 'devicea', clock: createManualClock(START_MS) })

    const r1 = recordIdFor(1)
    await a.write(r1, 1)
    await sync(a, server)
    await pull(b, server)
    expect((await versionOf(b, r1))?.blob).toBe(blobFor(1))

    // B mengubah record itu SEKARANG - secara sebab-akibat ini update terakhir dan harus menang
    // (PRD F15 "Konflik: update terakhir menang per record").
    await b.write(r1, 2)
    await sync(b, server)
    await sync(a, server)

    // Kedua sisi harus menampilkan edit B, dan status B jujur: `synced` hanya kalau outbox kosong
    // dan tidak ada kegagalan tersisa.
    expect(await b.storage.getSyncState().then((state) => state?.status)).toBe('synced')
    expect((await versionOf(b, r1))?.blob).toBe(blobFor(2))
    expect(await versionOf(a, r1)).toEqual(await versionOf(b, r1))
  })

  it('BUG-2: halaman pendek karena plafon byte tetap dilanjutkan sampai cursor terakhir', async () => {
    // Server memotong halaman jadi 2 record walau klien minta 5 - persis perilaku
    // `takeWithinByteBudget` saat total ciphertext melewati `SYNC_MAX_PULL_BYTES`.
    const server = createFakeServer({ pageCap: 2 })
    const a = createDevice({ deviceId: 'devicea', clock: createManualClock(START_MS) })
    const b = createDevice({ deviceId: 'deviceb', clock: createManualClock(START_MS) })

    const ids = [1, 2, 3, 4, 5].map((n) => recordIdFor(10 + n))
    for (const [index, id] of ids.entries()) await a.write(id, index + 1)
    await sync(a, server)

    const pulled = await pull(b, server, { pageLimit: 5 })

    expect(pulled.pages).toBe(3)
    expect(pulled.applied).toBe(5)
    expect(pulled.cursor).toBe(server.serverSeqOf(ids[4] ?? '') ?? -1)
    expect(await b.storage.getRecords(ids)).toHaveLength(5)
  })

  it('REGRESI: lastError pada baris outbox paling belakang tetap membuat status error', async () => {
    // `readSyncStatus` tidak boleh cuma memeriksa baris pertama antrean: baris gagal bisa berada di
    // urutan belakang (`queued_at` terbaru) dan statusnya tidak boleh turun jadi `pending`.
    const clock = createManualClock(START_MS)
    const device = createDevice({ deviceId: 'devicea', clock })

    for (const n of [1, 2, 3]) {
      clock.advance(1_000)
      await device.write(recordIdFor(30 + n), n)
    }

    expect(await readSyncStatus({ storage: device.storage, online: true })).toBe('pending')

    await device.storage.markOutboxFailure('outbox-devicea-3', { lastError: 'REJECTED' })

    expect(await readSyncStatus({ storage: device.storage, online: true })).toBe('error')
  })

  it('REGRESI: pull berhenti kalau server tidak memajukan nextCursor', async () => {
    // Pagar anti-loop: halaman berisi record tapi `nextCursor` tidak maju tidak boleh diminta terus.
    const clock = createManualClock(START_MS)
    const device = createDevice({ deviceId: 'devicea', clock })
    const row = {
      id: recordIdFor(40),
      hlc: '1700000000000-0-devicez',
      deleted: false,
      blob: blobFor(1),
      serverSeq: 1,
    }
    let calls = 0

    const http: HttpClient = {
      postJson: async <T>(): Promise<T> => ({ results: [] }) as unknown as T,
      getJson: async <T>(): Promise<T> => {
        calls += 1
        return { records: [row], nextCursor: 0 } as unknown as T
      },
    }

    const pulled = await pullDelta({
      storage: device.storage,
      http,
      url: PULL_URL,
      nowMs: clock.nowMs(),
      hlc: device.hlc,
    })

    expect(calls).toBe(1)
    expect(pulled.pages).toBe(1)
    expect(pulled.applied).toBe(1)
  })

  it('BUG-3: status error karena baris rejected tidak diturunkan jadi pending oleh pull', async () => {
    const rejectedBlob = blobFor(1)
    const server = createFakeServer({ rejectBlobs: [rejectedBlob] })
    const a = createDevice({ deviceId: 'devicea', clock: createManualClock(START_MS) })

    await a.write(recordIdFor(20), 1)

    const pushed = await push(a, server)
    expect(pushed.status).toBe('error')
    expect((await a.storage.getSyncState())?.status).toBe('error')

    // Sync berikutnya selalu push lalu pull. Pull melihat outbox masih berisi baris rejected, dan
    // status harus tetap `error` - bukan turun jadi `pending` yang tak pernah selesai.
    const pulled = await pull(a, server)

    expect(pulled.status).toBe('error')
    expect((await a.storage.getSyncState())?.status).toBe('error')
    expect((await a.storage.listOutbox(10)).at(0)?.lastError).toBe('REJECTED')
  })
})
