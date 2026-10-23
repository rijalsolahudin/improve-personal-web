import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetTasksHydrationForTest } from '~/composables/useTasks'
import { useDailyRoutine } from '~/composables/useDailyRoutine'
import { TODAY_TASK_LIMIT } from '~/utils/dailyRoutine'
import type { Task } from '~/utils/tasks'
import { MS_PER_HOUR, fromIsoDate } from '~/utils/time'

import DailyTodoCard from './DailyTodoCard.vue'

/**
 * QA T14 putaran 2 (Ergonio #28) - B2 dari sisi yang dilihat user: 12 task jatuh tempo hari ini
 * tidak boleh terpotong diam-diam. Daftar boleh dilipat, tetapi progres harus menghitung semuanya
 * dan harus ada tombol "Lihat N lagi" seperti widget Prioritas.
 */
const TODAY = '2026-10-19'
const START = fromIsoDate(TODAY).getTime()
const NOW = START + 10 * MS_PER_HOUR

function task(id: string, dueHour: number): Task {
  return {
    id,
    title: id,
    priority: 'medium',
    deadline: START + dueHour * MS_PER_HOUR,
    done: false,
    scheduleId: null,
    quadrant: null,
    position: 0,
  }
}

const mounted: VueWrapper[] = []

beforeEach(() => {
  localStorage.clear()
  clearNuxtState(['tasks', 'tasksStatus', 'tasksError', 'daily-routine', 'now'])
  resetTasksHydrationForTest()
  useState<number>('now').value = NOW
})

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

describe('To-do 12 task hari ini (B2)', () => {
  it('progres dihitung dari 12 task, daftar dilipat dengan "Lihat 2 lagi", bukan dipotong', async () => {
    useState<Task[]>('tasks').value = Array.from({ length: 12 }, (_, index) =>
      task(`due-${index}`, 8 + index),
    )

    const { todayList } = useDailyRoutine()
    expect(todayList.value).toHaveLength(12)

    const wrapper = await mountSuspended(DailyTodoCard, {
      props: { items: todayList.value, today: TODAY },
    })
    mounted.push(wrapper)

    // Batas tampilan tetap ringkas...
    expect(wrapper.findAll('.line')).toHaveLength(TODAY_TASK_LIMIT)
    // ...tetapi meta memakai total sebenarnya.
    expect(wrapper.text()).toContain(`0/${todayList.value.length} selesai`)
    expect(wrapper.text()).toContain('0/12 selesai')

    const more = wrapper.findAll('button').find((button) => button.text().includes('Lihat 2 lagi'))
    expect(more).toBeDefined()

    await more?.trigger('click')

    expect(wrapper.findAll('.line')).toHaveLength(12)
    expect(wrapper.text()).not.toContain('Lihat 2 lagi')
  })

  it('12 task dengan 3 selesai: progres 3/12 dan sisa 9 tetap bisa dibuka', async () => {
    const tasks = Array.from({ length: 12 }, (_, index) => task(`due-${index}`, 8 + index)).map(
      (item, index) => (index < 3 ? { ...item, done: true } : item),
    )
    useState<Task[]>('tasks').value = tasks

    const { todayList } = useDailyRoutine()
    const wrapper = await mountSuspended(DailyTodoCard, {
      props: { items: todayList.value, today: TODAY },
    })
    mounted.push(wrapper)

    expect(wrapper.text()).toContain('3/12 selesai')
    expect(wrapper.findAll('.line')).toHaveLength(TODAY_TASK_LIMIT)
    expect(wrapper.findAll('button').some((button) => button.text().includes('Lihat 2 lagi'))).toBe(
      true,
    )
  })
})
