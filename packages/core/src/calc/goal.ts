import { LINKABLE_ITEM_TYPES, type LinkableItemType } from '../domain/enums.ts'
import {
  chapterProgressPercent,
  chapterStatus,
  clampPercent,
  mainGoalProgressPercent,
  type ChapterStatus,
  type Goal,
  type GoalChapter,
  type GoalLink,
  type ProgressSlice,
} from '../domain/entities/goal.ts'
import { isDayTargetMet, isScheduledDay } from '../domain/entities/habit.ts'
import type { Habit, HabitCheckin } from '../domain/entities/habit.ts'
import { addLocalDays, diffLocalDays } from '../domain/entities/primitives.ts'
import type { ScheduleOccurrence } from '../domain/entities/schedule.ts'
import type { Todo } from '../domain/entities/todo.ts'
import { weekdayOfLocalDate } from '../recurrence/calendar.ts'

/**
 * Agregasi progress Goals (PRD F13, AC T17) - dari item MENTAH ke persen.
 *
 * Lapisan `domain/entities/goal.ts` hanya tahu cara merata-ratakan `ProgressSlice`; modul ini yang
 * mengubah data nyata jadi slice:
 *
 * - **Task:** selesai / total item task yang ditautkan.
 * - **Habit:** % hari target tercapai selama periode, sampai hari ini. Hari yang bukan jadwal habit
 *   tidak masuk penyebut (aturan yang sama dengan streak F7), dan hari sebelum habit dibuat tidak
 *   dihitung "terlewat".
 * - **Jadwal:** % kejadian bertanda selesai/hadir dari kejadian yang SEHARUSNYA terjadi di periode,
 *   sampai hari ini.
 *
 * Semua fungsi murni: "hari ini" dan daftar kejadian yang diharapkan di-inject pemanggil. Ekspansi
 * recurrence tetap milik `recurrence/` supaya modul ini tidak perlu tz dan bisa diuji tanpa jam.
 *
 * Yang TIDAK dilakukan di sini (sengaja): item tanpa tautan tidak pernah ikut dihitung, tautan yatim
 * dilewati (bukan dianggap 100%), dan item yang sama tidak bisa dobel karena `goal_link` sudah unik
 * per item (`checkGoalBundle`).
 */

/** Rentang tanggal lokal `YYYY-MM-DD` (periode chapter, atau rentang main goal untuk Sepanjang Goal). */
export type GoalProgressPeriod = {
  readonly startDate: string
  readonly endDate: string
}

/** Habit + tanggal lokal pembuatannya (opsional; dipakai agar hari sebelum habit ada tidak dihitung). */
export type GoalHabitSource = {
  readonly habit: Habit
  /** Tanggal lokal habit dibuat. `undefined` = tidak dibatasi (data lama/import). */
  readonly createdLocalDate?: string
}

/**
 * Jadwal + daftar waktu kejadian yang diharapkan di periode (epoch ms).
 *
 * Pemanggil mendapatkannya dari engine recurrence (`expandOccurrenceTimes`/`expandWithExceptions`)
 * untuk rentang `[periode mulai, min(periode selesai, hari ini)]`. Core tidak mengekspansi sendiri di
 * sini supaya fungsi progress tidak butuh tz.
 */
export type GoalScheduleSource = {
  readonly scheduleId: string
  readonly expectedOccurrenceAtMs: readonly number[]
}

/** Semua data mentah yang bisa ditautkan ke goal. */
export type GoalItemSources = {
  readonly todos: readonly Todo[]
  readonly habits: readonly GoalHabitSource[]
  readonly checkins: readonly HabitCheckin[]
  readonly schedules: readonly GoalScheduleSource[]
  readonly occurrences: readonly ScheduleOccurrence[]
}

/** Progress satu tipe item dari task yang ditautkan; `null` kalau tidak ada task sama sekali. */
export function taskProgressPercent(todos: readonly Pick<Todo, 'isDone'>[]): number | null {
  if (todos.length === 0) return null

  let done = 0
  for (const todo of todos) if (todo.isDone) done += 1
  return clampPercent((done / todos.length) * 100)
}

export type HabitPeriodProgressInput = {
  readonly habit: Pick<Habit, 'id' | 'frequencyType' | 'frequencyDays' | 'targetPerDay'>
  readonly checkins: readonly HabitCheckin[]
  readonly period: GoalProgressPeriod
  readonly todayLocalDate: string
  readonly createdLocalDate?: string
}

