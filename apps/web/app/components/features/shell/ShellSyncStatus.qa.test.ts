import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocalDataState } from '~/composables/useLocalData'
import { SYNC_REMOTE_APPLIED_EVENT, SYNC_STATE_EVENT } from '~/utils/sync/events'
import {
  adoptQuarantineAccount,
  clearQuarantineForTest,
  quarantineRecord,
} from '~/utils/sync/quarantine'
import { registerSyncReloader, resetSyncReloadersForTest } from '~/utils/sync/refresh'

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

/**
 * Pull yang menerapkan record perangkat lain harus menyegarkan store yang sedang tampil - tanpa reload
 * halaman (AC T77). Komponen ini satu-satunya pendengar event-nya, jadi test ini mengunci wiring-nya.
 */
describe('muat ulang store setelah pull (AC T77)', () => {
  beforeEach(() => {
    resetSyncReloadersForTest()
  })

  afterEach(() => {
    resetSyncReloadersForTest()
  })

  it('event pull menerapkan data menjalankan reloader yang terdaftar', async () => {
    useState<LocalDataState>('localData').value = IDLE_STATE
    const reload = vi.fn(async () => undefined)
    registerSyncReloader('tasks', reload)
    await mount()

    window.dispatchEvent(new Event(SYNC_REMOTE_APPLIED_EVENT))
    await flushPromises()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('unmount melepas listener: event berikutnya tidak menjalankan reloader lagi', async () => {
    useState<LocalDataState>('localData').value = IDLE_STATE
    const reload = vi.fn(async () => undefined)
    registerSyncReloader('tasks', reload)
    const wrapper = await mount()

    wrapper.unmount()
    mounted = null

    window.dispatchEvent(new Event(SYNC_REMOTE_APPLIED_EVENT))
    await flushPromises()

    expect(reload).not.toHaveBeenCalled()
  })
})

/**
 * Keterangan "N data tidak bisa dibuka" (T78): record yang gagal didekripsi berulang dikarantina
 * supaya pull bisa jalan lagi. Datanya tetap tersimpan di perangkat - yang hilang hanya tampilannya,
 * jadi UI menampilkan keterangan terpisah dan TIDAK mengubah arti badge status.
 */
describe('keterangan record terkarantina', () => {
  const USER = '018f2c4e-0000-7000-8000-00000000000a'

  beforeEach(() => {
    localStorage.clear()
    clearQuarantineForTest()
    adoptQuarantineAccount(USER)
  })

  afterEach(() => {
    clearQuarantineForTest()
    localStorage.clear()
  })

  it('muncul saat ada record yang tidak bisa dibuka, tanpa mengubah arti badge status', async () => {
    useState<LocalDataState>('localData').value = IDLE_STATE
    quarantineRecord('018f2c4e-0000-7000-8000-0000000000c1')
    quarantineRecord('018f2c4e-0000-7000-8000-0000000000c2')

    const wrapper = await mountSuspended(ShellSyncStatus)
    await flushPromises()

    try {
      const text = wrapper.text()
      expect(text).toContain(
        '2 data tidak bisa dibuka dan tidak ditampilkan, tetapi tetap tersimpan di perangkat ini.',
      )
      // Badge statusnya tetap apa adanya (belum terbuka), bukan berubah jadi status karantina.
      expect(text).toContain('Menunggu status sinkronisasi')
      // Yang tampil hanya jumlah; id record tidak pernah bocor ke UI.
      expect(text).not.toContain('018f2c4e-0000-7000-8000-0000000000c1')
    } finally {
      wrapper.unmount()
    }
  })

  it('hilang setelah karantina dibersihkan', async () => {
    useState<LocalDataState>('localData').value = IDLE_STATE
    quarantineRecord('018f2c4e-0000-7000-8000-0000000000c3')

    const wrapper = await mountSuspended(ShellSyncStatus)
    await flushPromises()

    try {
      expect(wrapper.text()).toContain('1 data tidak bisa dibuka')

      clearQuarantineForTest()
      window.dispatchEvent(new Event(SYNC_STATE_EVENT))
      await flushPromises()

      expect(wrapper.text()).not.toContain('tidak bisa dibuka')
    } finally {
      wrapper.unmount()
    }
  })
})
