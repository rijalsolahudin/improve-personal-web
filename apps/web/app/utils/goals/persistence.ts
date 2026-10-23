import {
  checkGoalBundle,
  goalChapterSchema,
  goalSchema,
  habitPeriodProgressPercent,
  resolveGoalLinks,
  schedulePeriodProgressPercent,
  weekdayFromJsIndex,
  type Goal as CoreGoal,
  type GoalChapter as CoreChapter,
  type GoalLink,
  type HabitCheckin,
} from '@improve-personal/core'

import type { CheckIns, Habit } from '../habits'
import { occurrencesBetween } from '../schedule'
import type { Schedule } from '../schedule'
import type { Task } from '../tasks'
import { createRepository } from '../storage/repository'
import type { LocalDataSession } from '../storage/session'
import { deviceTimeZone, fromIsoDate, toIsoDate } from '../time'
import { loadGoalLinks, removeGoalLinks } from './links'
import type { Chapter, Goal, GoalCategory, GoalItem, GoalStatus } from '../goals'

/**
 * Persistensi Goals: `Goal`/`Chapter` (bentuk UI) ↔ record `goal` + `goal_chapter` + `goal_link`.
 *
 * Yang penting untuk pembaca:
 * - **Server data adalah record core**, bukan bentuk UI. `createdAt` lama dipertahankan saat menimpa.
 * - **Progress tidak pernah disimpan.** Saat membaca, item disusun dari tautan + data mentah
 *   (task/habit/jadwal) dan persennya dihitung core - sumber tunggal yang sama dengan mobile.
 * - **Tautan yatim tidak dianggap 100%**: `resolveGoalLinks` memisahkannya, lalu item yang hilang
 *   dilewati. Item yang dihapus tidak pernah menghapus goal.
 */

export type GoalRecords = {
  readonly goals: CoreGoal[]
  readonly chapters: CoreChapter[]
}

export type GoalPresentationSources = {
  readonly tasks: readonly Task[]
  readonly habits: readonly Habit[]
  readonly checkIns: CheckIns
  readonly schedules: readonly Schedule[]
  readonly attendance: Readonly<Record<string, boolean>>
}

function chapterRepository(session: LocalDataSession) {
  return createRepository<CoreChapter>(session, 'goal_chapter')
}

export async function loadGoalRecords(session: LocalDataSession): Promise<GoalRecords> {
  const [goalRecords, chapterRecords] = await Promise.all([
    session.repos.goal.listAll({ includeDeleted: false }),
    chapterRepository(session).listAll({ includeDeleted: false }),
  ])

  return {
    goals: goalRecords.map((record) => goalSchema.parse(record.data)),
    chapters: chapterRecords.map((record) => goalChapterSchema.parse(record.data)),
  }
}

export function toCoreGoal(goal: Goal, nowMs: number, previous?: CoreGoal): CoreGoal {
  return goalSchema.parse({
    id: goal.id,
    title: goal.title,
    reason: goal.why.trim() ? goal.why : null,
    category: goal.category,
    coverSticker: goal.cover,
    startDate: goal.start,
    targetDate: goal.end,
    status: goal.status,
    createdAt: previous?.createdAt ?? goal.createdAt ?? nowMs,
    updatedAt: nowMs,
  })
}

export function toCoreChapters(
  goal: Goal,
  nowMs: number,
  previous: ReadonlyMap<string, CoreChapter>,
): CoreChapter[] {
  return goal.chapters.map((chapter, index) =>
    goalChapterSchema.parse({
      id: chapter.id,
      goalId: goal.id,
      title: chapter.title,
      startDate: chapter.start,
      endDate: chapter.end,
      sortOrder: index,
      isCompleted: chapter.isManualDone,
      isClosed: chapter.isClosed,
      createdAt: previous.get(chapter.id)?.createdAt ?? chapter.createdAt ?? nowMs,
      updatedAt: nowMs,
    }),
  )
}

/**
 * Tulis satu goal + seluruh chapter-nya.
 *
 * Chapter yang dihapus dari form di-tombstone, dan tautan yang menunjuk chapter itu dipindah ke
 * Sepanjang goal (default PRD F13 "Hapus Chapter"), bukan dibiarkan yatim.
 *
 * @returns tautan yang chapter-nya ikut dipindah, supaya state composer bisa disamakan.
 */