/**
 * % hari target habit tercapai di dalam periode, dihitung sampai `todayLocalDate`.
 *
 * `null` kalau tidak ada satu pun hari jadwal yang bisa dinilai (periode belum mulai, habit mingguan
 * yang tidak punya hari jadwal di periode, dsb.) - supaya tipe itu tidak menaikkan/menurunkan
 * progress chapter tanpa data.
 */
export function habitPeriodProgressPercent(input: HabitPeriodProgressInput): number | null {
  return habitPercentForPeriod(
    input.habit,
    sumCheckinsByDate(input.checkins, input.habit.id),
    input.period,
    input.todayLocalDate,
    input.createdLocalDate,
  )
}

function habitPercentForPeriod(
  habit: HabitPeriodProgressInput['habit'],
  amountsByDate: ReadonlyMap<string, number>,
  period: GoalProgressPeriod,
  todayLocalDate: string,
  createdLocalDate: string | undefined,
): number | null {
  const start =
    createdLocalDate !== undefined && createdLocalDate > period.startDate
      ? createdLocalDate
      : period.startDate
  const end = todayLocalDate < period.endDate ? todayLocalDate : period.endDate
  if (end < start) return null

  const spanDays = diffLocalDays(start, end) + 1

  let scheduledDays = 0
  let metDays = 0
  for (let offset = 0; offset < spanDays; offset += 1) {
    const localDate = addLocalDays(start, offset)
    if (!isScheduledDay(habit, weekdayOfLocalDate(localDate))) continue

    scheduledDays += 1
    if (isDayTargetMet(habit, amountsByDate.get(localDate) ?? 0)) metDays += 1
  }

  if (scheduledDays === 0) return null
  return clampPercent((metDays / scheduledDays) * 100)
}

export type SchedulePeriodProgressInput = {
  readonly scheduleId: string
  readonly occurrences: readonly Pick<
    ScheduleOccurrence,
    'scheduleId' | 'occurrenceAt' | 'status'
  >[]
  /** Kejadian yang seharusnya terjadi di periode, sampai hari ini (epoch ms). */
  readonly expectedOccurrenceAtMs: readonly number[]
}

/**
 * % kejadian jadwal yang ditandai `done` dari kejadian yang diharapkan terjadi.
 *
 * Kejadian yang belum ditandai (`pending`) dan yang terlewat (`missed`) tetap masuk penyebut - itulah
 * yang membuat progress turun saat user melewatkan jadwal. `expectedOccurrenceAtMs` kosong = `null`
 * (belum ada kejadian yang bisa dinilai).
 */
export function schedulePeriodProgressPercent(input: SchedulePeriodProgressInput): number | null {
  const expected = new Set(input.expectedOccurrenceAtMs)
  if (expected.size === 0) return null

  const done = new Set<number>()
  for (const occurrence of input.occurrences) {
    if (occurrence.scheduleId !== input.scheduleId) continue
    if (occurrence.status !== 'done') continue
    done.add(occurrence.occurrenceAt)
  }

  let doneCount = 0
  for (const at of expected) if (done.has(at)) doneCount += 1
  return clampPercent((doneCount / expected.size) * 100)
}

export type GoalSlicesInput = {
  readonly period: GoalProgressPeriod
  /** Tautan untuk SATU chapter / Sepanjang Goal (sudah difilter pemanggil). */
  readonly links: readonly GoalLink[]
  readonly sources: GoalItemSources
  readonly todayLocalDate: string
}

/**
 * Bangun `ProgressSlice` per tipe dari tautan + data mentah.
 *
 * Tipe yang tidak punya tautan (atau itemnya sudah dihapus) TIDAK menghasilkan slice; slice bisa
 * bernilai `null` kalau itemnya ada tapi belum punya hari/kejadian yang bisa dinilai. Keduanya
 * dikeluarkan dari penyebut oleh `chapterProgressPercent`.
 */
