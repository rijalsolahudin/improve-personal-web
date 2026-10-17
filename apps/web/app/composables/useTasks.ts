import {
  applyTaskDraft,
  clearDoneFromMatrix,
  quickTask,
  validateTaskDraft,
  type Priority,
  type Quadrant,
  type Task,
  type TaskDraft,
  type TaskDraftError,
} from '~/utils/tasks'

import { createTasksMock } from './tasks/mock'

/**
 * Data task (PRD F2) untuk To-do, Eisenhower, Kalender, dan Home. Fase 1: in-memory dari
 * mock, sama seperti fitur lain, sampai packages/core siap.
 */
export function useTasks() {
  const tasks = useState<Task[]>('tasks', () => createTasksMock(Date.now()))

  function findTask(id: string | null | undefined): Task | undefined {
    return id ? tasks.value.find((task) => task.id === id) : undefined
  }

  function update(id: string, change: Partial<Omit<Task, 'id'>>): void {
    tasks.value = tasks.value.map((task) => (task.id === id ? { ...task, ...change } : task))
  }

  function toggle(id: string): void {
    const task = findTask(id)
    if (task) update(id, { done: !task.done })
  }

  /** Tambah cepat; id task baru, atau `null` kalau judul kosong. */
  function add(title: string, priority: Priority, deadline: number | null): string | null {
    const task = quickTask(title, priority, deadline, crypto.randomUUID())
    if (!task) return null
    tasks.value = [...tasks.value, task]
    return task.id
  }

  function save(
    draft: TaskDraft,
    editId: string | null,
  ): { id: string } | { error: TaskDraftError } {
    const error = validateTaskDraft(draft)
    if (error) return { error }
    const base = findTask(editId) ?? null
    const saved = applyTaskDraft(draft, base, crypto.randomUUID())
    tasks.value = base
      ? tasks.value.map((task) => (task.id === saved.id ? saved : task))
      : [...tasks.value, saved]
    return { id: saved.id }
  }

  function remove(id: string): void {
    tasks.value = tasks.value.filter((task) => task.id !== id)
  }

  function setQuadrant(id: string, quadrant: Quadrant | null): void {
    update(id, { quadrant })
  }

  function clearDoneQuadrants(): void {
    tasks.value = clearDoneFromMatrix(tasks.value)
  }

  return {
    tasks: computed(() => tasks.value),
    findTask,
    toggle,
    add,
    save,
    remove,
    setQuadrant,
    clearDoneQuadrants,
  }
}
