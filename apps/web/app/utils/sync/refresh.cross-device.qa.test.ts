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
import { resetTasksHydrationForTest, useTasks } from '~/composables/useTasks'
import { SYNC_REMOTE_APPLIED_EVENT } from '~/utils/sync/events'
import { runSync, startSync, stopSync } from '~/utils/sync/controller'
import { registerSyncReloader, resetSyncReloadersForTest } from '~/utils/sync/refresh'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import type { LocalDataSession } from '~/utils/storage/session'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { persistTask, removeTask } from '~/utils/tasks/persistence'
import type { Task } from '~/utils/tasks'
import { TEST_KID_WIRE, fakeV2Open, fakeV2Seal } from '../../../tests/nuxt/record-key'

/**
 * AC T77 dibuktikan sebagai alur lintas perangkat, bukan hanya "reload() menulis state".
 *
 * Dua "perangkat" = dua `StorageAdapter` memori terpisah + dua sesi berbeda deviceId, disambungkan
 * satu server palsu di batas `HttpClient` (mock jaringan di batas, bukan mock composable). Push/pull
 * yang dipakai adalah kode produksi (`utils/sync/controller` + engine core), dan pendengar event-nya
 * adalah komponen shell yang sesungguhnya.
 *
 * Satu proses test hanya punya satu instance Nuxt, jadi perpindahan perangkat disimulasikan dengan
 * membuang `useState` + state modul composable - sama seperti membuka aplikasi di perangkat lain.
 */

const START_MS = 1_700_000_000_000
const BASE_URL = 'https://app.test'
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }

const IDLE_STATE: LocalDataState = {
  status: 'idle',
  isFreshKey: false,
  deviceId: null,
  userId: null,
  error: null,
}

const STATE_KEYS = ['tasks', 'tasksStatus', 'tasksError', 'localData', 'goalLinks']

/** Kripto tiruan: yang diuji wiring, bukan libsodium (jalur asli diuji di test persistence). */
const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => fakeV2Seal(plaintext),
  openRecord: async ({ blob }) => fakeV2Open(blob),
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
    kid: TEST_KID_WIRE,
    hlc,
    deviceId,
    userId: USER_ID,
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

/**
 * Server sync palsu: hanya menyimpan ciphertext + metadata dan menyajikan delta lewat cursor, persis
 * bagian yang dipakai klien. Test ini hanya menulis dari satu perangkat, jadi LWW server tidak perlu
 * disimulasikan - yang diuji adalah "record sampai ke perangkat lain", bukan tie-break HLC.
 */
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
      const params = new URL(url).searchParams
      const cursor = Number(params.get('cursor') ?? '0')
      const limit = Number(params.get('limit') ?? '200')
      const page = [...rows.values()]
        .filter((row) => row.serverSeq > cursor)
        .sort((left, right) => left.serverSeq - right.serverSeq)
        .slice(0, limit)
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

/** Dorong outbox perangkat ke server palsu (jalur push produksi, tanpa timer). */
async function push(session: LocalDataSession, http: HttpClient): Promise<void> {
  startSync(session, BASE_URL, { http, autoStart: false })
  await runSync({ pull: false })
  stopSync()
}

/** Satu siklus pull seperti pemicu app_open/interval: push kosong + pull delta + event. */
async function pull(session: LocalDataSession, http: HttpClient): Promise<void> {
  startSync(session, BASE_URL, { http, autoStart: false })
  await runSync({ pull: true })
  stopSync()
}

let shell: VueWrapper | null = null

beforeEach(() => {
  clearNuxtState(STATE_KEYS)
  resetTasksHydrationForTest()
  resetGoalLinksHydrationForTest()
  resetSyncReloadersForTest()
})

afterEach(async () => {
  stopSync()
  shell?.unmount()
  shell = null
  await flushPromises()
})

