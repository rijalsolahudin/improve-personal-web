import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetHabitsHydrationForTest } from '~/composables/useHabits'
import type { Habit } from '~/utils/habits'

import HabitPage from './habit.vue'

/**
 * Halaman Habit: habit terarsip harus hilang dari grid (dan dari ringkasan hari ini), tapi tetap bisa
 * ditemukan & dikembalikan di daftar arsip; gagal memuat data tidak boleh tampil sebagai "belum ada
 * habit" - itu membuat user mengira datanya hilang (QA F6).
 */
function habitOf(overrides: Partial<Habit> = {}): Habit {
  return {
    id: '018f2c4e-0000-7000-8000-0000000000cc',
    name: 'Jalan pagi',
    icon: 'walking',
    sticker: null,
    color: 0,
    days: null,
    target: 1,
    goalId: null,
    isArchived: false,
    ...overrides,
  }
}

const ACTIVE = habitOf()
const ARCHIVED = habitOf({
  id: '018f2c4e-0000-7000-8000-0000000000dd',
  name: 'Baca buku',
  isArchived: true,
})

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

describe('halaman habit', () => {
  it('habit terarsip tidak muncul di grid, tapi muncul di daftar arsip', async () => {
    useState<Habit[]>('habits').value = [ACTIVE, ARCHIVED]
    mounted = await mountSuspended(HabitPage)
    await flushPromises()

    const grid = mounted.find('[role="table"]')
    expect(grid.text()).toContain('Jalan pagi')
    expect(grid.text()).not.toContain('Baca buku')

    const archive = mounted.find('details')
    expect(archive.text()).toContain('Arsip (1)')
    expect(archive.text()).toContain('Baca buku')
  })

  it('gagal memuat: banner error tampil, bukan ajakan bikin habit', async () => {
    mounted = await mountSuspended(HabitPage)
    await flushPromises()

    // Hydrate yang gagal (mis. storage tidak bisa dibuka) menandai status `error` di composable.
    useState<'idle' | 'loading' | 'ready' | 'error'>('habitsStatus').value = 'error'
    await flushPromises()

    expect(mounted.find('[role="alert"]').text()).toBe(
      'Gagal memuat habit. Coba muat ulang halaman.',
    )
    expect(mounted.text()).not.toContain('Belum ada habit')
  })
})
