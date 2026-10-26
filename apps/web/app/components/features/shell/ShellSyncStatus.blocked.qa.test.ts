import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocalDataState } from '~/composables/useLocalData'
import { resetLocalDataSessionForTest, useLocalData } from '~/composables/useLocalData'
import { SYNC_STATE_EVENT } from '~/utils/sync/events'
import { clearQuarantineForTest, isQuarantined, quarantineRecord } from '~/utils/sync/quarantine'
import { resetSyncReloadersForTest } from '~/utils/sync/refresh'

import ShellSyncStatus from './ShellSyncStatus.vue'

import { TEST_USER_A, createMemoryLocalSession, signIn } from '../../../../tests/nuxt/local-session'

/**
 * Aksi manual "Coba buka ulang" untuk record terkarantina.
 *
 * Karantina TIDAK mengubah status sync (data lain tetap `synced`), jadi tombol ini tidak boleh
 * bergantung pada status `error` seperti tombol "Coba lagi". Klik harus membersihkan karantina akun
 * aktif lalu meminta satu siklus, tanpa dialog dan tanpa menampilkan id record.
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

const IDLE_STATE: LocalDataState = {
  status: 'idle',
  isFreshKey: false,
  deviceId: null,
  userId: null,
  error: null,
}

let mounted: VueWrapper | null = null

async function mountSyncStatus(): Promise<VueWrapper> {
  mounted = await mountSuspended(ShellSyncStatus)
  await flushPromises()
  return mounted
}

beforeEach(async () => {
  clearNuxtState(['localData', 'auth-session', 'auth-session-pending', 'auth-session-error', 'now'])
  useState<LocalDataState>('localData').value = { ...IDLE_STATE }
  resetLocalDataSessionForTest()
  resetSyncReloadersForTest()
  clearQuarantineForTest()
  requestSyncNow.mockReset()

  openSession.mockReset()
  openSession.mockResolvedValue(createMemoryLocalSession(TEST_USER_A))

  signIn(TEST_USER_A)
  const opened = await useLocalData().ensure()
  expect(opened?.userId).toBe(TEST_USER_A)
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  resetSyncReloadersForTest()
  resetLocalDataSessionForTest()
  clearQuarantineForTest()
  await flushPromises()
})

describe('tombol "Coba buka ulang"', () => {
  it('muncul saat ada karantina walau status synced', async () => {
    quarantineRecord(TEST_USER_A, '018f2c4e-0000-7000-8000-0000000000c1')
    const wrapper = await mountSyncStatus()

    await vi.waitFor(() => expect(wrapper.text()).toContain('1 data tidak bisa dibuka'))

    // Status "tersinkron" tidak dirender lagi; hanya keterangan karantina yang tampil.
    expect(wrapper.find('.sync').exists()).toBe(false)
    expect(wrapper.find('button.blocked-retry').exists()).toBe(true)
    expect(wrapper.text()).toContain('Coba buka ulang')
    // Id record tidak pernah ditampilkan.
    expect(wrapper.text()).not.toContain('018f2c4e-0000-7000-8000-0000000000c1')
  })

  it('klik membersihkan karantina akun aktif dan meminta satu siklus', async () => {
    quarantineRecord(TEST_USER_A, '018f2c4e-0000-7000-8000-0000000000c2')
    const wrapper = await mountSyncStatus()
    await vi.waitFor(() => expect(wrapper.find('button.blocked-retry').exists()).toBe(true))

    await wrapper.get('button.blocked-retry').trigger('click')
    // Index dibangun ulang dari blob lokal dulu, dan modul sync dimuat malas: hasilnya asinkron.
    await vi.waitFor(() =>
      expect(isQuarantined(TEST_USER_A, '018f2c4e-0000-7000-8000-0000000000c2')).toBe(false),
    )
    await vi.waitFor(() => expect(requestSyncNow).toHaveBeenCalledTimes(1))

    // Keterangan dan tombol ikut hilang setelah jumlahnya nol.
    await vi.waitFor(() => expect(wrapper.find('button.blocked-retry').exists()).toBe(false))
    expect(wrapper.text()).not.toContain('tidak bisa dibuka')
  })

  it('hilang saat karantina dibersihkan dari jalur lain', async () => {
    quarantineRecord(TEST_USER_A, '018f2c4e-0000-7000-8000-0000000000c3')
    const wrapper = await mountSyncStatus()
    await vi.waitFor(() => expect(wrapper.find('button.blocked-retry').exists()).toBe(true))

    clearQuarantineForTest()
    window.dispatchEvent(new Event(SYNC_STATE_EVENT))
    await flushPromises()

    await vi.waitFor(() => expect(wrapper.find('button.blocked-retry').exists()).toBe(false))
  })
})
