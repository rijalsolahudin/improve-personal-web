import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocalDataState } from '~/composables/useLocalData'

import StorageCard from './StorageCard.vue'

/**
 * Regresi QA #109 (High): tombol "Bersihkan riwayat terhapus" tidak muncul saat reload halaman Akun.
 *
 * Penyebabnya `canCompact` membaca `useLocalData().current()` - variabel modul non-reaktif yang baru
 * terisi SETELAH mount. Test ini memakai composable asli + `useState('localData')` (bukan mock), lalu
 * membuktikan tombol muncul ketika status berubah dari `idle` ke `ready`.
 */
const IDLE_STATE: LocalDataState = {
  status: 'idle',
  isFreshKey: false,
  deviceId: null,
  userId: null,
  error: null,
}

const READY_STATE: LocalDataState = {
  status: 'ready',
  isFreshKey: false,
  deviceId: 'device-a',
  userId: 'user-a',
  error: null,
}

const MB = 1024 * 1024
const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage')

let mounted: VueWrapper | null = null

function setStorage(manager: Partial<StorageManager>): void {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: manager })
}

beforeEach(() => {
  clearNuxtState(['localData'])
  setStorage({
    estimate: vi.fn().mockResolvedValue({ usage: 8 * MB, quota: 10 * MB }),
    persisted: vi.fn().mockResolvedValue(true),
  })
})

afterEach(() => {
  mounted?.unmount()
  mounted = null
  if (originalStorage) Object.defineProperty(navigator, 'storage', originalStorage)
  else Reflect.deleteProperty(navigator, 'storage')
})

describe('kartu Penyimpanan: aksi compaction reaktif (QA #109)', () => {
  it('muncul saat status data lokal berubah menjadi ready setelah mount', async () => {
    useState<LocalDataState>('localData').value = IDLE_STATE

    mounted = await mountSuspended(StorageCard)
    await flushPromises()

    expect(mounted.text()).not.toContain('Bersihkan riwayat terhapus')

    // Reload halaman Akun: `account.load()` membuka sesi lokal setelah kartu terpasang.
    useState<LocalDataState>('localData').value = READY_STATE
    await flushPromises()

    expect(mounted.text()).toContain('Bersihkan riwayat terhapus')
  })

  it('sudah ready sebelum mount: tombol langsung tersedia', async () => {
    useState<LocalDataState>('localData').value = READY_STATE

    mounted = await mountSuspended(StorageCard)
    await flushPromises()

    expect(mounted.text()).toContain('Bersihkan riwayat terhapus')
  })
})
