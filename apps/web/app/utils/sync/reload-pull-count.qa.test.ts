import type { HttpClient } from '@improve-personal/core'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ShellSyncStatus from '~/components/features/shell/ShellSyncStatus.vue'
import { resetGoalLinksHydrationForTest } from '~/composables/useGoalLinks'
import type { LocalDataState } from '~/composables/useLocalData'
import { resetLocalDataSessionForTest, useLocalData } from '~/composables/useLocalData'
import { resetTasksHydrationForTest, useTasks } from '~/composables/useTasks'
import { stopSync, startSync } from '~/utils/sync/controller'
import { notifyRemoteApplied } from '~/utils/sync/events'
import { registerSyncReloader, resetSyncReloadersForTest } from '~/utils/sync/refresh'

import { TEST_USER_A, createMemoryLocalSession, signIn } from '../../../tests/nuxt/local-session'
// Klaim identitas kunci (`PUT /v1/keys/identity`) berjalan sebelum `ready`; jaringan dimock di batas.
mockNuxtImport('$fetch', () => async () => ({
  data: {
    kid: 'LBaTVGaXKfW710NOCIXptA',
    claimedAt: '2026-10-27T00:00:00.000Z',
    claimedByDeviceLabel: null,
  },
}))

/**
 * Bukti level controller untuk security review #77 M1/AC "satu event = satu siklus sync".
 *
 * Yang dibuktikan file ini HANYA satu arah: event "pull menerapkan data" menjalankan putaran reloader
 * TANPA menambah `GET /v1/sync/pull` (dulu tiap reloader memanggil `ensure()` → status `loading` →
 * plugin stop/attach → pull baru). Arah sebaliknya (pull yang menerapkan record BENAR-BENAR
 * mengirim event itu, dan pull kosong tidak) diuji di `controller.test.ts`; bukti jumlah `ensure()`
 * per putaran ada di `session-call-count.qa.test.ts`.
 *
 * Plugin `sync.client.ts` tidak dijalankan di environment test (`.client` plugin tidak masuk build
 * server test), jadi siklus "sesi siap" disimulasikan dengan `startSync`.
 */

const openSession = vi.hoisted(() => vi.fn())

vi.mock('~/utils/storage/session', () => ({
  LocalKeyMissingError: class LocalKeyMissingError extends Error {},
  openLocalDataSession: openSession,
}))

const BASE_URL = 'https://app.test'
const IDLE_STATE: LocalDataState = {
  status: 'idle',
  isFreshKey: false,
  deviceId: null,
  userId: null,
  error: null,
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
  useState<LocalDataState>('localData', () => ({ ...IDLE_STATE }))
  resetLocalDataSessionForTest()
  resetTasksHydrationForTest()
  resetGoalLinksHydrationForTest()
  resetSyncReloadersForTest()
  openSession.mockReset()
  openSession.mockImplementation(async () => createMemoryLocalSession(TEST_USER_A))
  signIn(TEST_USER_A)
})

afterEach(async () => {
  stopSync()
  shell?.unmount()
  shell = null
  await flushPromises()
})

describe('event pull nyata tidak menambah siklus sync', () => {
  it('getJson pull tetap dipanggil sekali setelah reloader berjalan', async () => {
    const localData = useLocalData()
    const session = await localData.ensure()
    if (session === null) throw new Error('sesi tidak terbuka')

    const http = {
      postJson: vi.fn(async () => ({ results: [] })),
      getJson: vi.fn(async () => ({ records: [], nextCursor: 0 })),
    } as unknown as HttpClient

    // `startSync` tanpa `autoStart: false` = app_open: satu pull, seperti yang dipasang plugin.
    startSync(session, BASE_URL, { http })
    await vi.waitFor(() => expect(http.getJson).toHaveBeenCalledTimes(1))

    const tasks = useTasks()
    await vi.waitFor(() => expect(tasks.status.value).toBe('ready'))

    let roundFinished = false
    registerSyncReloader('appearance', async () => {
      roundFinished = true
    })

    // Listener event yang asli (shell) harus ada supaya `notifyRemoteApplied()` menjalankan reloader.
    shell = await mountSuspended(ShellSyncStatus)
    await flushPromises()

    notifyRemoteApplied()
    await vi.waitFor(() => expect(roundFinished).toBe(true))

    expect(http.getJson).toHaveBeenCalledTimes(1)
  })
})
