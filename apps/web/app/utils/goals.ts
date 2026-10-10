// Domain Goals (PRD F13 + Home Desktop.dc.html · halaman Goals). Fungsi murni; tanggal
// pakai string ISO lokal `YYYY-MM-DD` supaya cocok dengan <input type="date">.

import { addDays, addMonths, daysBetween, isIsoDate } from './time'

export const GOAL_CATEGORIES = ['karier', 'kesehatan', 'keuangan', 'diri', 'relasi'] as const
export type GoalCategory = (typeof GOAL_CATEGORIES)[number]

/** Design hanya memakai tiga status ini; "dibatalkan" (PRD) menyusul. */
export const GOAL_STATUSES = ['aktif', 'ditunda', 'selesai'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const CHAPTER_STATUSES = [
  'belum-mulai',
  'berjalan',
  'selesai',
  'terlewat',
  'ditutup',
] as const
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number]

export type GoalItemKind = 'task' | 'habit' | 'jadwal'

export type GoalTone = 'green' | 'yellow' | 'sand' | 'red' | 'grey' | 'purple' | 'violet'

export const CHAPTER_TONE: Record<ChapterStatus, GoalTone> = {
  'belum-mulai': 'sand',
  berjalan: 'yellow',
  selesai: 'green',
  terlewat: 'red',
  ditutup: 'grey',
}

export const GOAL_STATUS_TONE: Record<GoalStatus, GoalTone> = {
  aktif: 'green',
  ditunda: 'sand',
  selesai: 'violet',
}

export const ITEM_TONE: Record<GoalItemKind, GoalTone> = {
  task: 'purple',
  habit: 'green',
  jadwal: 'yellow',
}

/** Glyph tile kategori (design), dipakai kalau goal belum punya sticker sampul. */
export const GOAL_CATEGORY_GLYPH: Record<GoalCategory, string> = {
  karier: '◎',
  kesehatan: '♥',
  keuangan: '$',
  diri: '★',
  relasi: '☺',
}

export const GOAL_TITLE_MAX = 120
export const GOAL_WHY_MAX = 500
export const GOAL_MAX_CHAPTERS = 20
/** Tombol "Perpanjang" di kartu review chapter terlewat. */
export const CHAPTER_EXTEND_DAYS = 14

/**
 * Item yang ditautkan ke goal. Fase 1 masih salinan ringkas; begitu task/habit/jadwal
 * punya store sendiri, ini jadi referensi id + progres dihitung dari sumbernya.
 */
export interface GoalItem {
  id: string
  kind: GoalItemKind
  title: string
  meta: string
  /** Task: selesai/belum. */
  done: boolean
  /** Habit/jadwal: % target tercapai (0–100). */
  rate: number
}

export interface Chapter {
  id: string
  title: string
  start: string
  end: string
  /** Ditandai selesai manual → progres 100%. */
  isManualDone: boolean
  isClosed: boolean
  items: GoalItem[]
}

export interface Goal {
  id: string
  title: string
  why: string
  category: GoalCategory
  status: GoalStatus
  start: string
  end: string
  /** Id sticker sampul (F14), opsional. */
  cover: string | null
  /** "Sepanjang goal": item yang ditaut langsung ke goal. */
  along: GoalItem[]
  chapters: Chapter[]
}

// ---- Progres & status ----------------------------------------------------------------

export function average(values: readonly number[]): number {
  return values.length ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : 0
}

export function itemProgress(item: GoalItem): number {
  return item.kind === 'task' ? (item.done ? 100 : 0) : item.rate
}

export function chapterProgress(chapter: Chapter): number {
  return chapter.isManualDone ? 100 : average(chapter.items.map(itemProgress))
}

export function chapterStatus(chapter: Chapter, today: string): ChapterStatus {
  if (chapter.isClosed) return 'ditutup'
  if (today < chapter.start) return 'belum-mulai'
  if (today > chapter.end) return chapterProgress(chapter) >= 100 ? 'selesai' : 'terlewat'
  return chapter.isManualDone ? 'selesai' : 'berjalan'
}

/** Ada chapter → rata-rata chapter (+ Sepanjang goal kalau ada isinya), bobot sama. */
export function goalProgress(goal: Goal): number {
  const along = goal.along.map(itemProgress)
  if (!goal.chapters.length) return average(along)
  return average([...goal.chapters.map(chapterProgress), ...(along.length ? [average(along)] : [])])
}

export function needsReview(goal: Goal, today: string): boolean {
  return goal.chapters.some((chapter) => chapterStatus(chapter, today) === 'terlewat')
}

/** Chapter yang dibuka default di detail: yang terlewat atau sedang berjalan. */
export function focusChapterIndex(goal: Goal, today: string): number {
  return goal.chapters.findIndex((chapter) => {
    const status = chapterStatus(chapter, today)
    return status === 'terlewat' || status === 'berjalan'
  })
}

// ---- Aksi review chapter -------------------------------------------------------------

export function extendChapter(chapter: Chapter, today: string): Chapter {
  return { ...chapter, end: addDays(today, CHAPTER_EXTEND_DAYS) }
}

