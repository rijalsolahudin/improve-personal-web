import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetLocalDataSessionForTest } from '~/composables/useLocalData'
import { resetSchedulesHydrationForTest } from '~/composables/useSchedules'
import { resetTasksHydrationForTest } from '~/composables/useTasks'
import type { Schedule } from '~/utils/schedule'

import KalenderPage from './kalender.vue'

/**
 * Regresi B2 (QA T9): tombol ‹/› harus memindahkan `anchor` DAN tanggal terpilih, supaya papan
 * (view hari/pekan/bulan) dan panel detail hari tidak menampilkan tanggal yang berbeda.
 */

const NOW = new Date(2025, 8, 10, 10, 0, 0).getTime()

const KELAS: Schedule = {
  id: 'sched-kelas',
  title: 'Kelas AWS',
  color: 0,
  start: '2025-09-01',
  time: '09:00',
  dur: 90,
  allDay: false,
  rec: { type: 'weekly', days: [1, 4], interval: 1 },
  ends: { type: 'never' },
  exceptions: [],
  goalId: null,
}

const CLEARED_KEYS = [
  'now',
  'schedules',
  'schedule-attendance',
  'schedulesStatus',
  'schedulesError',
  'tasks',
  'tasksStatus',
  'tasksError',
  'goals',
  'countdowns',
  'memos',
  'memo-paper',
  'calendar-view',
  'calendar-anchor',
  'calendar-selected',
  'localData',
] as const

let mounted: VueWrapper | null = null

function seedCalendar(view: 'hari' | 'pekan' | 'bulan', anchor: string, selected: string): void {
  useState<number>('now').value = NOW
  useState<Schedule[]>('schedules').value = [KELAS]
  useState('tasks').value = []
  useState('goals').value = []
  useState('countdowns').value = []
  useState('memos').value = { memos: [], moods: {} }
  useState<'hari' | 'pekan' | 'bulan'>('calendar-view').value = view
  useState<string>('calendar-anchor').value = anchor
  useState<string>('calendar-selected').value = selected
}

async function mountCalendar(): Promise<VueWrapper> {
  const wrapper = await mountSuspended(KalenderPage)
  await flushPromises()
  return wrapper
}

const button = (wrapper: VueWrapper, label: string) =>
  wrapper.findAll('button').find((item) => item.text() === label)

async function click(wrapper: VueWrapper, label: string): Promise<void> {
  await button(wrapper, label)?.trigger('click')
  await flushPromises()
}

beforeEach(() => {
  clearNuxtState([...CLEARED_KEYS])
  resetTasksHydrationForTest()
  resetSchedulesHydrationForTest()
  resetLocalDataSessionForTest()
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('T9 navigasi ‹/› menyamakan papan dan panel hari', () => {
  it('view hari: papan dan panel pindah ke tanggal yang sama', async () => {
    seedCalendar('hari', '2025-09-10', '2025-09-10')
    mounted = await mountCalendar()

    await click(mounted, '›')

    expect(mounted.find('.range').text()).toBe('Kamis, 11 September 2025')
    expect(mounted.find('aside.panel').text()).toContain('11 September')
    expect(mounted.find('aside.panel').text()).not.toContain('10 September')
  })

  it('view pekan: tanggal terpilih tetap di dalam pekan yang tampil', async () => {
    seedCalendar('pekan', '2025-09-10', '2025-09-10')
    mounted = await mountCalendar()

    await click(mounted, '›')

    expect(mounted.find('.range').text()).toBe('15 Sep – 21 Sep 2025')
    expect(mounted.find('aside.panel').text()).toContain('17 September')
  })

  it('view bulan: panel ikut ke bulan yang tampil setelah ‹/›', async () => {
    seedCalendar('bulan', '2025-09-01', '2025-09-10')
    mounted = await mountCalendar()

    await click(mounted, '›')

    expect(mounted.find('.range').text()).toBe('Oktober 2025')
    expect(mounted.find('aside.panel').text()).toContain('1 Oktober')

    await click(mounted, '‹')

    expect(mounted.find('.range').text()).toBe('September 2025')
    expect(mounted.find('aside.panel').text()).toContain('1 September')
  })
})
