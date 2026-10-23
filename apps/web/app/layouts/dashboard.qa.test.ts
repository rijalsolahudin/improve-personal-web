import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LocalDataState } from '~/composables/useLocalData'

import DashboardLayout from './dashboard.vue'

const READY_STATE: LocalDataState = {
  status: 'ready',
  isFreshKey: false,
  deviceId: '018f2c4e-0000-7000-8000-0000000000d1',
  userId: '018f2c4e-0000-7000-8000-00000000000a',
  error: null,
}

let mounted: VueWrapper | null = null

async function mount(): Promise<VueWrapper> {
  mounted = await mountSuspended(DashboardLayout)
  return mounted
}

beforeEach(() => {
  clearNuxtState([
    'localData',
    'accountPasskey',
    'accountStatus',
    'accountError',
    'accountDevices',
    'now',
  ])
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('indikator status sync (T22)', () => {
  it('layout dashboard menampilkan status sinkronisasi (tersinkron/menunggu/offline/gagal)', async () => {
    const wrapper = await mount()

    // Tanpa dialog onboarding/recovery: user sudah punya passkey dan data lokal siap.
    useState<LocalDataState>('localData').value = READY_STATE
    useState<'set' | 'unset'>('accountPasskey').value = 'set'
    await nextTick()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.text()).toMatch(/tersinkron|menunggu|offline|gagal (sinkron|sync)/i)
  })
})
