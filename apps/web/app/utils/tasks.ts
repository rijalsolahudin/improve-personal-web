// To-do (PRD F2) + kuadran Eisenhower (F3), mengikuti Home Desktop.dc.html `todoVals`.
// Fungsi murni; waktu sekarang selalu di-inject.

import { isTime } from './schedule'
import { isIsoDate, toIsoDate } from './time'

export const PRIORITIES = ['urgent', 'medium', 'low'] as const
export type Priority = (typeof PRIORITIES)[number]

export const QUADRANTS = ['do', 'plan', 'delegate', 'drop'] as const
export type Quadrant = (typeof QUADRANTS)[number]

/** Warna kuadran design: latar, solid, teks, glyph. */
export const QUADRANT_STYLE: Record<
  Quadrant,
  { bg: string; solid: string; text: string; glyph: string }
> = {
  do: { bg: '#FFE1DA', solid: '#E2445C', text: '#B0283E', glyph: '!' },
  plan: { bg: '#DDE7FB', solid: '#0A55E6', text: '#0A3FA8', glyph: '30' },
  delegate: { bg: '#FFF0C8', solid: '#E6A800', text: '#8A5A00', glyph: '→' },
  drop: { bg: '#EDE7DD', solid: '#9A8B78', text: '#5E5040', glyph: '×' },
}

export const TASK_TITLE_MAX = 200
export const TASK_NOTE_MAX = 1000
/** Tambah cepat dengan tanggal → deadline akhir hari itu (design: 23:59). */
export const END_OF_DAY = '23:59'

export interface Task {
  id: string
  title: string
  note: string
  priority: Priority
  /** Epoch ms, `null` = tanpa deadline. */
  deadline: number | null
  done: boolean
  /** Jadwal tertaut (F1), opsional. */
  scheduleId: string | null
  /** Kuadran Eisenhower (F3), `null` = belum dipilah. */
  quadrant: Quadrant | null
}

// ---- Filter & urutan -----------------------------------------------------------------

export const TASK_FILTERS = ['semua', 'hari', 'mendatang', 'terlambat', 'selesai'] as const
export type TaskFilter = (typeof TASK_FILTERS)[number]

export const TASK_SORTS = ['deadline', 'prioritas'] as const
export type TaskSort = (typeof TASK_SORTS)[number]

export function isOverdue(task: Task, now: number): boolean {
  return !task.done && task.deadline !== null && task.deadline < now
}

export function matchesFilter(task: Task, filter: TaskFilter, now: number): boolean {
  switch (filter) {
    case 'semua':
      return !task.done
    case 'hari':
      return (
        !task.done &&
        task.deadline !== null &&
        toIsoDate(new Date(task.deadline)) === toIsoDate(new Date(now))
      )
    case 'mendatang':
      return !task.done && task.deadline !== null && task.deadline > now
    case 'terlambat':
      return isOverdue(task, now)
    case 'selesai':
      return task.done
  }
}

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, medium: 1, low: 2 }
const NO_DEADLINE = Number.POSITIVE_INFINITY
const byDeadline = (a: Task, b: Task): number =>
  (a.deadline ?? NO_DEADLINE) - (b.deadline ?? NO_DEADLINE) || 0

/** Tanpa deadline selalu di bawah; prioritas seri → deadline terdekat dulu. */
export function sortTasks(tasks: readonly Task[], sort: TaskSort): Task[] {
  return [...tasks].sort((a, b) =>
    sort === 'prioritas'
      ? PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || byDeadline(a, b)
      : byDeadline(a, b),
  )
}

export function countByFilter(tasks: readonly Task[], now: number): Record<TaskFilter, number> {
  const counts = {} as Record<TaskFilter, number>
  for (const filter of TASK_FILTERS) {
    counts[filter] = tasks.filter((task) => matchesFilter(task, filter, now)).length
  }
  return counts
}

// ---- Form ----------------------------------------------------------------------------

export interface TaskDraft {
  title: string
  note: string
  priority: Priority
  hasDeadline: boolean
  date: string
  time: string
  scheduleId: string | null
}

export type TaskDraftError = 'titleRequired' | 'titleTooLong' | 'noteTooLong' | 'deadline'

export function deadlineFrom(date: string, time: string): number {
  return new Date(`${date}T${time}:00`).getTime()
}

export function validateTaskDraft(draft: TaskDraft): TaskDraftError | null {
  const title = draft.title.trim()
  if (!title) return 'titleRequired'
  if (title.length > TASK_TITLE_MAX) return 'titleTooLong'
  if (draft.note.trim().length > TASK_NOTE_MAX) return 'noteTooLong'
  if (draft.hasDeadline && (!isIsoDate(draft.date) || !isTime(draft.time))) return 'deadline'
  return null
}

const DEFAULT_TIME = '17:00'

export function emptyTaskDraft(today: string): TaskDraft {
  return {
    title: '',
    note: '',
    priority: 'medium',
    hasDeadline: true,
    date: today,
    time: DEFAULT_TIME,
    scheduleId: null,
  }
}

const pad = (value: number): string => String(value).padStart(2, '0')

export function draftFromTask(task: Task, today: string): TaskDraft {
  const date = task.deadline === null ? null : new Date(task.deadline)
  return {
    title: task.title,
    note: task.note,
    priority: task.priority,
    hasDeadline: date !== null,
    date: date ? toIsoDate(date) : today,
    time: date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : DEFAULT_TIME,
    scheduleId: task.scheduleId,
  }
}

/** Terapkan draft (sudah valid) ke task baru/lama. Status selesai & kuadran dipertahankan. */
export function applyTaskDraft(draft: TaskDraft, base: Task | null, id: string): Task {
  return {
    id: base?.id ?? id,
    done: base?.done ?? false,
    quadrant: base?.quadrant ?? null,
    title: draft.title.trim(),
    note: draft.note.trim(),
    priority: draft.priority,
    deadline: draft.hasDeadline ? deadlineFrom(draft.date, draft.time) : null,
    scheduleId: draft.scheduleId,
  }
}

/** Task dari tambah cepat; judul kosong → null. */
export function quickTask(
  title: string,
  priority: Priority,
  deadline: number | null,
  id: string,
): Task | null {
  const clean = title.trim().slice(0, TASK_TITLE_MAX)
  if (!clean) return null
  return {
    id,
    title: clean,
    note: '',
    priority,
    deadline,
    done: false,
    scheduleId: null,
    quadrant: null,
  }
}

// ---- Eisenhower ----------------------------------------------------------------------

/** Isi kuadran; yang sudah selesai di bawah (design). */
export function tasksInQuadrant(tasks: readonly Task[], quadrant: Quadrant): Task[] {
  return tasks
    .filter((task) => task.quadrant === quadrant)
    .sort((a, b) => Number(a.done) - Number(b.done))
}

/** "Belum masuk matrix": task aktif tanpa kuadran. */
export function unsortedTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter((task) => !task.quadrant && !task.done)
}

/** "Bersihkan yang selesai": task selesai dikeluarkan dari matrix (task-nya tetap ada). */
export function clearDoneFromMatrix(tasks: readonly Task[]): Task[] {
  return tasks.map((task) => (task.done && task.quadrant ? { ...task, quadrant: null } : task))
}
