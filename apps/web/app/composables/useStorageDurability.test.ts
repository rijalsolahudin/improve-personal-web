import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useStorageDurability } from './useStorageDurability'

const MB = 1024 * 1024

/** `StorageManager` palsu: hanya method yang dipakai composable. */
function fakeManager(overrides: Partial<StorageManager>): StorageManager {
  return overrides as StorageManager
}

async function mountWith(manager: StorageManager | null) {
  const Harness = defineComponent({
    setup() {
      return useStorageDurability({ manager })
    },
    render: () => h('div'),
  })

  const wrapper = await mountSuspended(Harness)
  await flushPromises()

  return wrapper.vm as unknown as {
    persisted: boolean | null
    usage: number | null
    quota: number | null
    percent: number
    isSupported: boolean
    isLow: boolean
    formattedUsage: string
    formattedQuota: string
    refresh: () => Promise<void>
    protect: () => Promise<boolean>
  }
}

describe('useStorageDurability', () => {
  it('mengisi pemakaian, kuota, dan status persistent saat mount', async () => {
    const manager = fakeManager({
      estimate: vi.fn().mockResolvedValue({ usage: 2 * MB, quota: 4 * MB }),
      persisted: vi.fn().mockResolvedValue(true),
    })

    const vm = await mountWith(manager)

    expect(vm.usage).toBe(2 * MB)
    expect(vm.quota).toBe(4 * MB)
    expect(vm.percent).toBe(50)
    expect(vm.isLow).toBe(false)
    expect(vm.isSupported).toBe(true)
    expect(vm.persisted).toBe(true)
    expect(vm.formattedUsage).toBe('2 MB')
    expect(vm.formattedQuota).toBe('4 MB')
  })

  it('menandai kuota hampir penuh di ambang 75%', async () => {
    const manager = fakeManager({
      estimate: vi.fn().mockResolvedValue({ usage: 3 * MB, quota: 4 * MB }),
      persisted: vi.fn().mockResolvedValue(false),
    })

    const vm = await mountWith(manager)

    expect(vm.percent).toBe(75)
    expect(vm.isLow).toBe(true)
    expect(vm.persisted).toBe(false)
  })

  it('protect() meminta persist lalu menyegarkan status', async () => {
    const persisted = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const persist = vi.fn().mockResolvedValue(true)
    const manager = fakeManager({
      estimate: vi.fn().mockResolvedValue({ usage: MB, quota: 10 * MB }),
      persisted,
      persist,
    })

    const vm = await mountWith(manager)

    await expect(vm.protect()).resolves.toBe(true)
    expect(persist).toHaveBeenCalledOnce()
    expect(vm.persisted).toBe(true)
  })

  it('browser tanpa StorageManager: tidak ada angka, tapi tidak error', async () => {
    const vm = await mountWith(null)

    expect(vm.isSupported).toBe(false)
    expect(vm.usage).toBeNull()
    expect(vm.quota).toBeNull()
    expect(vm.persisted).toBeNull()
    expect(vm.percent).toBe(0)

    await expect(vm.protect()).resolves.toBe(false)
  })
})
