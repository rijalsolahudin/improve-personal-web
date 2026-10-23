import { beforeEach, describe, expect, it } from 'vitest'

import { emptyGoalDraft, type Goal, type GoalDraft } from '~/utils/goals'

import { resetGoalsHydrationForTest, useGoals } from './useGoals'

const TODAY = '2026-10-23'

function fixture(): Goal {
  return {
    id: '0192f0a0-0000-7000-8000-000000000001',
    title: 'Lari 10K',
    why: 'Sehat',
    category: 'kesehatan',
    status: 'aktif',
    start: '2026-10-01',
    end: '2026-12-31',
    cover: null,
    along: [],
    chapters: [
      {
        id: '0192f0a0-0000-7000-8000-000000000003',
        title: 'Base',
        start: '2026-10-01',
        end: '2026-10-31',
        isManualDone: false,
        isClosed: false,
        items: [
          { id: 'task-1', kind: 'task', title: 'Lari 5K', meta: '', done: false, rate: null },
        ],
      },
    ],
  }
}

describe('useGoals', () => {
  beforeEach(() => {
    clearNuxtState(['goals', 'goalRecords', 'goalLinks', 'goalsStatus', 'goalsError'])
    resetGoalsHydrationForTest()
  })

  it('draft tidak valid ditolak tanpa mengubah data', () => {
    const { goals, save } = useGoals()
    const before = goals.value.length
    expect(save(emptyGoalDraft(TODAY), null)).toEqual({ error: 'titleRequired' })
    expect(goals.value).toHaveLength(before)
  })

  it('goal baru masuk paling atas; edit mengganti di tempat', () => {
    const { goals, save, findGoal } = useGoals()
    const draft: GoalDraft = { ...emptyGoalDraft(TODAY), title: 'Belajar gitar' }
    const result = save(draft, null)
    if (!('id' in result)) throw new Error('gagal simpan')
    expect(goals.value[0]?.id).toBe(result.id)

    const count = goals.value.length
    save({ ...draft, title: 'Belajar piano' }, result.id)
    expect(goals.value).toHaveLength(count)
    expect(findGoal(result.id)?.title).toBe('Belajar piano')
  })

  it('centang task, sampul, aksi chapter, hapus', () => {
    useState<Goal[]>('goals').value = [fixture()]
    const { findGoal, toggleTask, setCover, updateChapter, remove } = useGoals()
    const goal = findGoal('0192f0a0-0000-7000-8000-000000000001')
    const chapter = goal?.chapters[0]
    const item = chapter?.items[0]
    if (!goal || !chapter || !item) throw new Error('fixture tanpa task')

    toggleTask(goal.id, chapter.id, item.id)
    expect(findGoal(goal.id)?.chapters[0]?.items[0]?.done).toBe(true)

    setCover(goal.id, 'hewan/kucing')
    expect(findGoal(goal.id)?.cover).toBe('hewan/kucing')

    updateChapter(goal.id, chapter.id, (c) => ({ ...c, isClosed: true }))
    expect(findGoal(goal.id)?.chapters[0]?.isClosed).toBe(true)

    remove(goal.id)
    expect(findGoal(goal.id)).toBeUndefined()
  })
})
