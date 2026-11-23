import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StorageAdapter } from '@improve-personal/core'

import { createManualClock, createMemoryStorage } from '@improve-personal/core'

import {
  BACKUP_LAST_AT_KEY,
  BACKUP_SNOOZE_UNTIL_KEY,
  ONBOARDED_AT_KEY,
} from '~/utils/io/backup-reminder'

import DailyBackupReminder from './DailyBackupReminder.vue'

/**
 * Layar awal + pengingat backup Daily (PRD F15): tampil saat perlu, bisa ditunda, tidak ada tutup
 * permanen. Sesi data lokal dimock di batasnya dengan penyimpanan memori sungguhan.
 */

const mocks = vi.hoisted(() => ({ storage: null as StorageAdapter | null }))

vi.mock('~/composables/useLocalData', () => ({
  useLocalData: () => ({ ensure: async () => ({ storage: mocks.storage }) }),
}))

const DAY = 24 * 60 * 60 * 1000

async function mount() {
  const wrapper = await mountSuspended(DailyBackupReminder)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  localStorage.clear()
  // Perangkat lama yang sudah melewati layar awal - kecuali test layar awal mengosongkannya.
  localStorage.setItem(ONBOARDED_AT_KEY, String(Date.now()))
  mocks.storage = createMemoryStorage({ clock: createManualClock(Date.now()) })
  clearNuxtState([
    'backupLastAt',
    'backupSnoozeUntil',
    'backupPersisted',
    'backupReminderLoaded',
    'backupNeedsOnboarding',
  ])
})

afterEach(() => localStorage.clear())

describe('pengingat backup Daily', () => {
  it('belum pernah backup: ajakan backup + tombol tunda, tanpa tombol tutup permanen', async () => {
    const wrapper = await mount()

    expect(wrapper.text()).toContain('belum pernah backup')
    expect(wrapper.find('a').attributes('href')).toBe('/app/import-export')
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Nanti saja'])
  })

  it('backup 3 hari lalu: tidak tampil; 9 hari lalu: tampil dengan umur backup', async () => {
    localStorage.setItem(BACKUP_LAST_AT_KEY, String(Date.now() - 3 * DAY))
    expect((await mount()).find('aside').exists()).toBe(false)

    clearNuxtState(['backupLastAt', 'backupReminderLoaded'])
    localStorage.setItem(BACKUP_LAST_AT_KEY, String(Date.now() - 9 * DAY))
    expect((await mount()).text()).toContain('Backup terakhir 9 hari lalu')
  })

  it('"Nanti saja" menyembunyikan dan mencatat waktu tunda (sehari)', async () => {
    const wrapper = await mount()
    await wrapper.find('button').trigger('click')

    expect(wrapper.find('aside').exists()).toBe(false)
    const until = Number(localStorage.getItem(BACKUP_SNOOZE_UNTIL_KEY))
    expect(until - Date.now()).toBeGreaterThan(DAY - 60_000)
    expect(until - Date.now()).toBeLessThanOrEqual(DAY)
  })

  it('perangkat kosong: layar awal "Pulihkan / Mulai baru"; memilih jalur menutupnya untuk seterusnya', async () => {
    localStorage.removeItem(ONBOARDED_AT_KEY)
    const wrapper = await mount()

    expect(wrapper.text()).toContain('Perangkat ini masih kosong')
    expect(wrapper.find('a').text()).toBe('Pulihkan dari backup')
    await wrapper.find('button').trigger('click')

    expect(localStorage.getItem(ONBOARDED_AT_KEY)).not.toBeNull()
    // Setelah memilih "Mulai baru", yang tersisa pengingat backup biasa (belum pernah backup).
    expect(wrapper.text()).toContain('belum pernah backup')
  })
})
