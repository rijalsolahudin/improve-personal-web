import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { reportStorageQuotaError, resetStorageQuotaForTest } from '~/utils/storage/pressure'

import StorageQuotaBanner from './StorageQuotaBanner.vue'

/**
 * Banner kuota penuh (task #108): hanya muncul setelah ada tulisan yang gagal karena kuota, memberi
 * jalan keluar backup, dan bisa ditutup. Sinyalnya global, jadi komponen yang dipasang setelah
 * kejadian tetap melihatnya.
 */
let mounted: VueWrapper | null = null

afterEach(() => {
  mounted?.unmount()
  mounted = null
  resetStorageQuotaForTest()
})

async function mount(): Promise<VueWrapper> {
  mounted = await mountSuspended(StorageQuotaBanner)
  await flushPromises()

  return mounted
}

describe('banner kuota penyimpanan', () => {
  it('tidak merender apa pun saat penyimpanan normal', async () => {
    const wrapper = await mount()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('muncul dengan aksi backup saat tulisan gagal karena kuota', async () => {
    const wrapper = await mount()

    reportStorageQuotaError(1_700_000_000_000)
    await flushPromises()

    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toContain('Penyimpanan perangkat penuh')
    expect(alert.find('a').attributes('href')).toBe('/app/import-export')
  })

  it('dipasang setelah kejadian: banner langsung tampil', async () => {
    reportStorageQuotaError(1)

    const wrapper = await mount()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })

  it('tombol tutup menyembunyikan banner dan mengosongkan sinyal', async () => {
    const wrapper = await mount()
    reportStorageQuotaError(1)
    await flushPromises()

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
