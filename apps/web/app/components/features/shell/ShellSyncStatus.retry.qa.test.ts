import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocalDataState } from '~/composables/useLocalData'
import { resetLocalDataSessionForTest, useLocalData } from '~/composables/useLocalData'
import { SYNC_REMOTE_APPLIED_EVENT, SYNC_STATE_EVENT } from '~/utils/sync/events'
import { resetSyncReloadersForTest } from '~/utils/sync/refresh'

import ShellSyncStatus from './ShellSyncStatus.vue'

import { TEST_USER_A, createMemoryLocalSession, signIn } from '../../../../tests/nuxt/local-session'

/**
 * Dua hal di indikator status yang belum ter-cover (review #76, bagian "test plugin + retry"):
 *
 * 1. tombol "Coba lagi" benar-benar meminta SATU siklus sync - bukan sekadar terlihat bisa diklik -
 *    dan label mengikuti status setelah siklus itu selesai.
 * 2. komponen ini satu-satunya pendengar `SYNC_REMOTE_APPLIED_EVENT`; dipasang-lepas berkali-kali
 *    (mis. pindah halaman) tidak boleh menyisakan listener lama yang memicu putaran reload ganda.
 *
 * Controller dimock di batasnya (itu batas jaringan/kerja), sedangkan status dibaca dari storage
 * sungguhan lewat `readSyncStatus` - jadi label yang diuji tetap berasal dari kode produksi.
 */

const requestSyncNow = vi.hoisted(() => vi.fn())

vi.mock('~/utils/sync/controller', () => ({
  requestSyncNow,
  startSync: vi.fn(() => vi.fn()),
  stopSync: vi.fn(),
}))

const openSession = vi.hoisted(() => vi.fn())

vi.mock('~/utils/storage/session', () => ({
  LocalKeyMissingError: class LocalKeyMissingError extends Error {},
  openLocalDataSession: openSession,
}))

/** Menghitung berapa kali komponen meminta putaran reload (satu per listener yang hidup). */
const reloadRequests = vi.hoisted(() => ({ count: 0 }))

vi.mock('~/utils/sync/refresh', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/utils/sync/refresh')>()

  return {
    ...actual,
    runSyncReloaders: (options?: Parameters<typeof actual.runSyncReloaders>[0]) => {
      reloadRequests.count += 1
      return actual.runSyncReloaders(options)
    },
  }
})

const SYNC_ERROR = {
  deviceId: 'device-a',
  cursor: 3,
  status: 'error' as const,
  lastPullAtMs: null,
  lastPushAtMs: null,
}

const SYNC_OK = { ...SYNC_ERROR, status: 'synced' as const, lastPullAtMs: 1_700_000_000_000 }

const IDLE_STATE: LocalDataState = {
  status: 'idle',
  isFreshKey: false,
  deviceId: null,
  userId: null,
  error: null,
}

let mounted: VueWrapper | null = null

async function mountSyncStatus(): Promise<VueWrapper> {
  const wrapper = await mountSuspended(ShellSyncStatus)
  await vi.waitFor(() => expect(wrapper.find('.sync').exists()).toBe(true))
  return wrapper
}

beforeEach(async () => {
  clearNuxtState(['localData', 'auth-session', 'auth-session-pending', 'auth-session-error', 'now'])
  useState<LocalDataState>('localData').value = { ...IDLE_STATE }
  resetLocalDataSessionForTest()
  resetSyncReloadersForTest()
  reloadRequests.count = 0
  requestSyncNow.mockReset()

  const session = createMemoryLocalSession(TEST_USER_A)
  vi.spyOn(session.storage, 'getSyncState').mockResolvedValue(SYNC_ERROR)
  openSession.mockReset()
  openSession.mockResolvedValue(session)

  signIn(TEST_USER_A)
  const opened = await useLocalData().ensure()
  expect(opened?.userId).toBe(TEST_USER_A)
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  resetSyncReloadersForTest()
  resetLocalDataSessionForTest()
  await flushPromises()
})

describe('tombol "Coba lagi"', () => {
  it('klik memicu satu siklus lalu label mengikuti status setelahnya', async () => {
    mounted = await mountSyncStatus()

    await vi.waitFor(() => expect(mounted?.text()).toContain('Gagal sinkron'))

    const button = mounted.get('button.retry')
    await button.trigger('click')
    await flushPromises()

    expect(requestSyncNow).toHaveBeenCalledTimes(1)

    // Siklus susulan berhasil: status storage berubah dan event menyuruh indikator membacanya lagi.
    const state = useLocalData().current()
    if (state === null) throw new Error('sesi data lokal harus terbuka')
    vi.spyOn(state.storage, 'getSyncState').mockResolvedValue(SYNC_OK)

    window.dispatchEvent(new Event(SYNC_STATE_EVENT))

    await vi.waitFor(() => expect(mounted?.find('.sync').exists()).toBe(false))
    expect(mounted.text()).not.toContain('Tersinkron')
    expect(mounted.find('button.retry').exists()).toBe(false)
  })
})

describe('listener event pull tidak menumpuk', () => {
  it('mount/unmount berulang menyisakan tepat satu pendengar', async () => {
    for (let round = 0; round < 3; round += 1) {
      const wrapper = await mountSyncStatus()
      wrapper.unmount()
    }

    mounted = await mountSyncStatus()

    // Putaran sebelumnya bisa sudah memakai kuota throttle; yang diuji jumlah listener, bukan throttle.
    resetSyncReloadersForTest()
    reloadRequests.count = 0

    window.dispatchEvent(new Event(SYNC_REMOTE_APPLIED_EVENT))
    await flushPromises()

    expect(reloadRequests.count).toBe(1)
  })
})
