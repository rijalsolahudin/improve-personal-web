import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocalDataState } from '~/composables/useLocalData'
import { markSyncRunEnd, markSyncRunStart, resetSyncActivityForTest } from '~/utils/sync/activity'
import { SYNC_REMOTE_APPLIED_EVENT, SYNC_STATE_EVENT } from '~/utils/sync/events'
import { clearQuarantineForTest, quarantineRecord } from '~/utils/sync/quarantine'
import { registerSyncReloader, resetSyncReloadersForTest } from '~/utils/sync/refresh'

import ShellSyncStatus from './ShellSyncStatus.vue'

/**
 * Indikator sync di dock kanan bawah (AC T22 + T105): sumber statusnya `readSyncStatus` + outbox,
 * tetapi yang tampil hanya saat siklus berjalan atau saat ada yang perlu diperhatikan. "Sudah
 * tersinkron" tidak dirender sama sekali - bukan sekadar disembunyikan dengan CSS.
 *
 * `dashboard.qa.test.ts` memastikan penempatannya (dock, bukan atas halaman); test ini mengunci
 * arti teksnya.
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
  resetSyncActivityForTest()
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  resetSyncActivityForTest()
  await flushPromises()
})

describe('indikator status sync', () => {
  it('penyimpanan lokal belum terbuka: tidak menampilkan status apa pun', async () => {
    useState<LocalDataState>('localData').value = IDLE_STATE
    const wrapper = await mount()

    expect(wrapper.find('.sync').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/tersinkron|menunggu status/i)
  })

  it('perangkat terkunci: tetap tidak mengklaim data sudah tersinkron', async () => {
    useState<LocalDataState>('localData').value = LOCKED_STATE
    const wrapper = await mount()

    expect(wrapper.find('.sync').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/tersinkron/i)
  })

  it('sedang sync: "Menyinkronkan…" tampil, lalu hilang saat siklus selesai', async () => {
    useState<LocalDataState>('localData').value = IDLE_STATE
    const wrapper = await mount()

    markSyncRunStart()
    await flushPromises()

    expect(wrapper.text()).toContain('Menyinkronkan…')
    expect(wrapper.find('.spinner').exists()).toBe(true)

    markSyncRunEnd()
    await flushPromises()

    expect(wrapper.find('.sync').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/tersinkron/i)
  })

  it('dipasang saat siklus sudah berjalan: indikator langsung tampil', async () => {
    useState<LocalDataState>('localData').value = IDLE_STATE
    markSyncRunStart()

    const wrapper = await mount()

    expect(wrapper.text()).toContain('Menyinkronkan…')
    markSyncRunEnd()
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

  /**
   * Akun aktif tapi penyimpanan lokalnya belum terbuka: keterangan karantina tetap boleh tampil
   * (sumbernya `localStorage`, bukan IndexedDB), sedangkan badge status tetap "menunggu".
   */
  const UNOPENED_STATE: LocalDataState = { ...IDLE_STATE, userId: USER }

  beforeEach(() => {
    localStorage.clear()
    clearQuarantineForTest()
  })

  afterEach(() => {
    clearQuarantineForTest()
    localStorage.clear()
  })

  it('muncul saat ada record yang tidak bisa dibuka, tanpa mengubah arti badge status', async () => {
    useState<LocalDataState>('localData').value = UNOPENED_STATE
    quarantineRecord(USER, '018f2c4e-0000-7000-8000-0000000000c1')
    quarantineRecord(USER, '018f2c4e-0000-7000-8000-0000000000c2')

    const wrapper = await mountSuspended(ShellSyncStatus)
    await flushPromises()

    try {
      const text = wrapper.text()
      expect(text).toContain(
        '2 data tidak bisa dibuka dan tidak ditampilkan, tetapi tetap tersimpan di perangkat ini.',
      )
      // Keterangan karantina bukan status sync: badge status tetap tidak dirender (belum terbuka).
      expect(wrapper.find('.sync').exists()).toBe(false)
      // Yang tampil hanya jumlah; id record tidak pernah bocor ke UI.
      expect(text).not.toContain('018f2c4e-0000-7000-8000-0000000000c1')
    } finally {
      wrapper.unmount()
    }
  })

  it('hilang setelah karantina dibersihkan', async () => {
    useState<LocalDataState>('localData').value = UNOPENED_STATE
    quarantineRecord(USER, '018f2c4e-0000-7000-8000-0000000000c3')

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
