// Domain Goals (PRD F13 + Home Desktop.dc.html · halaman Goals). Fungsi murni; tanggal
// pakai string ISO lokal `YYYY-MM-DD` supaya cocok dengan <input type="date">.

import {
  chapterProgressPercent,
  chapterStatus as coreChapterStatus,
  clampPercent,
  mainGoalProgressPercent,
  taskProgressPercent,
  type ChapterStatus as CoreChapterStatus,
  type ProgressSlice,
} from '@improve-personal/core'

import { addDays, addMonths, daysBetween, fromIsoDate, isIsoDate } from './time'

export const GOAL_CATEGORIES = ['karier', 'kesehatan', 'keuangan', 'diri', 'relasi'] as const
export type GoalCategory = (typeof GOAL_CATEGORIES)[number]

export const GOAL_STATUSES = ['aktif', 'ditunda', 'selesai', 'dibatalkan'] as const
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
  dibatalkan: 'grey',
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
  /**
   * Habit/jadwal: % target tercapai (0–100).
   *
   * `null` = item ada tapi belum punya hari/kejadian yang bisa dinilai; tipe itu tidak ikut penyebut
   * progress (aturan `ProgressSlice` core), bukan dianggap 0%.
   */
  rate: number | null
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
  /** Timestamp record core; dipertahankan saat menimpa supaya `createdAt` tidak berubah. */
  createdAt?: number
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
  createdAt?: number
}

// ---- Progres & status ----------------------------------------------------------------

/** Rata-rata dengan pembulatan 1 desimal yang sama dengan core (`clampPercent`). */
function average(values: readonly number[]): number {
  if (!values.length) return 0
  return clampPercent(values.reduce((sum, v) => sum + v, 0) / values.length)
}

export function itemProgress(item: GoalItem): number | null {
  return item.kind === 'task' ? (item.done ? 100 : 0) : item.rate
}

/**
 * Progress per TIPE item, bukan per item - satu-satunya formula yang dipakai core & mobile
 * (PRD F13). Item sejenis dirata-ratakan dulu, lalu tipe yang punya data dirata-ratakan.
 *
 * Fungsi ini sengaja memakai primitif core (`taskProgressPercent`, `chapterProgressPercent`) supaya
 * web tidak punya definisi progress sendiri. `goalProgressReport` memakai aturan yang sama untuk data
 * core; halaman yang membaca `Goal` presentasi tetap mendapat angka identik.
 */
export function itemSlices(items: readonly GoalItem[]): ProgressSlice[] {
  const slices: ProgressSlice[] = []

  const tasks = items.filter((item) => item.kind === 'task')
  if (tasks.length) {
    slices.push({
      itemType: 'todo',
      percent: taskProgressPercent(tasks.map((item) => ({ isDone: item.done }))),
    })
  }

  for (const [itemType, kind] of [
    ['habit', 'habit'],
    ['schedule', 'jadwal'],
  ] as const) {
    const entries = items.filter((item) => item.kind === kind)
    if (!entries.length) continue
    const rates = entries.map((item) => item.rate).filter((rate): rate is number => rate !== null)
    slices.push({ itemType, percent: rates.length ? average(rates) : null })
  }

  return slices
}

export function chapterProgress(chapter: Chapter): number {
  return chapterProgressPercent({ isCompleted: chapter.isManualDone }, itemSlices(chapter.items))
}

/** Progress rata-rata per tipe untuk daftar item (dipakai "Sepanjang goal"). */
export function itemsProgress(items: readonly GoalItem[]): number {
  return chapterProgressPercent({ isCompleted: false }, itemSlices(items))
}

/** Status core (`snake_case`) → kosakata UI (`kebab-case`). */
const STATUS_FROM_CORE: Record<CoreChapterStatus, ChapterStatus> = {
  belum_mulai: 'belum-mulai',
  berjalan: 'berjalan',
  selesai: 'selesai',
  terlewat: 'terlewat',
  ditutup: 'ditutup',
}

export function chapterStatus(chapter: Chapter, today: string): ChapterStatus {
  return STATUS_FROM_CORE[
    coreChapterStatus(
      {
        startDate: chapter.start,
        endDate: chapter.end,
        isCompleted: chapter.isManualDone,
        isClosed: chapter.isClosed,
      },
      today,
      chapterProgress(chapter),
    )
  ]
}

