import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { TODAY_TASK_LIMIT, type TodayTask } from '~/utils/dailyRoutine'
import type { Task } from '~/utils/tasks'

import DailyTodoCard from './DailyTodoCard.vue'

const TODAY = '2026-10-19'

function task(id: string): Task {
  return {
    id,
    title: id,
    priority: 'medium',
    deadline: null,
    done: false,
    scheduleId: null,
    quadrant: null,
    position: 0,
  }
}

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

describe('DailyTodoCard - daftar panjang', () => {
  it('melipat baris di batas tampilan tapi progres dihitung dari seluruh to-do (B2)', async () => {
    const items: TodayTask[] = Array.from({ length: 12 }, (_, index) => ({
      task: task(`due-${index}`),
      isOverdue: false,
    }))

    const wrapper = await mountSuspended(DailyTodoCard, { props: { items, today: TODAY } })
    mounted.push(wrapper)

    expect(wrapper.findAll('.line')).toHaveLength(TODAY_TASK_LIMIT)
    // Meta memakai total sebenarnya, bukan jumlah baris yang sedang tampil.
    expect(wrapper.text()).toContain('0/12 selesai')

    const more = wrapper.findAll('button').find((button) => button.text().includes('Lihat 2 lagi'))
    expect(more).toBeDefined()
    await more?.trigger('click')

    expect(wrapper.findAll('.line')).toHaveLength(12)
  })
})

describe('DailyTodoCard - grup (design todoGroups)', () => {
  it('mengelompokkan Terlambat di atas, Hari ini tanpa label, Selesai paling bawah + jumlah', async () => {
    const items: TodayTask[] = [
      { task: { ...task('selesai-1'), done: true }, isOverdue: false },
      { task: task('hari-ini'), isOverdue: false },
      { task: task('telat-1'), isOverdue: true },
      { task: task('telat-2'), isOverdue: true },
    ]

    const wrapper = await mountSuspended(DailyTodoCard, { props: { items, today: TODAY } })
    mounted.push(wrapper)

    expect(wrapper.findAll('.group-label').map((label) => label.text())).toEqual([
      'Terlambat',
      'Selesai',
    ])
    expect(wrapper.findAll('.group-count').map((count) => count.text())).toEqual(['2', '1'])
    expect(wrapper.findAll('.line .title').map((title) => title.text())).toEqual([
      'telat-1',
      'telat-2',
      'hari-ini',
      'selesai-1',
    ])
  })
})
