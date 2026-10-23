import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LocalDataState } from '~/composables/useLocalData'

import ShellSyncStatus from './ShellSyncStatus.vue'

/**
 * Indikator status sync di shell (AC T22): sumbernya `readSyncStatus` + outbox, dan selama penyimpanan
 * lokal belum terbuka ia TIDAK boleh mengarang "Tersinkron".
 *
 * `dashboard.qa.test.ts` (putaran 1) hanya memastikan ada teks status; test ini mengunci arti teksnya.
 */

const IDLE_STATE: LocalDataState = {
  status: 'idle',
  isFreshKey: false,
  deviceId: null,
  userId: null,
  error: null,
}

const LOCKED_STATE: LocalDataState = {
  status: 'locked',
  isFreshKey: false,
  deviceId: null,
  userId: '018f2c4e-0000-7000-8000-00000000000a',
  error: null,
}

let mounted: VueWrapper | null = null

async function mount(): Promise<VueWrapper> {
  mounted = await mountSuspended(ShellSyncStatus)
  await flushPromises()
  return mounted
}

beforeEach(() => {
  clearNuxtState(['localData', 'auth-session', 'auth-session-pending', 'auth-session-error', 'now'])
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('indikator status sync', () => {
  it('penyimpanan lokal belum terbuka: menunggu status, bukan "Tersinkron"', async () => {
    useState<LocalDataState>('localData').value = IDLE_STATE
    const wrapper = await mount()

    expect(wrapper.text()).toContain('Menunggu status sinkronisasi')
    expect(wrapper.text()).not.toMatch(/tersinkron/i)
  })

  it('perangkat terkunci: tetap tidak mengklaim data sudah tersinkron', async () => {
    useState<LocalDataState>('localData').value = LOCKED_STATE
    const wrapper = await mount()

    expect(wrapper.text()).toContain('Menunggu status sinkronisasi')
    expect(wrapper.text()).not.toMatch(/tersinkron/i)
  })
})
