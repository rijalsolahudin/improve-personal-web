import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type HttpClient,
  type SecureKeyMaterial,
} from '@improve-personal/core'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watch } from 'vue'

import ShellSyncStatus from '~/components/features/shell/ShellSyncStatus.vue'
import { resetGoalLinksHydrationForTest } from '~/composables/useGoalLinks'
import type { LocalDataState } from '~/composables/useLocalData'
import { resetLocalDataSessionForTest, useLocalData } from '~/composables/useLocalData'
import { resetTasksHydrationForTest, useTasks } from '~/composables/useTasks'
import { runSync, startSync, stopSync } from '~/utils/sync/controller'
import { resetSyncReloadersForTest } from '~/utils/sync/refresh'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import type { LocalDataSession } from '~/utils/storage/session'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { persistTask, removeTask } from '~/utils/tasks/persistence'
import type { Task } from '~/utils/tasks'

import { TEST_USER_A, signIn } from '../../../tests/nuxt/local-session'

/**
 * AC1-AK3 lewat jalur produksi `useLocalData` (bukan sesi suntikan): sesi perangkat B dibuka oleh
 * `openLocalDataSession` yang dipalsukan di batas modul, lalu store memakai `ensure()`/`current()`
 * seperti di aplikasi. Yang dibuktikan:
 *
 * - record dari perangkat A (tambah/edit/hapus) tampil di B TANPA reload halaman,
 * - pull kosong tidak menambah pembacaan storage,
 * - selama satu putaran reload TIDAK ada `loading`/sesi baru - rantai M1 review #77.
 *
 * Test ini melengkapi `refresh.cross-device.qa.test.ts` (yang memakai sesi suntikan) dengan menguji
 * `reloadSession(localData.current, getSession)`: jalur `current()` yang dipakai di produksi.
 */

const START_MS = 1_700_000_000_000
const BASE_URL = 'https://app.test'
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }

const openSession = vi.hoisted(() => vi.fn())

vi.mock('~/utils/storage/session', () => ({
  LocalKeyMissingError: class LocalKeyMissingError extends Error {},
  openLocalDataSession: openSession,
}))

const IDLE_STATE: LocalDataState = {
  status: 'idle',
  isFreshKey: false,
  deviceId: null,
  userId: null,
  error: null,
}

/** Kripto tiruan: yang diuji wiring, bukan libsodium (jalur asli diuji di test persistence). */
const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

function device(deviceId: string, startMs: number): LocalDataSession {
  const clock = createManualClock(startMs)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId, clock })

  return {
    storage,
    provider: fakeProvider,
    clock,
    dataKey: DATA_KEY,
    hlc,
    deviceId,
    userId: TEST_USER_A,
    isFreshKey: true,
    keyStore: {
      has: async () => false,
      put: async () => undefined,
      get: async () => null,
      remove: async () => undefined,
    },
    newId: createUuidV7Generator({ clock }),
    withMasterKey: async (work) => work(new Uint8Array(32)),
    repos: createRepositorySet({ storage, provider: fakeProvider, dataKey: DATA_KEY }),
    writer: createRecordWriter({ storage, provider: fakeProvider, dataKey: DATA_KEY, hlc, clock }),
  }
}

type ServerRow = {
  readonly id: string
  readonly hlc: string
  readonly deleted: boolean
  readonly blob: string
  readonly serverSeq: number
}

/** Server sync palsu di batas `HttpClient` (mock jaringan di batas, bukan mock controller). */
function fakeServer(): { readonly http: HttpClient; readonly rows: Map<string, ServerRow> } {
  const rows = new Map<string, ServerRow>()
  let seq = 0

  const http: HttpClient = {
    postJson: async <T>(_url: string, body: unknown): Promise<T> => {
      const records = (body as { records: readonly Omit<ServerRow, 'serverSeq'>[] }).records
      const results = records.map((record) => {
        seq += 1
        rows.set(record.id, { ...record, serverSeq: seq })
        return { id: record.id, status: 'applied' as const, serverSeq: seq }
      })

      return { results } as T
    },
    getJson: async <T>(url: string): Promise<T> => {
      const cursor = Number(new URL(url).searchParams.get('cursor') ?? '0')
      const page = [...rows.values()]
        .filter((row) => row.serverSeq > cursor)
        .sort((left, right) => left.serverSeq - right.serverSeq)
      const last = page.at(-1)

      return { records: page, nextCursor: last === undefined ? cursor : last.serverSeq } as T
    },
  }

  return { http, rows }
}