export function goalSlices(input: GoalSlicesInput): readonly ProgressSlice[] {
  const todosById = new Map(input.sources.todos.map((todo) => [todo.id, todo] as const))
  const habitsById = new Map(
    input.sources.habits.map((source) => [source.habit.id, source] as const),
  )
  const schedulesById = new Map(
    input.sources.schedules.map((source) => [source.scheduleId, source] as const),
  )

  // Dikelompokkan sekali per panggilan (bukan per habit): satu periode bisa berisi beberapa habit,
  // dan memindai seluruh check-in untuk tiap habit akan jadi O(habit x check-in).
  const checkinAmountsByHabit = groupCheckinsByHabit(input.sources.checkins)

  const slices: ProgressSlice[] = []

  for (const itemType of LINKABLE_ITEM_TYPES) {
    const links = input.links.filter((link) => link.itemType === itemType)
    if (links.length === 0) continue

    const slice = sliceForType(itemType, links, {
      period: input.period,
      todayLocalDate: input.todayLocalDate,
      sources: input.sources,
      todosById,
      habitsById,
      schedulesById,
      checkinAmountsByHabit,
    })
    if (slice !== null) slices.push(slice)
  }

  return slices
}

export type GoalItemsProgressInput = GoalSlicesInput & {
  readonly isCompleted?: boolean
  readonly isClosed?: boolean
}

/** Progress satu periode (chapter atau Sepanjang Goal): slice + persen akhir. */
export type GoalItemsProgress = {
  readonly slices: readonly ProgressSlice[]
  readonly percent: number
}

/** Hitung progress satu periode dari item mentah, memakai aturan `chapterProgressPercent`. */
export function goalItemsProgress(input: GoalItemsProgressInput): GoalItemsProgress {
  const slices = goalSlices(input)
  const percent = chapterProgressPercent(
    {
      isCompleted: input.isCompleted ?? false,
      ...(input.isClosed === undefined ? {} : { isClosed: input.isClosed }),
    },
    slices,
  )
  return { slices, percent }
}

/** Progress + status satu chapter, siap dipakai halaman Goals/Overview. */
export type GoalChapterProgress = {
  readonly chapterId: string
  readonly percent: number
  readonly status: ChapterStatus
  readonly slices: readonly ProgressSlice[]
}

export type GoalProgressReport = {
  readonly percent: number
  readonly chapters: readonly GoalChapterProgress[]
  /** `null` kalau tidak ada item yang menempel langsung ke main goal. */
  readonly sepanjangGoalPercent: number | null
  readonly sepanjangGoalSlices: readonly ProgressSlice[]
  /** Ada chapter berstatus `terlewat` -> kartu review F13 harus muncul. */
  readonly needsReview: boolean
}

export type GoalProgressInput = {
  readonly goal: Pick<Goal, 'id' | 'startDate' | 'targetDate'>
  readonly chapters: readonly GoalChapter[]
  readonly links: readonly GoalLink[]
  readonly sources: GoalItemSources
  readonly todayLocalDate: string
}

/**
 * Progress lengkap satu main goal (PRD F13): per chapter, Sepanjang Goal, dan total.
 *
 * Chapter dihitung dengan periode miliknya sendiri; item `chapterId = null` memakai rentang main goal
 * (Sepanjang Goal). Bobot main goal sama rata antar chapter + Sepanjang Goal (kalau ada isinya).
 */
export function goalProgressReport(input: GoalProgressInput): GoalProgressReport {
  const goalLinks = input.links.filter((link) => link.goalId === input.goal.id)

  const chapters: GoalChapterProgress[] = []
  for (const chapter of input.chapters) {
    if (chapter.goalId !== input.goal.id) continue

    const progress = goalItemsProgress({
      period: chapter,
      links: goalLinks.filter((link) => link.chapterId === chapter.id),
      sources: input.sources,
      todayLocalDate: input.todayLocalDate,
      isCompleted: chapter.isCompleted,
      isClosed: chapter.isClosed,
    })

    chapters.push({
      chapterId: chapter.id,
      percent: progress.percent,
      status: chapterStatus(chapter, input.todayLocalDate, progress.percent),
      slices: progress.slices,
    })
  }

  const sepanjangGoalSlices = goalSlices({
    // Sepanjang Goal mengikuti rentang main goal (tanpa periode sendiri).
    period: { startDate: input.goal.startDate, endDate: input.goal.targetDate },
    links: goalLinks.filter((link) => link.chapterId === null),
    sources: input.sources,
    todayLocalDate: input.todayLocalDate,
  })
  const sepanjangGoalPercent =
    sepanjangGoalSlices.length === 0
      ? null
      : chapterProgressPercent({ isCompleted: false }, sepanjangGoalSlices)

  return {
    percent: mainGoalProgressPercent(
      chapters.map((chapter) => chapter.percent),
      sepanjangGoalPercent,
    ),
    chapters,
    sepanjangGoalPercent,
    sepanjangGoalSlices,
    needsReview: chapters.some((chapter) => chapter.status === 'terlewat'),
  }
}

