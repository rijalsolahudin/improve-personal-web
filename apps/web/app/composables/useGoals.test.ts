import { beforeEach, describe, expect, it } from 'vitest'

import { emptyGoalDraft, type GoalDraft } from '~/utils/goals'

import { useGoals } from './useGoals'

describe('useGoals', () => {
  beforeEach(() => {
    clearNuxtState(['goals'])
  })

  it('draft tidak valid ditolak tanpa mengubah data', () => {
    const { goals, save, today } = useGoals()
    const before = goals.value.length
    expect(save(emptyGoalDraft(today.value), null)).toEqual({ error: 'titleRequired' })
    expect(goals.value).toHaveLength(before)
  })

  it('goal baru masuk paling atas; edit mengganti di tempat', () => {
    const { goals, save, findGoal, today } = useGoals()
    const draft: GoalDraft = { ...emptyGoalDraft(today.value), title: 'Belajar gitar' }
    const result = save(draft, null)
    if (!('id' in result)) throw new Error('gagal simpan')
    expect(goals.value[0]?.id).toBe(result.id)

    const count = goals.value.length
    save({ ...draft, title: 'Belajar piano' }, result.id)
    expect(goals.value).toHaveLength(count)
    expect(findGoal(result.id)?.title).toBe('Belajar piano')
  })

  it('centang task, sampul, aksi chapter, hapus', () => {
    const { goals, findGoal, toggleTask, setCover, updateChapter, remove } = useGoals()
    const goal = goals.value.find((g) =>
      g.chapters.some((c) => c.items.some((i) => i.kind === 'task')),
    )
    const chapter = goal?.chapters.find((c) => c.items.some((i) => i.kind === 'task'))
    const item = chapter?.items.find((i) => i.kind === 'task')
    if (!goal || !chapter || !item) throw new Error('mock tanpa task')

    toggleTask(goal.id, chapter.id, item.id)
    const toggled = findGoal(goal.id)
      ?.chapters.find((c) => c.id === chapter.id)
      ?.items.find((i) => i.id === item.id)
    expect(toggled?.done).toBe(!item.done)

    setCover(goal.id, 'hewan/kucing')
    expect(findGoal(goal.id)?.cover).toBe('hewan/kucing')

    updateChapter(goal.id, chapter.id, (c) => ({ ...c, isClosed: true }))
    expect(findGoal(goal.id)?.chapters.find((c) => c.id === chapter.id)?.isClosed).toBe(true)

    remove(goal.id)
    expect(findGoal(goal.id)).toBeUndefined()
  })
})
