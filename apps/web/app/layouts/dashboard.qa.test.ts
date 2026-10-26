import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LocalDataState } from '~/composables/useLocalData'

import ShellSyncStatus from '~/components/features/shell/ShellSyncStatus.vue'
import { markSyncRunEnd, markSyncRunStart, resetSyncActivityForTest } from '~/utils/sync/activity'

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
  resetSyncActivityForTest()
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  resetSyncActivityForTest()
  await flushPromises()
})

describe('indikator status sync (T22, T105, T106)', () => {
  it('layout dashboard menaruh indikator sync di dock kanan bawah, bukan di atas halaman', async () => {
    const wrapper = await mount()

    // Tanpa dialog onboarding/recovery: user sudah punya passkey dan data lokal siap.
    useState<LocalDataState>('localData').value = READY_STATE
    useState<'set' | 'unset'>('accountPasskey').value = 'set'
    await nextTick()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    /*
     * Saat tersinkron komponen tetap ter-mount (pendengar event sync + interval hidup di sana), tetapi
     * TIDAK menghasilkan elemen apa pun. Root-nya ikut `v-if` karena `.sync-wrap` item flex di dock:
     * elemen kosong tetap dihitung `gap` dan dulu membuat jarak Pomodoro<->Hias jadi 20px (T106).
     */
    expect(wrapper.findComponent(ShellSyncStatus).exists()).toBe(true)
    expect(wrapper.find('.sync-wrap').exists()).toBe(false)
    expect(wrapper.find('.sync').exists()).toBe(false)

    // Saat ada yang perlu dilihat, indikatornya muncul DI DALAM dock - bukan di atas halaman.
    markSyncRunStart()
    await nextTick()

    expect(wrapper.get('.fab-dock').find('.sync-wrap').exists()).toBe(true)
    expect(wrapper.get('.main').find('.sync-wrap').exists()).toBe(false)

    markSyncRunEnd()
  })
})
