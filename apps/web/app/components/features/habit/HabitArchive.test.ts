import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetHabitsHydrationForTest } from '~/composables/useHabits'
import type { Habit } from '~/utils/habits'

import HabitArchive from './HabitArchive.vue'

/**
 * Daftar arsip: hanya habit terarsip, dan "Kembalikan" hanya melaporkan sukses kalau tulisannya
 * benar-benar tersimpan. Sesi data lokal tidak tersedia di test, jadi yang diuji adalah jalur gagal
 * (habit tetap di arsip + pesan error) - jalur sukses `setArchived` diuji di `useHabits.test.ts`.
 */
function archived(id: string, name: string): Habit {
  return {
    id,
    name,
    icon: 'book-open',
    sticker: null,
    color: 0,
    days: null,
    target: 1,
    goalId: null,
    isArchived: true,
  }
}

const ARCHIVED = archived('018f2c4e-0000-7000-8000-0000000000bb', 'Baca buku')

let mounted: VueWrapper | null = null

beforeEach(() => {
  clearNuxtState(['habits', 'habitsCheckIns', 'habitsStatus', 'habitsError', 'localData'])
  resetHabitsHydrationForTest()
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('daftar arsip habit', () => {
  it('tidak menampilkan apa pun saat belum ada habit terarsip', async () => {
    mounted = await mountSuspended(HabitArchive)

    expect(mounted.find('details').exists()).toBe(false)
    expect(mounted.text()).toBe('')
  })

  it('menampilkan habit terarsip beserta tombol kembalikan', async () => {
    useState<Habit[]>('habits').value = [ARCHIVED]
    mounted = await mountSuspended(HabitArchive)

    expect(mounted.find('summary').text()).toContain('Arsip (1)')
    expect(mounted.text()).toContain('Baca buku')
    expect(mounted.findAll('button').map((button) => button.text())).toEqual(['Kembalikan'])
  })

  it('kembalikan gagal: habit tetap di arsip dan pesan error tampil', async () => {
    useState<Habit[]>('habits').value = [ARCHIVED]
    mounted = await mountSuspended(HabitArchive)

    await mounted.find('button').trigger('click')
    await flushPromises()

    expect(mounted.find('[role="alert"]').text()).toBe('Gagal mengembalikan habit. Coba lagi.')
    expect(mounted.text()).toContain('Baca buku')
    expect(useState<Habit[]>('habits').value[0]).toMatchObject({ isArchived: true })
  })
})
