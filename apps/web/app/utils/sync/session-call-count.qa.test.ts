import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watch } from 'vue'

import ShellSyncStatus from '~/components/features/shell/ShellSyncStatus.vue'
import { resetCountdownsHydrationForTest, useCountdowns } from '~/composables/useCountdowns'
import { resetGoalLinksHydrationForTest } from '~/composables/useGoalLinks'
import type { LocalDataState } from '~/composables/useLocalData'
import { resetLocalDataSessionForTest, useLocalData } from '~/composables/useLocalData'
import { resetMemosHydrationForTest, useMemos } from '~/composables/useMemos'
import { resetSchedulesHydrationForTest, useSchedules } from '~/composables/useSchedules'
import { resetTasksHydrationForTest, useTasks } from '~/composables/useTasks'
import { SYNC_REMOTE_APPLIED_EVENT } from '~/utils/sync/events'
import { registerSyncReloader, resetSyncReloadersForTest } from '~/utils/sync/refresh'
import { persistTask } from '~/utils/tasks/persistence'
import type { Task } from '~/utils/tasks'

import { TEST_USER_A, createMemoryLocalSession, signIn } from '../../../tests/nuxt/local-session'

/**
 * Security review #77 M1: satu event reload pernah menghasilkan 6-9 siklus sync.
 *
 * Rantainya: `reload()` memanggil `localData.ensure()` -> `ensure()` menulis `status = 'loading'` ->
 * plugin `sync.client.ts` mematikan lalu memasang ulang controller -> `startSync` menjalankan pull.
 * Satu event yang menjalankan 6-9 reloader karena itu berubah menjadi 6-9 `GET /v1/sync/pull`
 * (limiter akun 600/jam).
 *
 * Modul sesi dipalsukan hanya di batasnya (`openLocalDataSession`) supaya sesi terbuka lewat jalur
 * produksi `ensure()` tanpa IndexedDB; store yang diuji tetap store produksi dan event-nya ditangkap
 * komponen shell yang asli.
 */

const openSession = vi.hoisted(() => vi.fn())
/** Berapa kali `ensure()` dipanggil seluruh composable pada satu putaran reload. */
const ensureCalls = vi.hoisted(() => ({ count: 0 }))

vi.mock('~/utils/storage/session', () => ({
  LocalKeyMissingError: class LocalKeyMissingError extends Error {},
  openLocalDataSession: openSession,
}))

vi.mock('~/composables/useLocalData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/composables/useLocalData')>()

  return {
    ...actual,
    useLocalData: () => {
      const api = actual.useLocalData()
      return {
        ...api,
        ensure: () => {
          ensureCalls.count += 1
          return api.ensure()
        },
      }
    },
  }
})

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
    'schedules',
    'schedule-attendance',
    'schedulesStatus',
    'schedulesError',
    'countdowns',
    'countdownsStatus',
    'countdownsError',
    'memos',
    'memosStatus',
    'memosError',
    'now',
  ])
  useState<LocalDataState>('localData', () => ({ ...IDLE_STATE }))
  resetLocalDataSessionForTest()
  resetTasksHydrationForTest()
  resetGoalLinksHydrationForTest()
  resetSchedulesHydrationForTest()
  resetCountdownsHydrationForTest()
  resetMemosHydrationForTest()
  resetSyncReloadersForTest()
  ensureCalls.count = 0
  openSession.mockReset()
  openSession.mockImplementation(async () => createMemoryLocalSession(TEST_USER_A))
  signIn(TEST_USER_A)
})

afterEach(async () => {
  shell?.unmount()
  shell = null
  await flushPromises()
})

describe('satu event reload tidak memicu siklus sync tambahan (M1)', () => {
  it('5 reloader terdaftar: status sesi tidak berubah dan ensure() tidak dipanggil', async () => {
    const localData = useLocalData()
    const session = await localData.ensure()
    if (session === null) throw new Error('sesi tidak terbuka')
    expect(localData.state.value.status).toBe('ready')

    // Data "dari perangkat lain" yang harus terlihat setelah reload.
    await persistTask(session, taskOf(session.newId(), 'Dari perangkat lain'))

    // Store produksi: yang ter-hydrate di halaman ikut mendaftarkan reloader-nya.
    const tasks = useTasks()
    const schedules = useSchedules()
    const countdowns = useCountdowns()
    const memos = useMemos()
    await vi.waitFor(() => {
      expect(tasks.status.value).toBe('ready')
      expect(schedules.status.value).toBe('ready')
      expect(countdowns.status.value).toBe('ready')
      expect(memos.status.value).toBe('ready')
    })

    // Reloader penanda: `deco` tidak dipakai store mana pun dan berjalan TERAKHIR, jadi nilainya
    // menandakan putaran selesai.
    let roundFinished = false
    registerSyncReloader('deco', async () => {
      roundFinished = true
    })

    shell = await mountSuspended(ShellSyncStatus)
    await flushPromises()

    const statuses: string[] = []
    watch(
      () => localData.state.value.status,
      (next) => statuses.push(next),
      { flush: 'sync' },
    )

    const listAll = vi.spyOn(session.repos.todo, 'listAll')
    ensureCalls.count = 0

    window.dispatchEvent(new Event(SYNC_REMOTE_APPLIED_EVENT))
    await vi.waitFor(() => expect(roundFinished).toBe(true))

    // Reload benar-benar memakai sesi yang sudah terbuka...
    expect(listAll).toHaveBeenCalledTimes(1)
    expect(tasks.tasks.value.map((item) => item.title)).toEqual(['Dari perangkat lain'])
    // ...tanpa membuka sesi: 5 reloader, 0 `ensure()`, 0 perubahan status (dulu 6-9 `loading`).
    expect(ensureCalls.count).toBe(0)
    expect(statuses).toEqual([])
    expect(localData.state.value.status).toBe('ready')
  })
})
