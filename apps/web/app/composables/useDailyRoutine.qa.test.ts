import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetHabitsHydrationForTest, useHabits } from './useHabits'
import { resetSchedulesHydrationForTest } from './useSchedules'
import { resetTasksHydrationForTest, useTasks } from './useTasks'
import { useDailyRoutine } from './useDailyRoutine'
import type { CheckIns, Habit } from '~/utils/habits'
import type { Task } from '~/utils/tasks'
import { MS_PER_HOUR, addDays, fromIsoDate } from '~/utils/time'

/**
 * QA T14 (Ergonio #28) - AC2, AC3, AC5 lewat composable yang dipakai halaman Daily.
 *
 * Data disemai langsung ke `useState` yang sama dengan yang dibaca composable (bukan mocking
 * composable internal), lalu aksi yang dipakai widget dijalankan apa adanya.
 */
const TODAY = '2026-10-19' // Senin
const START = fromIsoDate(TODAY).getTime()
const NOW = START + 9 * MS_PER_HOUR
const END_OF_TODAY = START + 24 * MS_PER_HOUR - 60_000

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    priority: 'medium',
    deadline: null,
    done: false,
    scheduleId: null,
    quadrant: null,
    position: 0,
    ...patch,
  }
}

function habit(id: string, patch: Partial<Habit> = {}): Habit {
  return {
    id,
    name: 'Olahraga',
    icon: 'dumbbell',
    sticker: null,
    color: 0,
    days: null,
    target: 1,
    goalId: null,
    isArchived: false,
    ...patch,
  }
}

function seedTasks(tasks: readonly Task[]): void {
  useState<Task[]>('tasks').value = [...tasks]
}

beforeEach(() => {
  clearNuxtState([
    'tasks',
    'tasksStatus',
    'tasksError',
    'schedules',
    'schedule-attendance',
    'schedulesStatus',
    'schedulesError',
    'habits',
    'habitsCheckIns',
    'habitsStatus',
    'habitsError',
    'daily-routine',
    'now',
  ])
  resetTasksHydrationForTest()
  resetHabitsHydrationForTest()
  resetSchedulesHydrationForTest()
  useState<number>('now').value = NOW
})

describe('edit & hapus task dari widget Daily (AC2)', () => {
  it('simpan dari form mengubah task yang sama (bukan salinan) dan langsung mengeluarkannya dari Prioritas', () => {
    seedTasks([
      task('urgent-1', { title: 'Kirim laporan', priority: 'urgent', deadline: END_OF_TODAY }),
      task('lain', { title: 'Lain', quadrant: 'do' }),
    ])
    const { priorities } = useDailyRoutine()
    const { save, tasks } = useTasks()
    expect(priorities.value.map(({ task: item }) => item.id)).toContain('urgent-1')

    // Form edit Daily memakai field F2; priority diturunkan = keluar dari grup urgent.
    const result = save(
      {
        title: 'Kirim laporan (revisi)',
        priority: 'low',
        hasDeadline: true,
        date: TODAY,
        time: '17:00',
        scheduleId: null,
      },
      'urgent-1',
    )

    expect('id' in result && result.id).toBe('urgent-1')
    expect(tasks.value).toHaveLength(2)
    expect(tasks.value.find((item) => item.id === 'urgent-1')?.title).toBe('Kirim laporan (revisi)')
    expect(priorities.value.map(({ task: item }) => item.id)).not.toContain('urgent-1')
  })

  it('menggeser deadline ke besok mengeluarkan task dari To-do hari ini', () => {
    seedTasks([task('todo-1', { title: 'Bayar listrik', deadline: END_OF_TODAY })])
    const { todayList } = useDailyRoutine()
    const { save } = useTasks()
    expect(todayList.value.map(({ task: item }) => item.id)).toEqual(['todo-1'])

    save(
      {
        title: 'Bayar listrik',
        priority: 'medium',
        hasDeadline: true,
        date: addDays(TODAY, 1),
        time: '17:00',
        scheduleId: null,
      },
      'todo-1',
    )

    expect(todayList.value).toEqual([])
  })

  it('hapus task (aksi form) menghilangkan task dari Prioritas, To-do, dan store F2', () => {
    seedTasks([
      task('do-1', { quadrant: 'do', title: 'Prioritas' }),
      task('todo-1', { title: 'To-do', deadline: END_OF_TODAY }),
    ])
    const { priorities, todayList } = useDailyRoutine()
    const { remove, tasks } = useTasks()

    remove('do-1')
    remove('todo-1')

    expect(priorities.value).toEqual([])
    expect(todayList.value).toEqual([])
    expect(tasks.value).toEqual([])
  })
})