type SliceContext = {
  readonly period: GoalProgressPeriod
  readonly todayLocalDate: string
  readonly sources: GoalItemSources
  readonly todosById: ReadonlyMap<string, Todo>
  readonly habitsById: ReadonlyMap<string, GoalHabitSource>
  readonly schedulesById: ReadonlyMap<string, GoalScheduleSource>
  readonly checkinAmountsByHabit: ReadonlyMap<string, ReadonlyMap<string, number>>
}

function sliceForType(
  itemType: LinkableItemType,
  links: readonly GoalLink[],
  context: SliceContext,
): ProgressSlice | null {
  switch (itemType) {
    case 'todo':
      return todoSlice(links, context)
    case 'habit':
      return habitSlice(links, context)
    case 'schedule':
      return scheduleSlice(links, context)
  }
}

function todoSlice(links: readonly GoalLink[], context: SliceContext): ProgressSlice | null {
  const todos: Pick<Todo, 'isDone'>[] = []
  for (const link of links) {
    const todo = context.todosById.get(link.itemId)
    if (todo !== undefined) todos.push(todo)
  }
  if (todos.length === 0) return null
  return { itemType: 'todo', percent: taskProgressPercent(todos) }
}

function habitSlice(links: readonly GoalLink[], context: SliceContext): ProgressSlice | null {
  const percents: number[] = []
  let hasItem = false

  for (const link of links) {
    const source = context.habitsById.get(link.itemId)
    if (source === undefined) continue
    hasItem = true

    const percent = habitPercentForPeriod(
      source.habit,
      context.checkinAmountsByHabit.get(source.habit.id) ?? NO_CHECKINS,
      context.period,
      context.todayLocalDate,
      source.createdLocalDate,
    )
    if (percent !== null) percents.push(percent)
  }

  if (!hasItem) return null
  return { itemType: 'habit', percent: averagePercent(percents) }
}

function scheduleSlice(links: readonly GoalLink[], context: SliceContext): ProgressSlice | null {
  const percents: number[] = []
  let hasItem = false

  for (const link of links) {
    const source = context.schedulesById.get(link.itemId)
    if (source === undefined) continue
    hasItem = true

    const percent = schedulePeriodProgressPercent({
      scheduleId: source.scheduleId,
      occurrences: context.sources.occurrences,
      expectedOccurrenceAtMs: source.expectedOccurrenceAtMs,
    })
    if (percent !== null) percents.push(percent)
  }

  if (!hasItem) return null
  return { itemType: 'schedule', percent: averagePercent(percents) }
}

/** Rata-rata persen yang sudah clamp; `null` kalau tidak ada nilai terukur. */
function averagePercent(values: readonly number[]): number | null {
  if (values.length === 0) return null

  let total = 0
  for (const value of values) total += clampPercent(value)
  return clampPercent(total / values.length)
}

/** Jumlahkan `amount` per `localDate` untuk satu habit (beberapa check-in sehari diakumulasi). */
function sumCheckinsByDate(
  checkins: readonly HabitCheckin[],
  habitId: string,
): ReadonlyMap<string, number> {
  const map = new Map<string, number>()
  for (const checkin of checkins) {
    if (checkin.habitId !== habitId) continue
    map.set(checkin.localDate, (map.get(checkin.localDate) ?? 0) + checkin.amount)
  }
  return map
}

/** Peta `habitId -> (localDate -> jumlah)` dibangun sekali untuk semua habit di satu goal. */
function groupCheckinsByHabit(
  checkins: readonly HabitCheckin[],
): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const byHabit = new Map<string, Map<string, number>>()
  for (const checkin of checkins) {
    let amounts = byHabit.get(checkin.habitId)
    if (amounts === undefined) {
      amounts = new Map<string, number>()
      byHabit.set(checkin.habitId, amounts)
    }
    amounts.set(checkin.localDate, (amounts.get(checkin.localDate) ?? 0) + checkin.amount)
  }
  return byHabit
}

const NO_CHECKINS: ReadonlyMap<string, number> = new Map()