/** Geser periode: panjang tetap, mulai hari ini. */
export function shiftChapter(chapter: Chapter, today: string): Chapter {
  return { ...chapter, start: today, end: addDays(today, daysBetween(chapter.start, chapter.end)) }
}

export function closeChapter(chapter: Chapter): Chapter {
  return { ...chapter, isClosed: true }
}

export function toggleChapterDone(chapter: Chapter): Chapter {
  return { ...chapter, isManualDone: !chapter.isManualDone }
}

export function toggleTaskItem(items: readonly GoalItem[], itemId: string): GoalItem[] {
  return items.map((item) =>
    item.id === itemId && item.kind === 'task' ? { ...item, done: !item.done } : item,
  )
}

// ---- Form ----------------------------------------------------------------------------

export interface ChapterDraft {
  /** Kunci baris form (stabil saat reorder). */
  key: string
  /** Chapter asal saat edit; `null` = chapter baru. */
  sourceId: string | null
  title: string
  start: string
  end: string
}

export interface GoalDraft {
  title: string
  why: string
  category: GoalCategory
  status: GoalStatus
  start: string
  end: string
  chapters: ChapterDraft[]
}

export type GoalDraftError =
  | 'titleRequired'
  | 'titleTooLong'
  | 'whyTooLong'
  | 'dateOrder'
  | 'tooManyChapters'
  | 'chapterTitle'
  | 'chapterRange'

export function isChapterDraftOutOfRange(chapter: ChapterDraft, draft: GoalDraft): boolean {
  return (
    !isIsoDate(chapter.start) ||
    !isIsoDate(chapter.end) ||
    chapter.start < draft.start ||
    chapter.end > draft.end ||
    chapter.end < chapter.start
  )
}

export function validateGoalDraft(draft: GoalDraft): GoalDraftError | null {
  const title = draft.title.trim()
  if (!title) return 'titleRequired'
  if (title.length > GOAL_TITLE_MAX) return 'titleTooLong'
  if (draft.why.trim().length > GOAL_WHY_MAX) return 'whyTooLong'
  if (!isIsoDate(draft.start) || !isIsoDate(draft.end) || draft.end < draft.start) {
    return 'dateOrder'
  }
  if (draft.chapters.length > GOAL_MAX_CHAPTERS) return 'tooManyChapters'
  if (draft.chapters.some((chapter) => !chapter.title.trim())) return 'chapterTitle'
  if (draft.chapters.some((chapter) => isChapterDraftOutOfRange(chapter, draft))) {
    return 'chapterRange'
  }
  return null
}

export function draftFromGoal(goal: Goal): GoalDraft {
  return {
    title: goal.title,
    why: goal.why,
    category: goal.category,
    status: goal.status,
    start: goal.start,
    end: goal.end,
    chapters: goal.chapters.map((chapter) => ({
      key: chapter.id,
      sourceId: chapter.id,
      title: chapter.title,
      start: chapter.start,
      end: chapter.end,
    })),
  }
}

export function emptyGoalDraft(today: string): GoalDraft {
  return {
    title: '',
    why: '',
    category: 'karier',
    status: 'aktif',
    start: today,
    end: addMonths(today, 3),
    chapters: [],
  }
}

/** Baris chapter baru: mulai dari akhir chapter terakhir (atau awal goal). */
export function nextChapterDraft(draft: GoalDraft, key: string): ChapterDraft {
  const last = draft.chapters.at(-1)
  const start = last ? last.end : draft.start
  return {
    key,
    sourceId: null,
    title: '',
    start: start > draft.end ? draft.end : start,
    end: draft.end,
  }
}

/**
 * Terapkan draft (sudah valid) ke goal. Edit: chapter lama dipertahankan isinya;
 * item chapter yang dihapus pindah ke "Sepanjang goal" (PRD: default hapus chapter).
 */
export function applyGoalDraft(draft: GoalDraft, base: Goal | null, newId: () => string): Goal {
  const previous = new Map((base?.chapters ?? []).map((chapter) => [chapter.id, chapter]))
  const kept = new Set(draft.chapters.map((chapter) => chapter.sourceId))
  const orphaned = (base?.chapters ?? [])
    .filter((chapter) => !kept.has(chapter.id))
    .flatMap((chapter) => chapter.items)

  return {
    id: base?.id ?? newId(),
    cover: base?.cover ?? null,
    title: draft.title.trim(),
    why: draft.why.trim(),
    category: draft.category,
    status: draft.status,
    start: draft.start,
    end: draft.end,
    along: [...(base?.along ?? []), ...orphaned],
    chapters: draft.chapters.map((chapter) => {
      const old = chapter.sourceId ? previous.get(chapter.sourceId) : undefined
      return {
        id: old?.id ?? newId(),
        isManualDone: old?.isManualDone ?? false,
        isClosed: old?.isClosed ?? false,
        items: old?.items ?? [],
        title: chapter.title.trim(),
        start: chapter.start,
        end: chapter.end,
      }
    }),
  }
}