describe('quick add & quick habit check (AC3)', () => {
  it('quick add masuk To-do hari ini', () => {
    const { addTodayTask, todayList } = useDailyRoutine()

    expect(addTodayTask('   ')).toBe(false)
    expect(addTodayTask('Bayar listrik')).toBe(true)

    const added = todayList.value.find(({ task: item }) => item.title === 'Bayar listrik')
    expect(added).toBeDefined()
    expect(added?.isOverdue).toBe(false)
  })

  it('quick add tidak memberi deadline (PRD F12 revisi): task langsung masuk To-do hari ini', () => {
    // Panduan dulu menjanjikan "deadline hari ini", sekarang quick add sengaja tanpa deadline;
    // task tetap tampil karena id-nya dicatat di `addedTaskIds` tanggal ini.
    const { addTodayTask, todayList } = useDailyRoutine()
    addTodayTask('Bayar listrik')

    const added = todayList.value.find(({ task: item }) => item.title === 'Bayar listrik')
    expect(added).toBeDefined()
    expect(added?.task.priority).toBe('medium')
    expect(added?.task.deadline).toBeNull()
    expect(added?.isOverdue).toBe(false)
  })

  it('B1b (reproduksi): task hasil quick add tetap ada di To-do setelah state halaman dimuat ulang', () => {
    const first = useDailyRoutine()
    first.addTodayTask('Bayar listrik')
    expect(first.todayList.value).toHaveLength(1)

    // Muat ulang halaman: state `useState` Daily kosong lagi, data task tetap ada di store.
    clearNuxtState(['daily-routine'])
    const afterReload = useDailyRoutine()

    expect(afterReload.todayList.value.map(({ task: item }) => item.title)).toEqual([
      'Bayar listrik',
    ])
  })

  it('quick habit check menaikkan progres & streak, klik kedua membatalkan', async () => {
    // Streak 2 hari (17 & 18 Okt) sebagai modal; hari ini belum.
    const checkIns: CheckIns = { 'habit-1': { '2026-10-17': 1, '2026-10-18': 1 } }
    useState<Habit[]>('habits').value = [habit('habit-1')]
    useState<CheckIns>('habitsCheckIns').value = checkIns

    const daily = useDailyRoutine()
    const routines = useHabits()
    expect(daily.habitsToday.value.map(({ streak }) => streak)).toEqual([2])
    expect(daily.habitProgress.value).toEqual({ done: 0, total: 1, percent: 0 })

    daily.toggleHabit('habit-1')

    expect(daily.habitsToday.value[0]?.isDone).toBe(true)
    expect(daily.habitsToday.value[0]?.streak).toBe(3)
    expect(daily.habitProgress.value).toEqual({ done: 1, total: 1, percent: 100 })
    expect(routines.isMetToday(routines.habits.value[0] as Habit)).toBe(true)

    daily.toggleHabit('habit-1')

    expect(daily.habitsToday.value[0]?.isDone).toBe(false)
    expect(daily.habitsToday.value[0]?.streak).toBe(2)

    // Tunggu penulisan (yang gagal tanpa sesi) selesai supaya rollback-nya tidak menyeberang ke test lain.
    await flushPromises()
  })
})

describe('cuaca (AC5)', () => {
  it('pilihan cuaca terakhir tampil lagi untuk hari yang sama dan tidak mengganggu widget lain', () => {
    seedTasks([task('do-1', { quadrant: 'do' })])
    const daily = useDailyRoutine()
    daily.setWeather('hujan')

    expect(daily.weather.value).toBe('hujan')
    // Widget lain tetap terisi - tidak ada ketergantungan pada cuaca (apalagi jaringan).
    expect(daily.priorities.value.map(({ task: item }) => item.id)).toEqual(['do-1'])
    expect(daily.todayList.value).toEqual([])

    // Ganti hari: cuaca disimpan per tanggal, hari lain mulai kosong; kembali ke hari ini tampil lagi.
    useState<number>('now').value = fromIsoDate(addDays(TODAY, 1)).getTime() + 9 * MS_PER_HOUR
    expect(daily.weather.value).toBeNull()

    useState<number>('now').value = NOW
    expect(daily.weather.value).toBe('hujan')
  })
})