export async function persistGoal(
  session: LocalDataSession,
  goal: Goal,
): Promise<{ readonly reassignedLinks: GoalLink[] }> {
  const nowMs = session.clock.nowMs()
  const existing = await session.repos.goal.getById(goal.id)
  const previous = existing === null ? undefined : goalSchema.parse(existing.data)

  const chapterRecords = await chapterRepository(session).listAll({ includeDeleted: false })
  const previousChapters = new Map(
    chapterRecords
      .map((record) => goalChapterSchema.parse(record.data))
      .filter((chapter) => chapter.goalId === goal.id)
      .map((chapter) => [chapter.id, chapter] as const),
  )

  const nextGoal = toCoreGoal(goal, nowMs, previous)
  const chapters = toCoreChapters(goal, nowMs, previousChapters)

  const keptIds = new Set(chapters.map((chapter) => chapter.id))
  const removedChapterIds = new Set([...previousChapters.keys()].filter((id) => !keptIds.has(id)))

  // Invarian lintas-record (PRD F13): chapter di dalam rentang goal & satu item satu tautan.
  // Tautan ke chapter yang DIHAPUS di form tidak ikut diperiksa: save ini yang memindahkannya ke
  // Sepanjang goal (lihat `moveLinksToSepanjang`).
  const links = (await loadGoalLinks(session)).filter(
    (link) =>
      link.goalId === goal.id &&
      (link.chapterId === null || !removedChapterIds.has(link.chapterId)),
  )
  const bundle = checkGoalBundle({ goal: nextGoal, chapters, links })
  if (!bundle.ok) throw new Error(bundle.issues.join('; '))

  await session.writer.write({
    id: goal.id,
    type: 'goal',
    data: () => nextGoal,
    // Rentang index = periode goal, dipakai Kalender/Overview tanpa memindai semua record.
    index: {
      rangeStartMs: fromIsoDate(goal.start).getTime(),
      rangeEndMs: fromIsoDate(goal.end).getTime(),
    },
  })

  for (const chapter of chapters) {
    await session.writer.write({
      id: chapter.id,
      type: 'goal_chapter',
      data: () => chapter,
      index: {
        rangeStartMs: fromIsoDate(chapter.startDate).getTime(),
        rangeEndMs: fromIsoDate(chapter.endDate).getTime(),
      },
    })
  }

  for (const id of previousChapters.keys()) {
    if (keptIds.has(id)) continue
    await session.writer.remove({ id, index: null })
  }

  const reassignedLinks = await moveLinksToSepanjang(session, goal.id, removedChapterIds)
  return { reassignedLinks }
}

async function moveLinksToSepanjang(
  session: LocalDataSession,
  goalId: string,
  removedChapterIds: ReadonlySet<string>,
): Promise<GoalLink[]> {
  if (removedChapterIds.size === 0) return []

  const links = await loadGoalLinks(session)
  const moved: GoalLink[] = []
  for (const link of links) {
    if (link.goalId !== goalId) continue
    if (link.chapterId === null || !removedChapterIds.has(link.chapterId)) continue

    const next: GoalLink = { ...link, chapterId: null }
    await session.writer.write({ id: next.id, type: 'goal_link', data: () => next, index: null })
    moved.push(next)
  }
  return moved
}

/** Hapus goal beserta chapter & tautannya; item (task/habit/jadwal) tidak ikut dihapus. */
export async function removeGoal(session: LocalDataSession, goalId: string): Promise<void> {
  const chapterRecords = await chapterRepository(session).listAll({ includeDeleted: false })
  for (const record of chapterRecords) {
    const chapter = goalChapterSchema.parse(record.data)
    if (chapter.goalId === goalId) await session.writer.remove({ id: record.id, index: null })
  }

  await removeGoalLinks(session, goalId)
  await session.writer.remove({ id: goalId, index: null })
}

/** Susun record core + tautan + data mentah menjadi model UI. */
function goalToPresentation(
  goal: CoreGoal,
  chapters: readonly CoreChapter[],
  links: readonly GoalLink[],
  sources: GoalPresentationSources,
  today: string,
): Goal {
  const goalLinks = links.filter((link) => link.goalId === goal.id)
  const existingItems = existingSourceItems(sources)
  const resolved = resolveGoalLinks(goalLinks, existingItems).resolved

  const period = { startDate: goal.startDate, endDate: goal.targetDate }
  const along = itemsFor(
    resolved.filter((link) => link.chapterId === null),
    period,
    sources,
    today,
  )

  const presentations: Chapter[] = chapters
    .filter((chapter) => chapter.goalId === goal.id)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      start: chapter.startDate,
      end: chapter.endDate,
      isManualDone: chapter.isCompleted,
      isClosed: chapter.isClosed,
      items: itemsFor(
        resolved.filter((link) => link.chapterId === chapter.id),
        chapter,
        sources,
        today,
      ),
      createdAt: chapter.createdAt,
    }))

  return {
    id: goal.id,
    title: goal.title,
    why: goal.reason ?? '',
    category: goal.category as GoalCategory,
    status: goal.status as GoalStatus,
    start: goal.startDate,
    end: goal.targetDate,
    cover: goal.coverSticker,
    along,
    chapters: presentations,
    createdAt: goal.createdAt,
  }
}

