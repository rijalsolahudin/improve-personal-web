import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocalDataState } from '~/composables/useLocalData'

import DashboardLayout from './dashboard.vue'

/**
 * Layout dashboard: memastikan komponen yang dipasang di sini BENAR-BENAR ter-render.
 *
 * Nama komponen auto-import di Nuxt TIDAK diverifikasi typecheck: salah nama tidak jadi error, Vue
 * merendernya sebagai elemen tak dikenal, dan fitur itu diam-diam tidak pernah muncul. Karena itu test
 * ini memeriksa elemen yang seharusnya ada, bukan "komponennya benar".
 */
const { useAppearancePrefsMock } = vi.hoisted(() => ({ useAppearancePrefsMock: vi.fn() }))
mockNuxtImport('useAppearancePrefs', () => useAppearancePrefsMock)

let mounted: VueWrapper | null = null

async function mount(): Promise<VueWrapper> {
  mounted = await mountSuspended(DashboardLayout)
  return mounted
}

function setLocalDataState(state: LocalDataState): void {
  useState<LocalDataState>('localData').value = state
}

beforeEach(() => {
  clearNuxtState(['localData', 'accountStatus', 'accountError'])
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('layout dashboard', () => {
  it('merender shell dengan main slot dan tanpa komponen tak dikenal', async () => {
    const wrapper = await mount()

    setLocalDataState({
      status: 'ready',
      deviceId: '018f2c4e-0000-7000-8000-0000000000d1',
      userId: '018f2c4e-0000-7000-8000-00000000000a',
      error: null,
    })
    await nextTick()

    expect(wrapper.find('main.main').exists()).toBe(true)
    // Nama auto-import yang salah muncul sebagai tag tak dikenal (`features...`).
    expect(wrapper.html()).not.toMatch(/featuresaccount/i)
  })
})
