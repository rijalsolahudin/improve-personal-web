import type { HttpClient, StorageAdapter, StoredSyncState } from '@improve-personal/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { runSync, startSync, stopSync } from './controller'
import {
  QUARANTINE_MAX_RECORDS,
  clearQuarantine,
  clearQuarantineForTest,
  isQuarantined,
  quarantineRecord,
  quarantinedCount,
} from './quarantine'

import type { LocalDataSession } from '../storage/session'
import { TEST_KID_WIRE, TEST_V2_BLOB } from '../../../tests/nuxt/record-key'

/**
 * Pemulihan record terkarantina.
 *
 * Karantina ada supaya pull bisa maju, bukan untuk menyembunyikan record selamanya. Dua jalan keluar
 * yang diuji di sini:
 *
 * 1. `clearQuarantine(owner)` (dipakai setelah pemulihan kunci dan tombol "Coba buka ulang") membuat
 *    record DICOBA lagi - bukan langsung `RECORD_INDEX_KEEP` - dan setelah tiga siklus gagal ia
 *    dikarantina kembali.
 * 2. Saat daftar sudah penuh, karantina baru tidak boleh menjadwalkan siklus susulan: id yang terbuang
 *    untuk memberi tempat pasti gagal lagi, sehingga siklus susulan hanya berputar tanpa jeda (L2).
 */

const USER_A = '11111111-1111-4111-8111-111111111111'
const BAD_ID = '018f2c4e-0000-7000-8000-0000000000e1'
const NEW_BAD_ID = '018f2c4e-0000-7000-8000-0000000000e2'

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

/**
 * Sesi dengan kunci yang sudah terbukti (`isFreshKey: false`) dan cursor yang tersimpan di closure.
 * `onOpen` menghitung berapa kali satu record benar-benar dicoba didekripsi.
 */
function fakeSession(
  isBad: (recordId: string) => boolean,
  onOpen?: (recordId: string) => void,
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
      getRecords: vi.fn(async () => []),
      getSyncState: vi.fn(async () => state),
      runTransaction: vi.fn(async (_label: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          label: 'test',
          putRecord: async (_write: PulledWrite) => undefined,
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
        onOpen?.(recordId)
        if (isBad(recordId)) throw new Error('blob rusak')
        return todoPayload(recordId)
      },
    },
    dataKey: {},
  } as unknown as LocalDataSession
}

/** Jeda satu makrotask yang benar-benar menghormati `AbortSignal`, seperti `fetch` sungguhan. */
function abortableDelay(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const timer = setTimeout(resolve, 0)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

function pagedHttp(pages: readonly Page[]): HttpClient {
  return {
    postJson: vi.fn(async () => ({ results: [] })),
    getJson: vi.fn(async (url: string, init?: { readonly signal?: AbortSignal }) => {
      await abortableDelay(init?.signal)
      const cursor = Number(/cursor=(\d+)/.exec(url)?.[1] ?? '0')
      return pages[cursor] ?? { records: [], nextCursor: cursor }
    }),
  } as unknown as HttpClient
}

afterEach(() => {
  stopSync()
  clearQuarantineForTest()
})

describe('record terkarantina dicoba lagi setelah karantina dibersihkan', () => {
  it('membuka record lagi, lalu mengarantinanya kembali setelah tiga siklus gagal', async () => {
    const http = pagedHttp([pageOf([BAD_ID], 1)])
    const opened: string[] = []
    const session = fakeSession(
      (id) => id === BAD_ID,
      (id) => opened.push(id),
    )
    startSync(session, 'https://app.test', { http, autoStart: false })
    for (let cycle = 0; cycle < 3; cycle += 1) await runSync({ pull: true })

    // Hentikan siklus susulan supaya cursor tetap di halaman yang sama - inilah keadaan ketika user
    // memulihkan kunci sebelum record sempat dilewati. Jeda satu makrotask memberi siklus yang
    // dibatalkan kesempatan berhenti sebelum daftar karantina dibersihkan.
    stopSync()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(isQuarantined(USER_A, BAD_ID)).toBe(true)
    const openedWhileQuarantined = opened.filter((id) => id === BAD_ID).length

    clearQuarantine(USER_A)
    expect(isQuarantined(USER_A, BAD_ID)).toBe(false)

    startSync(session, 'https://app.test', { http, autoStart: false })

    // Siklus pertama sesudah dibersihkan BENAR-BENAR mendekripsi record (bukan `RECORD_INDEX_KEEP`).
    await runSync({ pull: true })
    expect(opened.filter((id) => id === BAD_ID).length).toBe(openedWhileQuarantined + 1)
    expect(isQuarantined(USER_A, BAD_ID)).toBe(false)

    // Dua siklus berikutnya melengkapi ambang tiga kali berturut-turut.
    await runSync({ pull: true })
    await runSync({ pull: true })

    expect(isQuarantined(USER_A, BAD_ID)).toBe(true)
  })
})

describe('karantina penuh tidak menjadwalkan siklus susulan (L2)', () => {
  it('karantina baru saat daftar 200 tidak memicu putaran kedua', async () => {
    for (let index = 0; index < QUARANTINE_MAX_RECORDS; index += 1) {
      quarantineRecord(USER_A, `old-${index}`)
    }
    expect(quarantinedCount(USER_A)).toBe(QUARANTINE_MAX_RECORDS)

    const http = pagedHttp([pageOf([NEW_BAD_ID], 1)])
    const opened: string[] = []
    const session = fakeSession(
      (id) => id === NEW_BAD_ID,
      (id) => opened.push(id),
    )

    startSync(session, 'https://app.test', { http, autoStart: false })
    // Tiga siklus: ambang karantina tetap berlaku sama seperti daftar yang belum penuh.
    let outcome = await runSync({ pull: true })
    for (let cycle = 1; cycle < 3; cycle += 1) outcome = await runSync({ pull: true })

    // Beri kesempatan siklus susulan (kalau salah dijadwalkan) untuk memanggil server lagi.
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Karantina penuh tidak boleh menyembunyikan kegagalan: status tetap `error`.
    expect(outcome?.status).toBe('error')
    expect(opened).toEqual([NEW_BAD_ID, NEW_BAD_ID, NEW_BAD_ID])
    // Tidak ada permintaan keempat: daftar penuh, jadi siklus susulan tidak dijadwalkan.
    expect(http.getJson).toHaveBeenCalledTimes(3)

    expect(quarantinedCount(USER_A)).toBe(QUARANTINE_MAX_RECORDS)
    expect(isQuarantined(USER_A, NEW_BAD_ID)).toBe(true)
    // Id tertua terbuang untuk memberi tempat - justru itu yang tidak boleh diputar terus.
    expect(isQuarantined(USER_A, 'old-0')).toBe(false)
  })
})
