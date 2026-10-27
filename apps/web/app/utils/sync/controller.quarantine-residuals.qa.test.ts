import type { HttpClient, StorageAdapter, StoredSyncState } from '@improve-personal/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { runSync, startSync, stopSync } from './controller'
import { clearQuarantineForTest, isQuarantined, quarantinedCount } from './quarantine'

import type { LocalDataSession } from '../storage/session'
import { TEST_KID_WIRE, TEST_V2_BLOB } from '../../../tests/nuxt/record-key'

/**
 * QA T78 putaran 3 - bentuk data LAIN yang masih bisa macet dengan bukti kunci level sesi
 * (`isFreshKey === false`, commit `30aa57c`). Bukan AC task; dipakai untuk menilai sisa risiko.
 *
 * Tiga bentuk yang diperiksa:
 * 1. halaman berisi record rusak + record yang versi lokalnya menang (`skipped`),
 * 2. user memuat ulang app SEBELUM tiga siklus selesai (penghitung gagal tidak persisten),
 * 3. `localStorage` diblokir sehingga karantina tidak bisa ditulis.
 *
 * Dua yang terakhir masih gagal; sengaja ditulis `it.fails` dengan komentar "sisa risiko" supaya
 * perilakunya terkunci dan tidak diklaim sebagai sudah pulih.
 */

const USER_A = '11111111-1111-4111-8111-111111111111'
const ID_PREFIX = '018f2c4e-0000-7000-8000-'
const GOOD_MARK = '1'
const BAD_MARK = '2'

function recordId(mark: string, index: number): string {
  return `${ID_PREFIX}${mark}${String(index).padStart(11, '0')}`
}

const goodId = (index: number): string => recordId(GOOD_MARK, index)
const badId = (index: number): string => recordId(BAD_MARK, index)

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

type Page = {
  readonly records: readonly {
    readonly id: string
    readonly hlc: string
    readonly deleted: boolean
    readonly blob: string
    readonly serverSeq: number
  }[]
  readonly nextCursor: number
}

function pageOf(ids: readonly string[], nextCursor: number): Page {
  return {
    records: ids.map((id, index) => ({
      id,
      hlc: `${1_000 + index}-0-deviceb`,
      deleted: false,
      blob: TEST_V2_BLOB,
      serverSeq: nextCursor,
    })),
    nextCursor,
  }
}

type PulledWrite = {
  readonly sealed: { readonly id: string; readonly blob: string }
  readonly index: unknown
}

