import type { HttpClient, StorageAdapter, StoredSyncState } from '@improve-personal/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LocalDataSession } from '../storage/session'
import { isSyncRunning, resetSyncActivityForTest } from './activity'
import { runSync, startSync, stopSync } from './controller'

/**
 * Regresi T105 (AC6): sinyal "sedang sync" yang menghidupkan pill "Menyinkronkan…" harus seimbang.
 *
 * Siklus yang selesai normal, gagal, atau dibatalkan `stopSync` sama-sama menutup hitungannya lewat
 * `finally` - kalau satu jalur terlewat, spinner berputar selamanya tanpa ada siklus yang berjalan.
 * Test ini memakai controller sungguhan (bukan `markSyncRunStart` manual) supaya yang terbukti adalah
 * integrasinya, bukan cuma registry-nya.
 */

const USER_A = '11111111-1111-4111-8111-111111111111'

function fakeSession(): LocalDataSession {
  let state: StoredSyncState = {
    deviceId: 'device-a',
    cursor: 0,
    status: 'offline',
    lastPullAtMs: null,
    lastPushAtMs: null,
  }

  return {
    userId: USER_A,
    storage: {
      listOutbox: vi.fn(async () => []),
      countOutbox: vi.fn(async () => 0),
      getRecords: vi.fn(async () => []),
      getSyncState: vi.fn(async () => state),
      runTransaction: vi.fn(async (_label: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          label: 'test',
          putRecord: async () => undefined,
          deleteOutboxRows: async () => undefined,
          patchSyncState: async (patch: Partial<StoredSyncState>) => {
            state = { ...state, ...patch }
          },
        }),
      ),
    } as unknown as StorageAdapter,
    clock: { nowMs: () => 1_000 },
    hlc: { tick: () => '1000-0-device-a', observe: vi.fn() },
    provider: { openRecord: async () => '' },
    dataKey: {},
  } as unknown as LocalDataSession
}

/** Pull yang jawabannya ditahan sampai test melepasnya - untuk melihat keadaan DI TENGAH siklus. */
function heldPull() {
  let release: (value: unknown) => void = () => undefined
  const getJson = vi.fn(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )

  return {
    http: { postJson: vi.fn(async () => ({ results: [] })), getJson } as unknown as HttpClient,
    release: () =>
      release({
        data: { records: [], nextCursor: 0 },
        records: [],
        nextCursor: 0,
      }),
  }
}

function httpOf(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    postJson: vi.fn(async () => ({ results: [] })),
    getJson: vi.fn(async () => ({ records: [], nextCursor: 0 })),
    ...overrides,
  } as unknown as HttpClient
}

afterEach(() => {
  stopSync()
  resetSyncActivityForTest()
  vi.useRealTimers()
})

describe('sinyal aktivitas sync dari controller', () => {
  it('siklus berjalan menyalakan sinyal dan mematikannya setelah selesai', async () => {
    const { http, release } = heldPull()

    startSync(fakeSession(), 'https://app.test', { http, autoStart: false })
    const running = runSync({ pull: true })

    await vi.waitFor(() => expect(http.getJson).toHaveBeenCalledTimes(1))
    expect(isSyncRunning()).toBe(true)

    release()
    await running

    expect(isSyncRunning()).toBe(false)
  })

  it('siklus yang gagal tidak meninggalkan sinyal menyala', async () => {
    const http = httpOf({
      getJson: vi.fn(async () => {
        throw new Error('jaringan putus')
      }) as unknown as HttpClient['getJson'],
    })

    startSync(fakeSession(), 'https://app.test', { http, autoStart: false })
    await runSync({ pull: true })

    expect(isSyncRunning()).toBe(false)
  })

  it('stopSync saat siklus menggantung menutup sinyal (tidak ada spinner yatim)', async () => {
    const http = httpOf({
      getJson: vi.fn(
        (_url: string, init?: { readonly signal?: AbortSignal }) =>
          new Promise<never>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            })
          }),
      ) as unknown as HttpClient['getJson'],
    })

    startSync(fakeSession(), 'https://app.test', { http, autoStart: false })
    const running = runSync({ pull: true })

    await vi.waitFor(() => expect(http.getJson).toHaveBeenCalledTimes(1))
    expect(isSyncRunning()).toBe(true)

    stopSync()

    await expect(running).resolves.toBeNull()
    expect(isSyncRunning()).toBe(false)
  })
})
