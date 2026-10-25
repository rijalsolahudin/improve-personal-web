import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetLocalDataSessionForTest } from '~/composables/useLocalData'
import { resetSchedulesHydrationForTest } from '~/composables/useSchedules'
import { resetTasksHydrationForTest } from '~/composables/useTasks'
import type { Schedule } from '~/utils/schedule'
import type { Task, TaskFilter, TaskSort } from '~/utils/tasks'
import { DEFAULT_POMODORO_CONFIG, createPomodoro } from '~/utils/pomodoro'

import ToDoPage from './to-do.vue'

/**
 * Halaman To-do (PRD F2, design Desktop.dc.html `isTodo`): daftar task dengan chip, aksi per baris,
 * filter/urutan, dan empty state. Data disemai lewat `useState` yang sama dengan composable - jalur
 * data yang benar-benar dipakai halaman, bukan mock internal.
 */

/** Rabu, 10 September 2025, 10:00. */
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

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    priority: 'medium',
    deadline: null,
    done: false,
    scheduleId: null,
    quadrant: null,
    position: 0,
    ...overrides,
  }
}

const SOON = task({ id: 'soon', deadline: new Date(2025, 8, 10, 14, 0).getTime() })
const LATER = task({ id: 'later', deadline: new Date(2025, 8, 12, 9, 0).getTime() })
const DONE = task({ id: 'done', done: true, deadline: new Date(2025, 8, 9, 9, 0).getTime() })

const CLEARED_KEYS = [
  'now',
  'tasks',
  'tasksStatus',
  'tasksError',
  'schedules',
  'schedulesStatus',
  'schedulesError',
  'todo-filter',
  'todo-sort',
  'pomodoro',
  'pomodoro-target',
  'pomodoro-target-kind',
  'localData',
] as const

let wrapper: VueWrapper | null = null

function seed(
  tasks: Task[],
  filter: TaskFilter = 'semua',
  sort: TaskSort = 'deadline',
  schedules: Schedule[] = [],
): void {
  useState<number>('now').value = NOW
  useState<Task[]>('tasks').value = tasks
  useState<Schedule[]>('schedules').value = schedules
  useState<TaskFilter>('todo-filter').value = filter
  useState<TaskSort>('todo-sort').value = sort
}

async function mountPage(): Promise<VueWrapper> {
  wrapper = await mountSuspended(ToDoPage)
  await flushPromises()
  return wrapper
}

const titles = (page: VueWrapper): string[] =>
  page.findAll('.row .title').map((item) => item.text())

beforeEach(() => {
  clearNuxtState([...CLEARED_KEYS])
  resetTasksHydrationForTest()
  resetSchedulesHydrationForTest()
  resetLocalDataSessionForTest()
  // Jam Pomodoro dipakai tombol "▶ Fokus" per baris; state-nya harus ada sebelum halaman mount.
  useState('pomodoro-config').value = DEFAULT_POMODORO_CONFIG
  useState('pomodoro').value = createPomodoro(DEFAULT_POMODORO_CONFIG)
})

afterEach(async () => {
  wrapper?.unmount()
  wrapper = null
  await flushPromises()
})

describe('halaman To-do - daftar', () => {
  it('menampilkan task aktif urut deadline beserta chip prioritas dan jadwal', async () => {
    seed(
      [{ ...SOON, scheduleId: KELAS.id, priority: 'urgent' }, LATER, DONE],
      'semua',
      'deadline',
      [KELAS],
    )
    const page = await mountPage()

    expect(titles(page)).toEqual(['soon', 'later'])
    const first = page.get('.row')
    expect(first.get('.chips').text()).toContain('Urgent')
    expect(first.get('.chips').text()).toContain('Kelas AWS')
    expect(first.find('button[aria-label="Fokus pakai Pomodoro: soon"]').exists()).toBe(true)
    expect(first.find('button[aria-label="Edit task: soon"]').exists()).toBe(true)
  })

  it('urutan prioritas mendahulukan urgent', async () => {
    seed(
      [
        { ...SOON, priority: 'low' },
        { ...LATER, priority: 'urgent' },
      ],
      'semua',
      'prioritas',
    )
    const page = await mountPage()

    expect(titles(page)).toEqual(['later', 'soon'])
  })

  it('klik judul membuka form edit task tersebut', async () => {
    seed([SOON])
    const page = await mountPage()

    await page.get('.row .main').trigger('click')
    await flushPromises()

    const dialog = page.get('[role="dialog"]')
    expect(dialog.text()).toContain('Edit task')
    expect(dialog.find('input').element).toHaveProperty('value', 'soon')
  })

  it('klik "▶ Fokus" menjadikan task target Pomodoro, tanpa membuka form edit', async () => {
    seed([SOON])
    const page = await mountPage()

    await page.get('button[aria-label="Fokus pakai Pomodoro: soon"]').trigger('click')
    await flushPromises()

    expect(useState<string | null>('pomodoro-target').value).toBe('soon')
    expect(page.find('[role="dialog"]').exists()).toBe(false)
  })
})

describe('halaman To-do - filter & empty state', () => {
  it('filter "Terlambat" kosong menampilkan empty state, bukan baris kosong', async () => {
    seed([SOON])
    const page = await mountPage()

    const late = page.findAll('button').find((button) => button.text().startsWith('Terlambat'))
    expect(late).toBeDefined()
    await late?.trigger('click')
    await flushPromises()

    expect(titles(page)).toEqual([])
    expect(page.get('.empty').text()).toBe('Nggak ada task di filter ini.')
  })

  it('filter "Selesai" menampilkan task selesai dengan label Selesai', async () => {
    seed([SOON, DONE], 'selesai')
    const page = await mountPage()

    expect(titles(page)).toEqual(['done'])
    expect(page.get('.row .left').text()).toBe('Selesai')
  })
})
