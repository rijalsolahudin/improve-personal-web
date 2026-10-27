import { encodeKid } from '@improve-personal/contracts'
import type { HttpClient, StorageAdapter, StoredSyncState } from '@improve-personal/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TEST_KID_WIRE, v2BlobFor } from '../../../tests/nuxt/record-key'
import { runSync, startSync, stopSync } from './controller'
import { clearQuarantineForTest, isQuarantined, quarantineRecord } from './quarantine'
import { clearRejectedBlobsForTest, listRejectedBlobs } from './rejected-blobs'

import type { LocalDataSession } from '../storage/session'

/**
 * Asal blob hasil pull (spec #120 §4.4): blob ber-KID akun ini dibuka dan di-index, blob KID lain
 * (`foreign`) dan blob tidak sah (`reject`) dilewati TANPA menghentikan pull dan tanpa menyentuh index,
 * dan keduanya dicatat terpisah dari karantina kegagalan-kunci.
 */

const USER = '11111111-1111-4111-8111-111111111111'
const ID_PREFIX = '018f2c4e-0000-7000-8000-'
const OTHER_KID_WIRE = encodeKid(new Uint8Array(16).fill(5))
const NEXT_CURSOR = 7

function idOf(index: number): string {
  return `${ID_PREFIX}${String(index).padStart(12, '0')}`
}

function todoPayload(id: string): string {
  return JSON.stringify({
    type: 'todo',
    schemaVersion: 1,
    data: {
      id,
      title: 'Tugas dari perangkat lain',
      note: null,
      deadlineAt: null,
      priority: 'medium',
      isDone: false,
      completedAt: null,
      scheduleId: null,
      scheduleOccurrenceAt: null,
      createdAt: 1_000,
      updatedAt: 1_000,
    },
  })
}

type Remote = { id: string; hlc: string; deleted: boolean; blob: string; serverSeq: number }

function remote(index: number, blob: string, overrides: Partial<Remote> = {}): Remote {
  return {
    id: idOf(index),
    hlc: `${1_000 + index}-0-deviceb`,
    deleted: false,
    blob,
    serverSeq: index,
    ...overrides,
  }
}

type Write = {
  readonly sealed: { readonly id: string; readonly deleted: boolean }
  readonly index: unknown
  readonly opaque?: boolean
}

type Harness = {
  readonly session: LocalDataSession
  readonly writes: Write[]
  readonly opened: string[]
  readonly state: () => StoredSyncState
}

function harness(
  failAuth: (id: string) => boolean = () => false,
  local: readonly unknown[] = [],
): Harness {
  const writes: Write[] = []
  const opened: string[] = []
  let state: StoredSyncState = {
    deviceId: 'device-a',
    cursor: 0,
    status: 'offline',
    lastPullAtMs: null,
    lastPushAtMs: null,
  }

  const session = {
    userId: USER,
    kid: TEST_KID_WIRE,
    isFreshKey: false,
    storage: {
      listOutbox: vi.fn(async () => []),
      countOutbox: vi.fn(async () => 0),
      getRecords: vi.fn(async () => local),
      getSyncState: vi.fn(async () => state),
      runTransaction: vi.fn(async (_label: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          label: 'test',
          putRecord: async (write: Write) => {
            writes.push(write)
          },
          deleteOutboxRows: async () => undefined,
          patchSyncState: async (patch: Partial<StoredSyncState>) => {
            state = { ...state, ...patch }
          },
        }),
      ),
    } as unknown as StorageAdapter,
    clock: { nowMs: () => 1_000 },
    hlc: { tick: () => '1000-0-device-a', observe: vi.fn() },
    provider: {
      openRecord: async ({ recordId }: { recordId: string }) => {
        opened.push(recordId)
        if (failAuth(recordId)) throw new Error('AEAD gagal')

        return todoPayload(recordId)
      },
    },
    dataKey: {},
  } as unknown as LocalDataSession

  return { session, writes, opened, state: () => state }
}

function httpWith(records: readonly Remote[]): HttpClient {
  // Halaman pertama membawa record; sesudahnya kosong (cursor sudah di ujung), seperti server sungguhan.
  let served = false

  return {
    postJson: vi.fn(async () => ({ results: [] })),
    getJson: vi.fn(async () => {
      const page = served ? [] : records
      served = true

      return { records: page, nextCursor: NEXT_CURSOR }
    }),
  } as unknown as HttpClient
}

async function pull(h: Harness, records: readonly Remote[]) {
  startSync(h.session, 'https://app.test', { http: httpWith(records), autoStart: false })

  return runSync({ pull: true })
}

afterEach(() => {
  stopSync()
  clearQuarantineForTest()
  clearRejectedBlobsForTest()
})

