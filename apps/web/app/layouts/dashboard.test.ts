import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocalDataState } from '~/composables/useLocalData'

import DashboardLayout from './dashboard.vue'

/**
 * Layout dashboard: memastikan komponen yang dipasang di sini BENAR-BENAR ter-render.
 *
 * Kenapa test ini ada, dan kenapa di level layout: nama komponen auto-import di Nuxt TIDAK diverifikasi
 * typecheck. Salah nama (mis. `<FeaturesAccountKeyStatusNotice>` padahal namanya
 * `AccountKeyStatusNotice`) tidak jadi error - Vue merendernya sebagai elemen tak dikenal, aplikasi
 * jalan, dan fitur itu diam-diam tidak pernah muncul. Itu pernah terjadi dua kali di berkas ini
 * (notice status kunci dan onboarding recovery), dan baru ketahuan saat dilihat di browser.
 *
 * Karena itu yang diuji di sini bukan "komponennya benar", tapi "layout benar-benar memunculkannya".
 */
const { useAppearancePrefsMock } = vi.hoisted(() => ({ useAppearancePrefsMock: vi.fn() }))
// Preferensi tampilan (F16) dihidrasi oleh layout ini sejak T66; di test ia hanya membuka
// IndexedDB palsu dan tidak berhubungan dengan komponen yang diperiksa di sini.
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
  clearNuxtState(['localData', 'accountPasskey', 'accountStatus', 'accountError'])
})

afterEach(async () => {
  // Unmount sebelum state dibersihkan: wrapper yang masih hidup akan re-render dengan state yang sudah
  // hilang, dan itu muncul sebagai unhandled error (gerbang gagal) walaupun assertion-nya lulus.
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('layout dashboard', () => {
  it('memunculkan onboarding passkey saat pembukanya belum ada', async () => {
    const wrapper = await mount()

    setLocalDataState({
      status: 'ready',
      isFreshKey: true,
      deviceId: '018f2c4e-0000-7000-8000-0000000000d1',
      userId: '018f2c4e-0000-7000-8000-00000000000a',
      error: null,
    })
    useState<'set' | 'unset'>('accountPasskey').value = 'unset'
    await nextTick()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  })

  it('memunculkan notice status kunci saat data lokal gagal dibuka', async () => {
    const wrapper = await mount()

    setLocalDataState({
      status: 'error',
      isFreshKey: false,
      deviceId: null,
      userId: null,
      error: 'gagal',
    })
    useState<'set' | 'unset'>('accountPasskey').value = 'unset'
    await nextTick()

    // Tidak ada elemen tak dikenal yang tersisa: kalau nama komponennya salah lagi, test ini gagal.
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.html()).not.toContain('featuresaccount')
  })
})