export function recordsToPresentations(
  records: GoalRecords,
  links: readonly GoalLink[],
  sources: GoalPresentationSources,
  today: string,
): Goal[] {
  return records.goals.map((goal) =>
    goalToPresentation(goal, records.chapters, links, sources, today),
  )
}

function existingSourceItems(sources: GoalPresentationSources) {
  return [
    ...sources.tasks.map((task) => ({ itemType: 'todo' as const, itemId: task.id })),
    ...sources.habits.map((habit) => ({ itemType: 'habit' as const, itemId: habit.id })),
    ...sources.schedules.map((schedule) => ({
      itemType: 'schedule' as const,
      itemId: schedule.id,
    })),
  ]
}

type GoalPeriod = { readonly startDate: string; readonly endDate: string }

function itemsFor(
  links: readonly GoalLink[],
  period: GoalPeriod,
  sources: GoalPresentationSources,
  today: string,
): GoalItem[] {
  const items: GoalItem[] = []
  for (const link of links) {
    const item = itemFor(link, period, sources, today)
    if (item !== null) items.push(item)
  }
  return items
}

function itemFor(
  link: GoalLink,
  period: GoalPeriod,
  sources: GoalPresentationSources,
  today: string,
): GoalItem | null {
  switch (link.itemType) {
    case 'todo': {
      const task = sources.tasks.find((candidate) => candidate.id === link.itemId)
      if (task === undefined) return null
      return {
        id: task.id,
        kind: 'task',
        title: task.title,
        meta: task.deadline === null ? '' : toIsoDate(new Date(task.deadline)),
        done: task.done,
        rate: null,
      }
    }
    case 'habit': {
      const habit = sources.habits.find((candidate) => candidate.id === link.itemId)
      if (habit === undefined) return null
      return {
        id: habit.id,
        kind: 'habit',
        title: habit.name,
        meta: habit.days === null ? 'Tiap hari' : `${habit.days.length} hari/pekan`,
        done: false,
        rate: habitRate(habit, sources.checkIns, period, today),
      }
    }
    case 'schedule': {
      const schedule = sources.schedules.find((candidate) => candidate.id === link.itemId)
      if (schedule === undefined) return null
      return {
        id: schedule.id,
        kind: 'jadwal',
        title: schedule.title,
        meta: schedule.allDay ? 'Sepanjang hari' : schedule.time,
        done: false,
        rate: scheduleRate(schedule, sources.attendance, period, today),
      }
    }
  }
}

function habitRate(
  habit: Habit,
  checkIns: CheckIns,
  period: GoalPeriod,
  today: string,
): number | null {
  const days: HabitCheckin[] = Object.entries(checkIns[habit.id] ?? {}).map(
    ([localDate, amount]) => ({
      id: `${habit.id}:${localDate}`,
      habitId: habit.id,
      localDate,
      amount,
      checkinAt: 0,
    }),
  )

  return habitPeriodProgressPercent({
    habit: {
      id: habit.id,
      frequencyType: habit.days === null ? 'daily' : 'weekly_days',
      frequencyDays: habit.days === null ? null : habit.days.map((day) => weekdayFromJsIndex(day)),
      targetPerDay: habit.target,
    },
    checkins: days,
    period,
    todayLocalDate: today,
  })
}

function scheduleRate(
  schedule: Schedule,
  attendance: Readonly<Record<string, boolean>>,
  period: GoalPeriod,
  today: string,
): number | null {
  const end = today < period.endDate ? today : period.endDate
  if (end < period.startDate) return null

  const occurrences = occurrencesBetween([schedule], period.startDate, end, deviceTimeZone())
  const expected = occurrences.map((occurrence) => occurrence.at)
  const done = occurrences
    .filter((occurrence) => attendance[occurrence.key])
    .map((occurrence) => ({
      scheduleId: schedule.id,
      occurrenceAt: occurrence.at,
      status: 'done' as const,
    }))

  return schedulePeriodProgressPercent({
    scheduleId: schedule.id,
    occurrences: done,
    expectedOccurrenceAtMs: expected,
  })
}
