// QA #109: aksi "Bersihkan riwayat terhapus" di kartu Penyimpanan.
//
// Yang dibuktikan: tombol muncul saat sesi data lokal sudah terbuka, memanggil purge adapter lewat
// util compaction (cutoff dari kontrak, bukan angka di UI), menampilkan jumlah record yang dibersihkan,
// dan menyegarkan estimate setelahnya. Mock hanya di dua batas platform: `useLocalData` (sesi
// IndexedDB tidak ada di jsdom) dan `navigator.storage` (browser API).
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

import StorageCard from './StorageCard.vue'

const session = vi.hoisted(() => ({ opened: null as unknown }))

mockNuxtImport('useLocalData', () => () => ({
  current: () => session.opened,
  ensure: async () => session.opened,
  // `canCompact` membaca status reaktif; mock dibuat mengikuti sesi yang sedang dipegang.
  state: { value: { status: session.opened === null ? 'idle' : 'ready' } },
}))

const MB = 1024 * 1024
const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage')

function setStorage(manager: Partial<StorageManager>): void {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: manager })
}

afterEach(() => {
  session.opened = null
  if (originalStorage) Object.defineProperty(navigator, 'storage', originalStorage)
  else Reflect.deleteProperty(navigator, 'storage')
})

async function mountCard() {
  const manager = {
    estimate: vi.fn().mockResolvedValue({ usage: 8 * MB, quota: 10 * MB }),
    persisted: vi.fn().mockResolvedValue(true),
  }
  setStorage(manager)

  const wrapper = await mountSuspended(StorageCard)
  await flushPromises()

  return { wrapper, manager }
}

describe('kartu Penyimpanan: bersihkan riwayat terhapus (task #109)', () => {
  it('tanpa sesi data lokal terbuka: tombol tidak ditawarkan', async () => {
    session.opened = null

    const { wrapper } = await mountCard()

    expect(wrapper.text()).not.toContain('Bersihkan riwayat terhapus')
  })

  it('sesi terbuka: tombol memanggil purge, melaporkan jumlah, dan menyegarkan estimate', async () => {
    const purgeTombstones = vi.fn().mockResolvedValue(3)
    session.opened = { storage: { purgeTombstones } }

    const { wrapper, manager } = await mountCard()

    expect(wrapper.text()).toContain('Bersihkan riwayat terhapus')

    await wrapper.get('button').trigger('click')
    await flushPromises()

    // Cutoff dihitung util (now - SYNC_TOMBSTONE_RETENTION_DAYS), bukan angka yang ditulis di UI.
    expect(purgeTombstones).toHaveBeenCalledTimes(1)
    expect(typeof purgeTombstones.mock.calls[0]?.[0]).toBe('number')
    expect(wrapper.text()).toContain('3 record dibersihkan.')
    // Sekali saat mount, sekali lagi setelah pembersihan.
    expect(manager.estimate).toHaveBeenCalledTimes(2)
  })

  it('tidak ada yang dibersihkan: pesan "tidak ada riwayat" dan estimate tetap disegarkan', async () => {
    session.opened = { storage: { purgeTombstones: vi.fn().mockResolvedValue(0) } }

    const { wrapper } = await mountCard()
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Tidak ada riwayat yang perlu dibersihkan.')
  })
})
