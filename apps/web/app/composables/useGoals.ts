import {
  applyGoalDraft,
  toggleTaskItem,
  validateGoalDraft,
  type Chapter,
  type Goal,
  type GoalDraft,
  type GoalDraftError,
} from '~/utils/goals'
import { toIsoDate } from '~/utils/time'

import { createGoalsMock } from './goals/mock'

/**
 * Data Goals (PRD F13). Fase 1: in-memory dari `createGoalsMock`, sama seperti Home.
 * Begitu packages/core siap, isi `useState` ini diganti repository lokal (IndexedDB + sync).
 */
export function useGoals() {
  const now = useNow()
  const today = computed(() => toIsoDate(new Date(now.value)))
  const goals = useState<Goal[]>('goals', () => createGoalsMock(toIsoDate(new Date())))

  function findGoal(id: string | null | undefined): Goal | undefined {
    return id ? goals.value.find((goal) => goal.id === id) : undefined
  }

  function update(id: string, change: (goal: Goal) => Goal): void {
    goals.value = goals.value.map((goal) => (goal.id === id ? change(goal) : goal))
  }

  /** Simpan draft form. Mengembalikan id goal, atau kode error validasi. */
  function save(
    draft: GoalDraft,
    editId: string | null,
  ): { id: string } | { error: GoalDraftError } {
    const error = validateGoalDraft(draft)
    if (error) return { error }
    const base = findGoal(editId) ?? null
    const saved = applyGoalDraft(draft, base, () => crypto.randomUUID())
    goals.value = base
      ? goals.value.map((goal) => (goal.id === saved.id ? saved : goal))
      : [saved, ...goals.value]
    return { id: saved.id }
  }

  /** Hapus goal; item tertaut tetap ada di fitur asalnya (PRD: tautan dilepas). */
  function remove(id: string): void {
    goals.value = goals.value.filter((goal) => goal.id !== id)
  }

  function setCover(id: string, cover: string | null): void {
    update(id, (goal) => ({ ...goal, cover }))
  }

  function updateChapter(goalId: string, chapterId: string, change: (c: Chapter) => Chapter): void {
    update(goalId, (goal) => ({
      ...goal,
      chapters: goal.chapters.map((chapter) =>
        chapter.id === chapterId ? change(chapter) : chapter,
      ),
    }))
  }

  /** Centang task di chapter tertentu, atau di "Sepanjang goal" kalau `chapterId` null. */
  function toggleTask(goalId: string, chapterId: string | null, itemId: string): void {
    if (chapterId) {
      updateChapter(goalId, chapterId, (chapter) => ({
        ...chapter,
        items: toggleTaskItem(chapter.items, itemId),
      }))
    } else {
      update(goalId, (goal) => ({ ...goal, along: toggleTaskItem(goal.along, itemId) }))
    }
  }

  return {
    // computed (bukan `readonly`) supaya tipe tetap `Goal` untuk fungsi murni di utils/goals.
    goals: computed(() => goals.value),
    today,
    findGoal,
    save,
    remove,
    setCover,
    updateChapter,
    toggleTask,
  }
}
