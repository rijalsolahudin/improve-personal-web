import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetGoalLinksHydrationForTest } from '~/composables/useGoalLinks'
import type { LocalDataState } from '~/composables/useLocalData'
import { resetLocalDataSessionForTest, useLocalData } from '~/composables/useLocalData'
import { resetTasksHydrationForTest, useTasks } from '~/composables/useTasks'
import { resetSyncReloadersForTest } from '~/utils/sync/refresh'
import { persistTask } from '~/utils/tasks/persistence'
import type { Task } from '~/utils/tasks'

import {
  TEST_USER_A,
  TEST_USER_B,
  createMemoryLocalSession,
  signIn,
} from '../../../tests/nuxt/local-session'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
// Klaim identitas kunci (`PUT /v1/keys/identity`) berjalan sebelum `ready`; jaringan dimock di batas.
mockNuxtImport('$fetch', () => async () => ({
  data: {
    kid: 'LBaTVGaXKfW710NOCIXptA',
    claimedAt: '2026-10-27T00:00:00.000Z',
    claimedByDeviceLabel: null,
  },
}))

/**
 * Security review #77 L1: `reload()` menulis state setelah beberapa `await`, tanpa memeriksa bahwa
 * sesi yang dibacanya masih milik akun aktif. Kalau akun berganti di tengah pembacaan, data akun lama
 * bisa mendarat di UI akun baru.
 *
 * Guard-nya hanya berlaku untuk sesi yang diambil dari `localData.current()` (sesi nyata); sesi
 * suntikan test tidak punya padanan akun. Satu skenario per file karena state sesi level modul.
 */

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
  useState<LocalDataState>('localData', () => ({ ...IDLE_STATE }))
  resetLocalDataSessionForTest()
  resetTasksHydrationForTest()
  resetGoalLinksHydrationForTest()
  resetSyncReloadersForTest()
  openSession.mockReset()
  openSession.mockImplementation(async (options: { userId: string }) =>
    createMemoryLocalSession(options.userId),
  )
  signIn(TEST_USER_A)
})

describe('reload setelah await: sesi bukan lagi milik akun aktif', () => {
  it('hasil pembacaan akun A tidak ditulis setelah akun berganti ke B', async () => {
    const localData = useLocalData()
    const session = await localData.ensure()
    if (session === null) throw new Error('sesi tidak terbuka')

    const task = taskOf(session.newId(), 'Milik akun A')
    await persistTask(session, task)

    const store = useTasks()
    await vi.waitFor(() => expect(store.status.value).toBe('ready'))
    expect(store.tasks.value.map((item) => item.title)).toEqual(['Milik akun A'])

    // Task kedua HANYA di penyimpanan: kalau guard pemilik sesi gagal, reload akan menulisnya ke UI
    // akun B - itu yang harus tidak terjadi.
    const storedOnly = taskOf(session.newId(), 'Hanya ada di penyimpanan')
    await persistTask(session, storedOnly)

    // Kendalikan pembacaan: hasil `listAll` ditahan sampai akun berganti.
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

    // Login akun lain tanpa reload halaman: sesi A bukan sesi aktif lagi.
    signIn(TEST_USER_B)
    release()
    await pending

    // Status tidak diturunkan dan data akun A tidak ditulis ulang ke UI.
    expect(store.status.value).toBe('ready')
    expect(store.tasks.value.map((item) => item.title)).toEqual(['Milik akun A'])
  })
})
