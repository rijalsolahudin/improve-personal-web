import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import type { LocalDataSession } from '~/utils/storage/session'
import { resetSyncReloadersForTest } from '~/utils/sync/refresh'
import { loadTasks, persistTask } from '~/utils/tasks/persistence'
import type { Task } from '~/utils/tasks'
import { createUuidV7Generator } from '~/utils/storage/uuid'

import { resetTasksHydrationForTest, useTasks } from './useTasks'

/**
 * Tulisan lokal yang mendarat SAAT reload membaca (AC T77).
 *
 * Test `useTasks.test.ts` menutup kasus "antrean tulis belum mendarat sebelum reload mulai"; di sini
 * yang diuji justru tulisan yang masuk ketika pembacaan pertama sedang berjalan - klik kedua user
 * pada saat sync menarik data perangkat lain. Tanpa pembacaan ulang, hasil baca lama menimpa state
 * yang baru saja diubah user.
 */

const START_MS = 1_700_000_000_000
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }
const DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d1'

const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

function memorySession(): LocalDataSession {
  const clock = createManualClock(START_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: DEVICE_ID, clock })

  return {
    storage,
    provider: fakeProvider,
    clock,
    dataKey: DATA_KEY,
    hlc,
    deviceId: DEVICE_ID,
    userId: '018f2c4e-0000-7000-8000-00000000000a',
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

beforeEach(() => {
  clearNuxtState(['tasks', 'tasksStatus', 'tasksError', 'localData', 'goalLinks'])
  resetTasksHydrationForTest()
  resetSyncReloadersForTest()
})

describe('useTasks: tulisan saat reload membaca (AC T77)', () => {
  it('toggle yang mendarat selama pembacaan pertama tidak kembali ke nilai lama', async () => {
    const session = memorySession()
    const task = taskOf(session.newId(), 'Belajar')
    await persistTask(session, task)

    const store = useTasks({ session: async () => session })
    await store.hydrate()

    // Kendali pembacaan: snapshot diambil saat `listAll` dipanggil, hasil ditahan sampai `release()`.
    const realListAll = session.repos.todo.listAll.bind(session.repos.todo)
    let reads = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    session.repos.todo.listAll = async (options) => {
      const snapshot = await realListAll(options)
      reads += 1
      if (reads === 1) await gate
      return snapshot
    }

    const pending = store.reload()
    await vi.waitFor(() => expect(reads).toBe(1))

    // Klik user tepat saat reload sedang membaca.
    store.toggle(task.id)
    release()
    await pending

    await vi.waitFor(async () => {
      const stored = await loadTasks(session)
      expect(stored.find((item) => item.id === task.id)?.done).toBe(true)
    })
    expect(store.tasks.value.find((item) => item.id === task.id)?.done).toBe(true)
  })
})