/** Ada chapter → rata-rata chapter (+ Sepanjang goal kalau ada isinya), bobot sama. */
export function goalProgress(goal: Goal): number {
  const along = goal.along.length ? itemsProgress(goal.along) : null
  return mainGoalProgressPercent(goal.chapters.map(chapterProgress), along)
}

export function needsReview(goal: Goal, today: string): boolean {
  return goal.chapters.some((chapter) => chapterStatus(chapter, today) === 'terlewat')
}

/** Sabtu/Minggu - pemicu review berkala untuk goal aktif (PRD F13). */
export function isWeekend(today: string): boolean {
  const day = fromIsoDate(today).getDay()
  return day === 0 || day === 6
}

/** Satu kartu review Daily: chapter terlewat/berakhir, atau goal aktif di akhir pekan. */
export type GoalReviewTarget = {
  readonly key: string
  readonly goalId: string
  readonly goalTitle: string
  /** Akhir periode main goal: batas aksi perpanjang/geser. */
  readonly goalEnd: string
  readonly chapterId: string | null
  readonly chapterTitle: string | null
  readonly status: ChapterStatus
  /** `true` = chapter sudah lewat tanggal & progress < 100% (opsi perpanjang/geser/tutup). */
  readonly isOverdue: boolean
}

/**
 * Kartu review yang harus muncul di Daily (PRD F13):
 * - chapter berakhir hari ini, atau sudah `terlewat`;
 * - tiap akhir pekan, satu review per goal aktif yang belum punya kartu.
 *
 * Tidak ada state "sudah dijawab" di sini supaya fungsi tetap murni; komponen menyaring yang sudah
 * dijawab di sesi itu.
 */
export function goalReviewTargets(goals: readonly Goal[], today: string): GoalReviewTarget[] {
  const targets: GoalReviewTarget[] = []
  const seenGoals = new Set<string>()

  for (const goal of goals) {
    if (goal.status !== 'aktif' && goal.status !== 'ditunda') continue

    for (const chapter of goal.chapters) {
      const status = chapterStatus(chapter, today)
      const endedToday = chapter.end === today
      if (status !== 'terlewat' && !endedToday) continue

      targets.push({
        key: `${goal.id}:${chapter.id}`,
        goalId: goal.id,
        goalTitle: goal.title,
        goalEnd: goal.end,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        status,
        isOverdue: status === 'terlewat',
      })
      seenGoals.add(goal.id)
    }
  }

  if (!isWeekend(today)) return targets

  for (const goal of goals) {
    if (goal.status !== 'aktif' || seenGoals.has(goal.id)) continue
    const focus = goal.chapters[focusChapterIndex(goal, today)]
    targets.push({
      key: `${goal.id}:weekend`,
      goalId: goal.id,
      goalTitle: goal.title,
      goalEnd: goal.end,
      chapterId: focus?.id ?? null,
      chapterTitle: focus?.title ?? null,
      status: focus ? chapterStatus(focus, today) : 'berjalan',
      isOverdue: false,
    })
  }

  return targets
}

/** Chapter yang dibuka default di detail: yang terlewat atau sedang berjalan. */
export function focusChapterIndex(goal: Goal, today: string): number {
  return goal.chapters.findIndex((chapter) => {
    const status = chapterStatus(chapter, today)
    return status === 'terlewat' || status === 'berjalan'
  })
}

// ---- Aksi review chapter -------------------------------------------------------------

/** `goalEnd` opsional = batas main goal; chapter tidak boleh melewatinya (PRD F13). */
export function extendChapter(chapter: Chapter, today: string, goalEnd?: string): Chapter {
  const wanted = addDays(today, CHAPTER_EXTEND_DAYS)
  const end = goalEnd !== undefined && wanted > goalEnd ? goalEnd : wanted
  return { ...chapter, end: end < chapter.start ? chapter.start : end }
}

/** Geser periode: panjang tetap kalau muat, mulai hari ini, tidak melewati akhir main goal. */
export function shiftChapter(chapter: Chapter, today: string, goalEnd?: string): Chapter {
  const wanted = addDays(today, daysBetween(chapter.start, chapter.end))
  const end = goalEnd !== undefined && wanted > goalEnd ? goalEnd : wanted
  return { ...chapter, start: today, end: end < today ? today : end }
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
    ...(base?.createdAt === undefined ? {} : { createdAt: base.createdAt }),
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
        ...(old?.createdAt === undefined ? {} : { createdAt: old.createdAt }),
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