function taskOf(id: string, title: string): Task {
  return {
    id,
    title,
    priority: 'medium',
    deadline: null,
    done: false,
    scheduleId: null,
    quadrant: null,
    position: 0,
  }
}

/** Satu siklus push+pull seperti pemicu app_open, tanpa timer. */
async function cycle(session: LocalDataSession, http: HttpClient): Promise<void> {
  startSync(session, BASE_URL, { http, autoStart: false })
  await runSync({ pull: true })
  stopSync()
}

let shell: VueWrapper | null = null

beforeEach(() => {
  clearNuxtState([
    'localData',
    'auth-session',
    'auth-session-pending',
    'auth-session-error',
    'goalLinks',
    'tasks',
    'tasksStatus',
    'tasksError',
    'now',
  ])
  useState<LocalDataState>('localData').value = { ...IDLE_STATE }
  resetLocalDataSessionForTest()
  resetTasksHydrationForTest()
  resetGoalLinksHydrationForTest()
  resetSyncReloadersForTest()
  openSession.mockReset()
})

afterEach(async () => {
  stopSync()
  shell?.unmount()
  shell = null
  await flushPromises()
})

describe('T77 lewat sesi produksi: pull memperbarui store tanpa reload halaman', () => {
  it('tambah/edit/hapus dari A terlihat di B; pull kosong tidak membaca ulang; tanpa loading', async () => {
    const server = fakeServer()
    const deviceA = device('018f2c4e-0000-7000-8000-0000000000d1', START_MS)
    const deviceB = device('018f2c4e-0000-7000-8000-0000000000d2', START_MS + 5_000)

    openSession.mockResolvedValue(deviceB)
    signIn(TEST_USER_A)

    // Sesi B dibuka lewat jalur produksi `ensure()`.
    const localData = useLocalData()
    const opened = await localData.ensure()
    expect(opened?.userId).toBe(TEST_USER_A)

    // Pendengar event yang asli (shell) - hanya komponen ini yang memicu putaran reload.
    shell = await mountSuspended(ShellSyncStatus)
    await flushPromises()

    const store = useTasks()
    await vi.waitFor(() => expect(store.status.value).toBe('ready'))
    expect(store.tasks.value).toEqual([])

    const reads = vi.spyOn(deviceB.repos.todo, 'listAll')
    const statuses: string[] = []
    const stopStatusWatch = watch(
      () => localData.state.value.status,
      (next) => statuses.push(next),
      { flush: 'sync' },
    )

    try {
      // AC1: perangkat A menulis todo lalu mengirimnya; B menerima lewat pull.
      const todo = taskOf(deviceA.newId(), 'Beli susu')
      await persistTask(deviceA, todo)
      await cycle(deviceA, server.http)
      openSession.mockClear()

      await cycle(deviceB, server.http)
      await vi.waitFor(() =>
        expect(store.tasks.value.map((task) => task.title)).toEqual(['Beli susu']),
      )
      expect(reads).toHaveBeenCalledTimes(1)

      // AC3: pull yang tidak menerapkan apa pun tidak menambah pembacaan.
      await cycle(deviceB, server.http)
      await flushPromises()
      expect(reads).toHaveBeenCalledTimes(1)

      // AC2: edit di A (judul + selesai) ikut terlihat di B.
      await persistTask(deviceA, { ...todo, title: 'Beli susu oat', done: true })
      await cycle(deviceA, server.http)
      await cycle(deviceB, server.http)
      await vi.waitFor(() => {
        const seen = store.tasks.value.find((task) => task.id === todo.id)
        expect(seen?.title).toBe('Beli susu oat')
        expect(seen?.done).toBe(true)
      })

      // AC2: hapus di A ikut hilang di B.
      await removeTask(deviceA, todo.id)
      await cycle(deviceA, server.http)
      await cycle(deviceB, server.http)
      await vi.waitFor(() => expect(store.tasks.value).toEqual([]))

      // M1: reload memakai sesi yang SUDAH terbuka - tidak ada sesi baru, tidak ada `loading`.
      expect(openSession).not.toHaveBeenCalled()
      expect(statuses).toEqual([])
      expect(localData.state.value.status).toBe('ready')
    } finally {
      stopStatusWatch()
    }
  })
})
