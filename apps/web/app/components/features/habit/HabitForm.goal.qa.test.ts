import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetHabitsHydrationForTest } from '~/composables/useHabits'
import type { Goal } from '~/utils/goals'

import HabitForm from './HabitForm.vue'

/**
 * Pilihan "Untuk goal" di form item (PRD F13, AC T18).
 *
 * AC: dropdown berisi "Sepanjang goal" + chapter goal itu. Form habit adalah satu-satunya form item
 * yang sudah punya pemilih goal, jadi di sinilah kontraknya diuji.
 */

const GOAL: Goal = {
  id: '0192f0a0-0000-7000-8000-000000000001',
  title: 'Lari 10K',
  why: 'Sehat',
  category: 'kesehatan',
  status: 'aktif',
  start: '2026-01-05',
  end: '2026-03-31',
  cover: null,
  along: [],
  chapters: [
    {
      id: '0192f0a0-0000-7000-8000-000000000003',
      title: 'Base building',
      start: '2026-01-05',
      end: '2026-01-31',
      isManualDone: false,
      isClosed: false,
      items: [],
    },
  ],
}

let mounted: VueWrapper | null = null

function optionLabels(wrapper: VueWrapper): string[] {
  return wrapper.findAll('button.chip').map((chip) => chip.text())
}

beforeEach(() => {
  clearNuxtState(['habits', 'habitsCheckIns', 'habitsStatus', 'habitsError', 'localData', 'goals'])
  resetHabitsHydrationForTest()
  useState<Goal[]>('goals').value = [{ ...GOAL }]
})

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('pemilih "Untuk goal" di form habit', () => {
  it('menawarkan "Sepanjang goal" (main goal) dan chapter goal', async () => {
    mounted = await mountSuspended(HabitForm, { props: { habitId: null } })

    const labels = optionLabels(mounted)
    expect(labels).toContain('Sepanjang goal')
    expect(labels).toContain('Base building')
  })

  it('tidak menawarkan goal non-aktif', async () => {
    useState<Goal[]>('goals').value = [{ ...GOAL, status: 'selesai' }]
    mounted = await mountSuspended(HabitForm, { props: { habitId: null } })

    expect(optionLabels(mounted)).not.toContain('Lari 10K')
  })
})