describe('T77: data lintas perangkat tanpa reload halaman', () => {
  it('tambah, edit, dan hapus dari perangkat A terlihat di B; pull kosong tidak membaca ulang', async () => {
    const server = fakeServer()
    const deviceA = device('018f2c4e-0000-7000-8000-0000000000d1', START_MS)

    // --- Perangkat A menulis todo lalu mengirimnya.
    const todo = taskOf(deviceA.newId(), 'Beli susu')
    await persistTask(deviceA, todo)
    await push(deviceA, server.http)
    expect(server.rows.size).toBe(1)

    // --- Perangkat B: aplikasi baru (state bersih) + shell dengan pendengar event yang asli.
    clearNuxtState(STATE_KEYS)
    resetTasksHydrationForTest()
    resetGoalLinksHydrationForTest()
    useState<LocalDataState>('localData').value = IDLE_STATE
    shell = await mountSuspended(ShellSyncStatus)
    await flushPromises()

    const deviceB = device('018f2c4e-0000-7000-8000-0000000000d2', START_MS + 5_000)
    const store = useTasks({ session: async () => deviceB })
    await store.hydrate()
    expect(store.tasks.value).toEqual([])
    expect(store.status.value).toBe('ready')

    const reads = vi.spyOn(deviceB.repos.todo, 'listAll')
    const statuses: string[] = []
    watch(
      () => store.status.value,
      (next) => statuses.push(next),
      { flush: 'sync' },
    )

    // AC1: pull menerapkan record perangkat lain -> store memuat ulang tanpa reload halaman.
    await pull(deviceB, server.http)
    await vi.waitFor(() =>
      expect(store.tasks.value.map((task) => task.title)).toEqual(['Beli susu']),
    )
    expect(reads).toHaveBeenCalledTimes(1)
    expect(statuses).not.toContain('loading')

    // AC3: pull berikutnya tidak menerapkan apa pun -> tidak ada pembacaan ulang.
    await pull(deviceB, server.http)
    await flushPromises()
    expect(reads).toHaveBeenCalledTimes(1)
    expect(store.tasks.value.map((task) => task.title)).toEqual(['Beli susu'])

    // AC2a: edit di A (judul + status selesai) ikut terlihat di B.
    await persistTask(deviceA, { ...todo, title: 'Beli susu oat', done: true })
    await push(deviceA, server.http)
    await pull(deviceB, server.http)
    await vi.waitFor(() => {
      const seen = store.tasks.value.find((task) => task.id === todo.id)
      expect(seen?.title).toBe('Beli susu oat')
      expect(seen?.done).toBe(true)
    })

    // AC2b + AC3: dua record dalam satu pull tetap satu kali baca (bukan per record).
    const readsBeforeBatch = reads.mock.calls.length
    await persistTask(deviceA, taskOf(deviceA.newId(), 'Jalan pagi'))
    await push(deviceA, server.http)
    await pull(deviceB, server.http)
    await vi.waitFor(() => expect(store.tasks.value).toHaveLength(2))
    expect(reads.mock.calls.length).toBe(readsBeforeBatch + 1)

    // AC2c: hapus di A ikut hilang di B (tombstone, bukan record yang hidup lagi).
    await removeTask(deviceA, todo.id)
    await push(deviceA, server.http)
    await pull(deviceB, server.http)
    await vi.waitFor(() =>
      expect(store.tasks.value.map((task) => task.title)).toEqual(['Jalan pagi']),
    )
  })

  it('event muat ulang tidak membawa payload data user', async () => {
    const seen: Event[] = []
    const listener = (event: Event): void => {
      seen.push(event)
    }
    window.addEventListener(SYNC_REMOTE_APPLIED_EVENT, listener)

    try {
      const server = fakeServer()
      const deviceA = device('018f2c4e-0000-7000-8000-0000000000d1', START_MS)
      await persistTask(deviceA, taskOf(deviceA.newId(), 'Rahasia'))
      await push(deviceA, server.http)

      const deviceB = device('018f2c4e-0000-7000-8000-0000000000d2', START_MS + 5_000)
      await pull(deviceB, server.http)

      expect(seen).toHaveLength(1)
      // `Event` biasa, bukan `CustomEvent`: tidak ada `detail` yang bisa disalahgunakan listener.
      expect(seen[0]).toBeInstanceOf(Event)
      expect(seen[0]).not.toBeInstanceOf(CustomEvent)
      expect(JSON.stringify(seen[0])).not.toContain('Rahasia')
    } finally {
      window.removeEventListener(SYNC_REMOTE_APPLIED_EVENT, listener)
    }
  })

  it('mount/unmount shell berulang tidak menumpuk listener', async () => {
    const reload = vi.fn(async () => undefined)
    registerSyncReloader('tasks', reload)

    for (let index = 0; index < 3; index += 1) {
      useState<LocalDataState>('localData').value = IDLE_STATE
      const wrapper = await mountSuspended(ShellSyncStatus)
      await flushPromises()
      wrapper.unmount()
      await flushPromises()
    }

    // Shell terakhir dipasang sekali lagi, lalu satu event: reloader hanya boleh jalan sekali.
    useState<LocalDataState>('localData').value = IDLE_STATE
    shell = await mountSuspended(ShellSyncStatus)
    await flushPromises()

    window.dispatchEvent(new Event(SYNC_REMOTE_APPLIED_EVENT))
    await flushPromises()

    expect(reload).toHaveBeenCalledTimes(1)
  })
})
