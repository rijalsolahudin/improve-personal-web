import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

import StorageCard from './StorageCard.vue'

const MB = 1024 * 1024

/** Pasang `navigator.storage` palsu selama test, lalu kembalikan seperti semula. */
const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage')

function setStorage(manager: Partial<StorageManager>): void {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: manager })
}

afterEach(() => {
  if (originalStorage) Object.defineProperty(navigator, 'storage', originalStorage)
  else Reflect.deleteProperty(navigator, 'storage')
})

async function mountCard(manager: Partial<StorageManager>) {
  setStorage(manager)
  const wrapper = await mountSuspended(StorageCard)
  await flushPromises()
  return wrapper
}

describe('kartu Penyimpanan di halaman Akun (task #107)', () => {
  it('menampilkan pemakaian vs kuota, persentase, dan status belum aktif', async () => {
    const wrapper = await mountCard({
      estimate: vi.fn().mockResolvedValue({ usage: 2 * MB, quota: 4 * MB }),
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    })

    const text = wrapper.text()
    expect(text).toContain('2 MB dari 4 MB (50%)')
    expect(text).toContain('belum aktif')
    expect(text).toContain('Minta perlindungan')
    expect(text).not.toContain('Penyimpanan hampir penuh')
  })

  it('menampilkan status aktif tanpa tombol permintaan ulang', async () => {
    const wrapper = await mountCard({
      estimate: vi.fn().mockResolvedValue({ usage: MB, quota: 4 * MB }),
      persisted: vi.fn().mockResolvedValue(true),
    })

    const text = wrapper.text()
    expect(text).toContain('aktif')
    expect(text).not.toContain('Minta perlindungan')
  })

  it('memperingatkan saat pemakaian >= 75% dan menyediakan jalan keluar ke backup', async () => {
    const wrapper = await mountCard({
      estimate: vi.fn().mockResolvedValue({ usage: 3 * MB, quota: 4 * MB }),
      persisted: vi.fn().mockResolvedValue(true),
    })

    expect(wrapper.text()).toContain('75%')
    expect(wrapper.text()).toContain('Penyimpanan hampir penuh')
    expect(wrapper.find('a[href="/app/import-export"]').exists()).toBe(true)
  })

  it('tidak menampilkan angka saat browser tidak memberi estimate, tanpa error', async () => {
    const wrapper = await mountCard({
      estimate: vi.fn().mockRejectedValue(new Error('blocked')),
      persisted: vi.fn().mockRejectedValue(new Error('blocked')),
    })

    expect(wrapper.text()).toContain('Browser tidak memberi angka pemakaian')
    expect(wrapper.text()).toContain('tidak diketahui')
  })

  it('browser tanpa navigator.storage menampilkan copy unsupported', async () => {
    setStorage(undefined as unknown as StorageManager)
    const wrapper = await mountSuspended(StorageCard)
    await flushPromises()

    expect(wrapper.text()).toContain('tidak menyediakan informasi penyimpanan lokal')
  })
})
