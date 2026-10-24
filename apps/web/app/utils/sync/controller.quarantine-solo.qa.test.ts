import type { HttpClient, StorageAdapter, StoredSyncState } from '@improve-personal/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { runSync, startSync, stopSync } from './controller'
import { clearQuarantineForTest, isQuarantined, quarantinedCount } from './quarantine'

import type { LocalDataSession } from '../storage/session'

/**
 * QA T78 - jalur pemulihan record gagal-dekripsi yang sendirian di halamannya (AC #2).
 *
 * Bug aslinya: `decidePullKeyFailures` memakai `keyFailures.decoded === 0` (record yang berhasil
 * didekripsi DI SIKLUS itu) sebagai bukti "kunci salah, bukan record rusak". Di halaman yang hanya
 * berisi record rusak - akun kecil, halaman terakhir, atau halaman yang record sehatnya sudah diterapkan
 * di siklus sebelumnya - `decoded` selalu 0, penghitung mentok di 1, record TIDAK PERNAH dikarantina,
 * dan cursor berhenti selamanya.
 *
 * Perbaikannya memakai bukti level SESI: sesi yang membuka kunci dari envelope perangkat yang sudah
 * ada (`isFreshKey === false`) sudah membuktikan kunci akunnya, sementara perangkat dengan kunci baru
 * (`isFreshKey === true`) tetap harus membuka satu record dulu. Dua test di bawah mengunci kedua sisi
 * perilaku itu - pemulihan tetap terjadi, dan pagar "jangan lewati data yang mungkin hanya butuh kunci
 * benar" tidak dilonggarkan.
 */

const BAD_ID = '018f2c4e-0000-7000-8000-0000000000d1'
const GOOD_ID = '018f2c4e-0000-7000-8000-0000000000d2'
const USER_A = '11111111-1111-4111-8111-111111111111'

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

const GOOD_PAYLOAD = todoPayload(GOOD_ID)

/** Satu halaman pull. */
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
      blob: 'AAAA',
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
  openRecord: (recordId: string) => Promise<string>,
  onWrite?: (write: PulledWrite) => void,
  /** `LocalDataSession.isFreshKey`. Default `false`: kunci dibuka dari envelope yang sudah ada. */
  isFreshKey = false,
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
    isFreshKey,
    storage: {
      listOutbox: vi.fn(async () => []),
      countOutbox: vi.fn(async () => 0),
      // Tidak ada record lokal: setiap record server adalah kandidat merge.
      getRecords: vi.fn(async () => []),
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
    provider: { openRecord: async ({ recordId }: { recordId: string }) => openRecord(recordId) },
    dataKey: {},
  } as unknown as LocalDataSession
}

/** Server palsu: jawab berdasarkan `cursor` di URL, seperti endpoint pull berhalaman. */
function pagedHttp(pages: readonly Page[]): HttpClient {
  return {
    postJson: vi.fn(async () => ({ results: [] })),
    getJson: vi.fn(async (url: string) => {
      const cursor = Number(/cursor=(\d+)/.exec(url)?.[1] ?? '0')
      return pages[cursor] ?? { records: [], nextCursor: cursor }
    }),
  } as unknown as HttpClient
}

afterEach(() => {
  stopSync()
  clearQuarantineForTest()
})

describe('QA T78: record rusak tanpa record sehat di halaman yang sama', () => {
  it('record rusak di halaman sendiri setelah halaman sehat: dikarantina dan pull maju', async () => {
    // Halaman 0 sehat (cursor jadi 1), halaman 1 berisi satu record rusak. Kunci TERBUKTI benar:
    // record sehat di siklus pertama berhasil didekripsi.
    const writes: PulledWrite[] = []
    const http = pagedHttp([pageOf([GOOD_ID], 1), pageOf([BAD_ID], 2)])
    const session = fakeSession(
      async (recordId) => {
        if (recordId === BAD_ID) throw new Error('blob rusak')
        return GOOD_PAYLOAD
      },
      (write) => writes.push(write),
    )

    startSync(session, 'https://app.test', { http, autoStart: false })

    for (let cycle = 0; cycle < 5; cycle += 1) await runSync({ pull: true })

    // AC #2: setelah 3 siklus berturut-turut, record dikarantina supaya pull bisa maju.
    expect(isQuarantined(USER_A, BAD_ID)).toBe(true)
    await vi.waitFor(async () => {
      await expect(session.storage.getSyncState()).resolves.toMatchObject({
        cursor: 2,
        status: 'synced',
      })
    })

    // Blob record rusak TETAP disimpan (tidak ada data yang dibuang); index lamanya tidak disentuh.
    const bad = writes.find((write) => write.sealed.id === BAD_ID)
    expect(bad?.sealed.blob).toBe('AAAA')
    expect(bad?.index).toBe('keep')
  })

  it('perangkat baru dengan satu record rusak: kunci belum terbukti, TIDAK dikarantina', async () => {
    // Perangkat pertama akun yang BARU membuat kunci (`isFreshKey: true`): tidak ada envelope akun
    // yang memverifikasi apa pun, jadi pull pertama yang seluruhnya gagal tidak bisa dibedakan dari
    // kunci yang salah. Pull tetap berhenti dengan status `error` dan cursor tidak maju; user
    // memulihkan/menyiapkan kuncinya dulu. Ini sengaja fail-closed.
    const writes: PulledWrite[] = []
    const http = pagedHttp([pageOf([BAD_ID], 1)])
    const session = fakeSession(
      async (recordId) => {
        if (recordId === BAD_ID) throw new Error('blob rusak')
        return GOOD_PAYLOAD
      },
      (write) => writes.push(write),
      true,
    )

    startSync(session, 'https://app.test', { http, autoStart: false })

    for (let cycle = 0; cycle < 5; cycle += 1) await runSync({ pull: true })

    expect(isQuarantined(USER_A, BAD_ID)).toBe(false)
    expect(quarantinedCount(USER_A)).toBe(0)
    expect(writes).toEqual([])
    await expect(session.storage.getSyncState()).resolves.toMatchObject({
      cursor: 0,
      status: 'error',
    })
  })
})
