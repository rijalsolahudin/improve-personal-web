import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetGoalLinksHydrationForTest } from '~/composables/useGoalLinks'
import { resetGoalsHydrationForTest } from '~/composables/useGoals'
import { resetHabitsHydrationForTest } from '~/composables/useHabits'
import { resetSchedulesHydrationForTest } from '~/composables/useSchedules'
import { resetTasksHydrationForTest } from '~/composables/useTasks'
import type { Goal } from '~/utils/goals'

import MemoGoalMention from './MemoGoalMention.vue'

/**
 * Chip `#goal` di jurnal (T18, PRD F13 "Integrasi Journal").
 *
 * AC: mention goal tampil sebagai chip yang bisa diklik ke detail goal; kalau goal-nya sudah
 * dihapus, chip tetap tampil (tidak error, tidak menavigasi ke halaman kosong).
 */

const GOAL_ID = '0192f0a0-0000-7000-8000-000000000001'
const DELETED_ID = '0192f0a0-0000-7000-8000-0000000000ff'

const GOAL: Goal = {
  id: GOAL_ID,
  title: 'Lari 10K',
  why: 'Sehat',
  category: 'kesehatan',
  status: 'aktif',
  start: '2026-01-05',
  end: '2026-03-31',
  cover: null,
  along: [],
  chapters: [],
}

let mounted: VueWrapper | null = null

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
  ])
  resetGoalsHydrationForTest()
  resetGoalLinksHydrationForTest()
  resetTasksHydrationForTest()
  resetHabitsHydrationForTest()
  resetSchedulesHydrationForTest()
  useState<Goal[]>('goals').value = [GOAL]
  useState<'idle' | 'loading' | 'ready' | 'error'>('goalsStatus').value = 'ready'
})

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('chip goal di jurnal', () => {
  it('goal yang masih ada tampil sebagai chip yang bisa dibuka', async () => {
    mounted = await mountSuspended(MemoGoalMention, { props: { goalId: GOAL_ID } })

    const chip = mounted.find('button.mention')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toBe('#Lari 10K')
    expect(mounted.find('.deleted').exists()).toBe(false)
  })

  it('goal yang sudah dihapus tetap aman: label redup tanpa tombol navigasi', async () => {
    mounted = await mountSuspended(MemoGoalMention, { props: { goalId: DELETED_ID } })

    expect(mounted.find('button').exists()).toBe(false)
    const fallback = mounted.find('span.mention.deleted')
    expect(fallback.exists()).toBe(true)
    expect(fallback.text()).toBe('#goal dihapus')
  })
})