function fakeSession(
  isBad: (recordId: string) => boolean,
  locals: readonly { readonly id: string; readonly hlc: string }[] = [],
  onWrite?: (write: PulledWrite) => void,
): LocalDataSession {
  let state: StoredSyncState = {
    deviceId: 'device-a',
    cursor: 0,
    status: 'offline',
    lastPullAtMs: null,
    lastPushAtMs: null,
  }

  return {
    userId: USER_A,
    kid: TEST_KID_WIRE,
    isFreshKey: false,
    storage: {
      listOutbox: vi.fn(async () => []),
      countOutbox: vi.fn(async () => 0),
      getRecords: vi.fn(async (ids: readonly string[]) =>
        locals
          .filter((local) => ids.includes(local.id))
          .map((local) => ({
            id: local.id,
            hlc: local.hlc,
            deleted: false,
            blob: 'LOCAL',
            createdAtMs: 500,
            updatedAtMs: 500,
          })),
      ),
      getSyncState: vi.fn(async () => state),
      runTransaction: vi.fn(async (_label: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          label: 'test',
          putRecord: async (write: PulledWrite) => onWrite?.(write),
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
      openRecord: async ({ recordId: id }: { recordId: string }) => {
        if (isBad(id)) throw new Error('blob rusak')
        return todoPayload(id)
      },
    },
    dataKey: {},
  } as unknown as LocalDataSession
}

function pagedHttp(pages: readonly Page[]): HttpClient {
  return {
    postJson: vi.fn(async () => ({ results: [] })),
    getJson: vi.fn(async (url: string) => {
      const cursor = Number(/cursor=(\d+)/.exec(url)?.[1] ?? '0')
      return pages[cursor] ?? { records: [], nextCursor: cursor }
    }),
  } as unknown as HttpClient
}

async function cycles(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) await runSync({ pull: true })
}

afterEach(() => {
  stopSync()
  clearQuarantineForTest()
  vi.unstubAllGlobals()
})

describe('QA T78/3: sisa risiko bentuk data lain', () => {
  it('record rusak satu halaman dengan record yang versi LOKALNYA menang: tetap pulih', async () => {
    // `logical-skip`: versi lokal goodId(1) ber-HLC lebih tinggi, jadi record itu `skipped` dan tidak
    // pernah didekripsi. Bukti kunci tidak boleh bergantung pada record itu - datang dari sesi.
    const http = pagedHttp([pageOf([badId(0), goodId(1)], 1)])
    const writes: PulledWrite[] = []
    const session = fakeSession(
      (id) => id === badId(0),
      [{ id: goodId(1), hlc: '2000-0-device-a' }],
      (write) => writes.push(write),
    )

    startSync(session, 'https://app.test', { http, autoStart: false })
    await cycles(5)

    expect(isQuarantined(USER_A, badId(0))).toBe(true)
    await expect(session.storage.getSyncState()).resolves.toMatchObject({
      cursor: 1,
      status: 'synced',
    })
    expect(writes.some((write) => write.sealed.id === goodId(1))).toBe(false)
  })

  it.fails(
    'sisa risiko R1: reload ANTAR siklus (penghitung gagal tidak persisten) masih menahan pull',
    async () => {
      // Bentuk nyata: tab mobile dibuang/ditutup sebelum tiga siklus interval (5 menit) selesai.
      // `consecutiveKeyFailures` hidup di modul dan direset `startSync`, sedangkan daftar karantina
      // persisten. Jadi tiap reload mengulang dari "gagal ke-1" dan pull tidak pernah maju.
      const http = pagedHttp([pageOf([goodId(0)], 1), pageOf([badId(0)], 2)])
      const session = fakeSession((id) => id === badId(0))

      startSync(session, 'https://app.test', { http, autoStart: false })
      await runSync({ pull: true })
      await expect(session.storage.getSyncState()).resolves.toMatchObject({ cursor: 1 })

      for (let reload = 0; reload < 6; reload += 1) {
        stopSync()
        startSync(session, 'https://app.test', { http, autoStart: false })
        await runSync({ pull: true })
      }

      expect(quarantinedCount(USER_A)).toBeGreaterThan(0)
      await expect(session.storage.getSyncState()).resolves.toMatchObject({ cursor: 2 })
    },
  )

  it.fails(
    'sisa risiko R2: localStorage diblokir membuat record rusak menahan pull selamanya',
    async () => {
      // `quarantineRecord()` no-op saat storage diblokir, dan controller menolak mengklaim pulih
      // (`keyFailures.quarantined` tetap false). Dengan bukti kunci dari sesi, seharusnya ada jalur
      // pulih yang tidak bergantung pada `localStorage` (mis. cache karantina di memori per sesi).
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('storage diblokir')
        },
        setItem: () => {
          throw new Error('storage diblokir')
        },
        removeItem: () => {
          throw new Error('storage diblokir')
        },
      })

      const http = pagedHttp([pageOf([badId(0)], 1), pageOf([goodId(1)], 2)])
      const session = fakeSession((id) => id === badId(0))

      startSync(session, 'https://app.test', { http, autoStart: false })
      await cycles(6)

      expect(quarantinedCount(USER_A)).toBe(1)
      await expect(session.storage.getSyncState()).resolves.toMatchObject({
        cursor: 2,
        status: 'synced',
      })
    },
  )
})
