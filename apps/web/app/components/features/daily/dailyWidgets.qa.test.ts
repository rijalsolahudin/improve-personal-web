import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetSchedulesHydrationForTest } from '~/composables/useSchedules'
import { resetTasksHydrationForTest } from '~/composables/useTasks'
import type { PriorityTask } from '~/utils/dailyRoutine'
import type { Task } from '~/utils/tasks'
import { MS_PER_HOUR, addDays, fromIsoDate } from '~/utils/time'

import DailyPriorityList from './DailyPriorityList.vue'
import DailyTodoCard from './DailyTodoCard.vue'
import TodoForm from '~/components/features/todo/TodoForm.vue'

/**
 * QA T14 (Ergonio #28) - AC1 (daftar panjang dilipat, penanda asal), AC2 (edit/hapus dari widget),
 * AC3 (progres & quick add) pada level komponen yang benar-benar dirender halaman Daily.
 */
const TODAY = '2026-10-19'
const START = fromIsoDate(TODAY).getTime()
const NOW = START + 10 * MS_PER_HOUR

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

function taskAt(offset: number, hour: number): number {
  return fromIsoDate(addDays(TODAY, offset)).getTime() + hour * MS_PER_HOUR
}

const mounted: VueWrapper[] = []

beforeEach(() => {
  clearNuxtState([
    'tasks',
    'tasksStatus',
    'tasksError',
    'schedules',
    'schedule-attendance',
    'schedulesStatus',
    'schedulesError',
    'now',
  ])
  resetTasksHydrationForTest()
  resetSchedulesHydrationForTest()
  useState<number>('now').value = NOW
})

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

describe('DailyPriorityList (AC1)', () => {
  const priorities: PriorityTask[] = [
    {
      task: task('do-1', { quadrant: 'do', priority: 'urgent', title: 'Penting' }),
      origin: 'quadrant',
    },
    ...Array.from({ length: 8 }, (_, index) => ({
      task: task(`urgent-${index}`, { priority: 'urgent' as const, title: `Urgent ${index}` }),
      origin: 'urgent' as const,
    })),
  ]

  it('7 item pertama tampil, sisanya dilipat di "Lihat N lagi" lalu bisa dibuka semua', async () => {
    const wrapper = await mountSuspended(DailyPriorityList, {
      props: { priorities, now: NOW },
    })
    mounted.push(wrapper)

    expect(wrapper.findAll('li')).toHaveLength(7)
    const more = wrapper.findAll('button').find((button) => button.text().includes('Lihat 2 lagi'))
    expect(more).toBeDefined()

    await more?.trigger('click')

    expect(wrapper.findAll('li')).toHaveLength(9)
    expect(wrapper.findAll('li')[8]?.text()).toContain('Urgent 7')
  })

  it('tiap item diberi penanda asal: chip "Penting & Mendesak" + badge "Urgent"', async () => {
    const wrapper = await mountSuspended(DailyPriorityList, {
      props: { priorities, now: NOW },
    })
    mounted.push(wrapper)

    const rows = wrapper.findAll('li')
    expect(rows[0]?.text()).toContain('Penting & Mendesak')
    expect(rows[0]?.text()).toContain('Urgent')
    expect(rows[1]?.text()).not.toContain('Penting & Mendesak')
    expect(rows[1]?.text()).toContain('Urgent')
  })
})

describe('DailyTodoCard (AC3)', () => {
  const items = [
    { task: task('done', { done: true, title: 'Sudah' }), isOverdue: false },
    {
      task: task('late', { title: 'Telat', deadline: taskAt(-1, 10) }),
      isOverdue: true,
    },
    {
      task: task('today', { title: 'Hari ini', deadline: taskAt(0, 17) }),
      isOverdue: false,
    },
  ]

  it('menampilkan progres done/total dan menandai deadline yang terlambat', async () => {
    const wrapper = await mountSuspended(DailyTodoCard, {
      props: { items, today: TODAY },
    })
    mounted.push(wrapper)

    expect(wrapper.text()).toContain('1/3 selesai')
    const overdue = wrapper.find('.meta.overdue')
    expect(overdue.exists()).toBe(true)
    expect(overdue.text()).toContain('18 Okt')
  })

  it('ikon edit mengirim id task yang sama (bukan salinan)', async () => {
    const wrapper = await mountSuspended(DailyTodoCard, {
      props: { items, today: TODAY },
    })
    mounted.push(wrapper)

    const edit = wrapper
      .findAll('button')
      .find((button) => button.attributes('title') === 'Edit task: Telat')
    expect(edit).toBeDefined()

    await edit?.trigger('click')

    expect(wrapper.emitted('edit')).toEqual([['late']])
  })

  it('quick add mengirim judul yang sudah di-trim dan mengabaikan judul kosong', async () => {
    const wrapper = await mountSuspended(DailyTodoCard, {
      props: { items: [], today: TODAY },
    })
    mounted.push(wrapper)

    const input = wrapper.find('input')
    await input.setValue('   ')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('add')).toBeUndefined()

    await input.setValue('  Bayar listrik  ')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('add')).toEqual([['Bayar listrik']])
  })
})

describe('TodoForm dari widget Daily (AC2)', () => {
  function seed(tasks: readonly Task[]): void {
    useState<Task[]>('tasks').value = [...tasks]
  }

  function buttonByText(wrapper: VueWrapper, label: string) {
    const button = wrapper.findAll('button').find((candidate) => candidate.text() === label)
    expect(button).toBeDefined()
    return button as NonNullable<typeof button>
  }

  it('edit menyimpan ke task yang sama (id tetap) dan tombol hapus butuh konfirmasi dua klik', async () => {
    seed([task('edit-1', { title: 'Judul lama', priority: 'urgent' })])

    const wrapper = await mountSuspended(TodoForm, {
      props: { taskId: 'edit-1' },
    })
    mounted.push(wrapper)

    const title = wrapper.find('input[data-autofocus]')
    await title.setValue('Judul baru')
    await wrapper.find('form').trigger('submit')

    const tasks = useState<Task[]>('tasks').value
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.id).toBe('edit-1')
    expect(tasks[0]?.title).toBe('Judul baru')

    // Buka lagi lalu hapus: klik pertama hanya mengubah label konfirmasi.
    const deleteWrapper = await mountSuspended(TodoForm, {
      props: { taskId: 'edit-1' },
    })
    mounted.push(deleteWrapper)

    const first = buttonByText(deleteWrapper, 'Hapus task')
    await first.trigger('click')
    expect(useState<Task[]>('tasks').value).toHaveLength(1)

    const confirm = buttonByText(deleteWrapper, 'Yakin hapus?')
    await confirm.trigger('click')
    await flushPromises()

    expect(useState<Task[]>('tasks').value).toEqual([])
    expect(deleteWrapper.emitted('close')).toHaveLength(1)
  })
})