describe('pull: asal blob', () => {
  it('blob v2 ber-KID akun ini: dibuka, di-index, ditulis', async () => {
    const h = harness()

    const outcome = await pull(h, [remote(1, v2BlobFor(TEST_KID_WIRE))])

    expect(outcome).toMatchObject({ pulled: 1 })
    expect(h.writes).toHaveLength(1)
    expect(h.writes[0]?.index).toMatchObject({ recordId: idOf(1), entityType: 'todo' })
    expect(listRejectedBlobs(USER)).toEqual([])
  })

  it('blob v2 KID lain: tidak dibuka, tidak di-index, dicatat foreign, pull jalan terus', async () => {
    const h = harness()

    const outcome = await pull(h, [
      remote(1, v2BlobFor(OTHER_KID_WIRE)),
      remote(2, v2BlobFor(TEST_KID_WIRE)),
    ])

    expect(h.opened).toEqual([idOf(2)])
    const foreign = h.writes.find((write) => write.sealed.id === idOf(1))
    // Foreign hanya boleh tersimpan opaque; `record_index` tidak boleh disentuh.
    expect(foreign?.index === undefined || foreign.index === 'keep').toBe(true)
    expect(h.writes.find((write) => write.sealed.id === idOf(2))?.index).toMatchObject({
      entityType: 'todo',
    })
    expect(listRejectedBlobs(USER)).toMatchObject([{ recordId: idOf(1), reason: 'foreign' }])
    expect(outcome).toMatchObject({ pulled: expect.any(Number) as number })
    expect(h.state().cursor).toBe(NEXT_CURSOR)
  })

  it.each([
    [
      'blob v1/tanpa prefix v2',
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'v1_closed',
    ],
  ])('%s: ditolak, tidak ditulis, dicatat reject', async (_label, blob, reason) => {
    const h = harness()

    const outcome = await pull(h, [remote(1, blob), remote(2, v2BlobFor(TEST_KID_WIRE))])

    expect(h.writes.map((write) => write.sealed.id)).toEqual([idOf(2)])
    expect(h.opened).toEqual([idOf(2)])
    expect(listRejectedBlobs(USER)).toMatchObject([{ recordId: idOf(1), reason }])
    expect(outcome?.status).not.toBe('error')
    expect(h.state().cursor).toBe(NEXT_CURSOR)
    expect(isQuarantined(USER, idOf(1))).toBe(false)
  })

  it('panjang ciphertext v2 tidak sah (bukan kelipatan 256): ditolak malformed_length', async () => {
    const h = harness()
    const good = Buffer.from(v2BlobFor(TEST_KID_WIRE), 'base64')
    const truncated = good.subarray(0, good.length - 5).toString('base64')

    await pull(h, [remote(1, truncated)])

    expect(h.writes).toEqual([])
    expect(h.opened).toEqual([])
    expect(listRejectedBlobs(USER)).toMatchObject([
      { recordId: idOf(1), reason: 'malformed_length' },
    ])
  })

  it('tombstone ber-KID akun ini yang gagal autentikasi: ditolak, TIDAK diterapkan sebagai hapus', async () => {
    const h = harness(() => true)

    await pull(h, [remote(1, v2BlobFor(TEST_KID_WIRE), { deleted: true })])

    expect(h.writes).toEqual([])
    expect(listRejectedBlobs(USER)).toMatchObject([{ recordId: idOf(1), reason: 'authentication' }])
  })

  it('satu halaman campuran tidak menghentikan sync loop', async () => {
    const h = harness()

    const outcome = await pull(h, [
      remote(1, 'AAAA'),
      remote(2, v2BlobFor(OTHER_KID_WIRE)),
      remote(3, v2BlobFor(TEST_KID_WIRE)),
    ])

    expect(outcome).not.toBeNull()
    expect(h.writes.some((write) => write.sealed.id === idOf(3))).toBe(true)
    expect(listRejectedBlobs(USER).map((entry) => entry.reason)).toEqual(
      expect.arrayContaining(['v1_closed', 'foreign']),
    )
  })

  it('tombstone sampah untuk id yang SUDAH terkarantina tetap lewat verdict penuh: record lokal tidak terhapus', async () => {
    const id = idOf(1)
    const h = harness(
      () => true,
      [
        {
          id,
          hlc: '1000-0-devicea',
          deleted: false,
          blob: v2BlobFor(TEST_KID_WIRE),
          createdAtMs: 1_000,
          updatedAtMs: 1_000,
        },
      ],
    )
    // Id sudah masuk karantina lama lewat jalur T78 pada siklus sebelumnya.
    quarantineRecord(USER, id)
    expect(isQuarantined(USER, id)).toBe(true)

    const outcome = await pull(h, [
      remote(1, v2BlobFor(TEST_KID_WIRE), { deleted: true, hlc: '9000-0-deviceb' }),
    ])

    expect(outcome).not.toBeNull()
    expect(h.writes.filter((write) => write.sealed.deleted)).toEqual([])
    expect(listRejectedBlobs(USER)).toMatchObject([{ recordId: id, reason: 'authentication' }])
  })
})
