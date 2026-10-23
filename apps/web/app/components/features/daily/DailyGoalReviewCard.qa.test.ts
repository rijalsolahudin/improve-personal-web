import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetGoalLinksHydrationForTest } from '~/composables/useGoalLinks'
import { resetGoalsHydrationForTest } from '~/composables/useGoals'
import { resetHabitsHydrationForTest } from '~/composables/useHabits'
import { resetSchedulesHydrationForTest } from '~/composables/useSchedules'
import { resetTasksHydrationForTest } from '~/composables/useTasks'
import type { Goal } from '~/utils/goals'
import type { Memo, MoodByDate } from '~/utils/memo'

import DailyGoalReviewCard from './DailyGoalReviewCard.vue'

/**
 * Kartu review berkala di Daily (T18, PRD F13 "Review Berkala").
 *
 * AC: kartu muncul saat chapter berakhir/terlewat dan tiap akhir pekan; jawabannya masuk jurnal
 * ("Tentang Hari Ini") dengan mention goal supaya tampil sebagai chip.
 *
 * "Hari ini" dipatok Rabu 2026-02-11 supaya tidak ada kartu akhir pekan yang mengaburkan hasil.
 */

/** Rabu, 11 Feb 2026 - bukan akhir pekan. */
const TODAY = '2026-02-11'
const NOW_MS = new Date(2026, 1, 11, 8, 0, 0).getTime()

const GOAL_ID = '0192f0a0-0000-7000-8000-000000000001'
const CHAPTER_OVERDUE = '0192f0a0-0000-7000-8000-000000000003'
const CHAPTER_FUTURE = '0192f0a0-0000-7000-8000-000000000004'
const CHAPTER_ENDING_TODAY = '0192f0a0-0000-7000-8000-000000000005'

type MemoStore = { memos: Memo[]; moods: MoodByDate }

function goalWith(chapters: Goal['chapters'], status: Goal['status'] = 'aktif'): Goal {
  return {
    id: GOAL_ID,
    title: 'Lari 10K',
    why: 'Sehat',
    category: 'kesehatan',
    status,
    start: '2026-01-05',
    end: '2026-03-31',
    cover: null,
    along: [],
    chapters,
  }
}

function chapter(id: string, title: string, start: string, end: string): Goal['chapters'][number] {
  return { id, title, start, end, isManualDone: false, isClosed: false, items: [] }
}

const OVERDUE = chapter(CHAPTER_OVERDUE, 'Base building', '2026-01-05', '2026-02-04')
const FUTURE = chapter(CHAPTER_FUTURE, 'Speed work', '2026-03-01', '2026-03-31')

let mounted: VueWrapper | null = null

function prepare(goal: Goal): void {
  useState<number>('now').value = NOW_MS
  useState<Goal[]>('goals').value = [goal]
  useState<'idle' | 'loading' | 'ready' | 'error'>('goalsStatus').value = 'ready'
  useState<string[]>('goal-review-answered').value = []
  useState<MemoStore>('memos').value = { memos: [], moods: {} }
}

function card(wrapper: VueWrapper) {
  return wrapper.find('[data-anchor="daily-goal-review"]')
}

function buttonByText(wrapper: VueWrapper, label: string) {
  return wrapper.findAll('button').find((button) => button.text() === label)
}

beforeEach(() => {
  clearNuxtState([
    'goals',
    'goalRecords',
    'goalLinks',
    'goalsStatus',
    'goalsError',
    'tasks',
    'habits',
    'habitsCheckIns',
    'schedules',
    'goal-review-answered',
    'memos',
    'now',
  ])
  resetGoalsHydrationForTest()
  resetGoalLinksHydrationForTest()
  resetTasksHydrationForTest()
  resetHabitsHydrationForTest()
  resetSchedulesHydrationForTest()
})

afterEach(() => {
  // Watcher composable terikat scope komponen: unmount dulu sebelum state dibuang test berikutnya.
  mounted?.unmount()
  mounted = null
})

async function mountCard(): Promise<VueWrapper> {
  mounted = await mountSuspended(DailyGoalReviewCard)
  return mounted
}

describe('kartu review goal di Daily', () => {
  it('muncul untuk chapter yang sudah terlewat, dengan pertanyaan goal + chapter', async () => {
    prepare(goalWith([OVERDUE]))
    const wrapper = await mountCard()

    expect(card(wrapper).exists()).toBe(true)
    expect(card(wrapper).text()).toContain('Lari 10K')
    expect(card(wrapper).text()).toContain('Base building')
  })

  it('muncul saat chapter berakhir hari ini', async () => {
    prepare(goalWith([chapter(CHAPTER_ENDING_TODAY, 'Tapering', '2026-02-01', TODAY)]))
    const wrapper = await mountCard()

    expect(card(wrapper).exists()).toBe(true)
    expect(card(wrapper).text()).toContain('Tapering')
  })

  it('tidak muncul saat chapter masih berjalan dan bukan akhir pekan', async () => {
    prepare(goalWith([FUTURE]))
    const wrapper = await mountCard()

    expect(card(wrapper).exists()).toBe(false)
  })

  it('tidak muncul untuk goal yang sudah selesai', async () => {
    prepare(goalWith([OVERDUE], 'selesai'))
    const wrapper = await mountCard()

    expect(card(wrapper).exists()).toBe(false)
  })

  it('jawaban masuk jurnal hari itu dengan mention goal, lalu kartu ditutup', async () => {
    prepare(goalWith([OVERDUE]))
    const wrapper = await mountCard()

    await wrapper.find('textarea').setValue('Minggu ini lari 3x, tidur masih kurang')
    const save = buttonByText(wrapper, 'Simpan ke jurnal')
    expect(save).toBeDefined()
    await save?.trigger('click')

    const store = useState<MemoStore>('memos').value
    expect(store.memos).toHaveLength(1)
    expect(store.memos[0]?.date).toBe(TODAY)
    expect(store.memos[0]?.text).toContain('Minggu ini lari 3x, tidur masih kurang')
    // Token mention yang dirender jadi chip navigasi ke goal.
    expect(store.memos[0]?.text).toContain(`#[${GOAL_ID}]`)

    expect(card(wrapper).exists()).toBe(false)
  })
})
