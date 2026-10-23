import {
  chapterStatus as coreChapterStatus,
  goalChapterSchema,
  goalLinkSchema,
  goalProgressReport,
  habitCheckinSchema,
  habitSchema,
  todoSchema,
  type GoalItemSources,
  type GoalLink,
} from '@improve-personal/core'
import { describe, expect, it } from 'vitest'

import {
  chapterProgress,
  chapterStatus,
  goalProgress as webGoalProgress,
  type Chapter,
  type Goal,
  type GoalItem,
} from './goals'

/**
 * Paritas angka halaman Goals (T18) terhadap kalkulasi core (`goalProgressReport`).
 *
 * AC T18: "Stepper chapter + progress tampil benar (angka konsisten dengan `goalProgressReport` core:
 * per tipe, chapter kosong 0%, status terlewat/ditutup)".
 *
 * Test ini sengaja membandingkan angka web dengan angka core untuk DATA YANG SAMA, bukan mematok
 * implementasi: apa pun cara web menghitung, hasilnya wajib sama dengan yang dipakai mobile.
 */

const GOAL_ID = '0192f0a0-0000-7000-8000-000000000001'
const GOAL_B = '0192f0a0-0000-7000-8000-000000000002'
const CHAPTER_A = '0192f0a0-0000-7000-8000-000000000003'
const CHAPTER_EMPTY = '0192f0a0-0000-7000-8000-000000000004'
const CHAPTER_MANUAL = '0192f0a0-0000-7000-8000-000000000005'
const TODO_DONE = '0192f0a0-0000-7000-8000-000000000010'
const TODO_OPEN = '0192f0a0-0000-7000-8000-000000000011'
const TODO_ROUND_1 = '0192f0a0-0000-7000-8000-000000000012'
const TODO_ROUND_2 = '0192f0a0-0000-7000-8000-000000000013'
const TODO_ROUND_3 = '0192f0a0-0000-7000-8000-000000000014'
const HABIT_ID = '0192f0a0-0000-7000-8000-000000000020'
const LINK_TODO_DONE = '0192f0a0-0000-7000-8000-000000000030'
const LINK_TODO_OPEN = '0192f0a0-0000-7000-8000-000000000031'
const LINK_HABIT = '0192f0a0-0000-7000-8000-000000000032'
const LINK_ALONG_DONE = '0192f0a0-0000-7000-8000-000000000033'
const LINK_ALONG_OPEN = '0192f0a0-0000-7000-8000-000000000034'
const LINK_ALONG_HABIT = '0192f0a0-0000-7000-8000-000000000035'
const LINK_ROUND_1 = '0192f0a0-0000-7000-8000-000000000036'
const LINK_ROUND_2 = '0192f0a0-0000-7000-8000-000000000037'
const LINK_ROUND_3 = '0192f0a0-0000-7000-8000-000000000038'

/** Pekan 2026-01-05..2026-01-11: semua hari sudah lewat saat "hari ini" 2026-02-15. */
const PERIOD = { startDate: '2026-01-05', endDate: '2026-01-11' }
const TODAY = '2026-02-15'
const PERIOD_DAYS = [
  '2026-01-05',
  '2026-01-06',
  '2026-01-07',
  '2026-01-08',
  '2026-01-09',
  '2026-01-10',
  '2026-01-11',
]

// ---- Fixture core -------------------------------------------------------------------

function coreGoal(patch: Record<string, unknown> = {}) {
  return {
    id: GOAL_ID,
    startDate: PERIOD.startDate,
    targetDate: PERIOD.endDate,
    ...patch,
  }
}

function coreChapter(patch: Record<string, unknown> = {}) {
  return goalChapterSchema.parse({
    id: CHAPTER_A,
    goalId: GOAL_ID,
    title: 'Base building',
    startDate: PERIOD.startDate,
    endDate: PERIOD.endDate,
    sortOrder: 0,
    isCompleted: false,
    isClosed: false,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  })
}

function coreLink(patch: Record<string, unknown> = {}): GoalLink {
  return goalLinkSchema.parse({
    id: LINK_TODO_DONE,
    goalId: GOAL_ID,
    chapterId: CHAPTER_A,
    itemType: 'todo',
    itemId: TODO_DONE,
    createdAt: 0,
    ...patch,
  })
}

function coreTodo(id: string, isDone: boolean) {
  return todoSchema.parse({
    id,
    title: `Task ${id.slice(-4)}`,
    note: null,
    deadlineAt: null,
    priority: 'medium',
    isDone,
    completedAt: isDone ? 1 : null,
    scheduleId: null,
    scheduleOccurrenceAt: null,
    createdAt: 0,
    updatedAt: 0,
  })
}

function coreHabit() {
  return habitSchema.parse({
    id: HABIT_ID,
    name: 'Baca 10 menit',
    iconSticker: null,
    color: null,
    frequencyType: 'daily',
    frequencyDays: null,
    targetPerDay: 1,
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
  })
}

/** Check-in penuh untuk seluruh periode -> habit 100%. */
function fullCheckins() {
  return PERIOD_DAYS.map((localDate, index) =>
    habitCheckinSchema.parse({
      id: `0192f0a0-0000-7000-8000-00000000010${index}`,
      habitId: HABIT_ID,
      localDate,
      amount: 1,
      checkinAt: 0,
    }),
  )
}

function coreSources(patch: Partial<GoalItemSources> = {}): GoalItemSources {
  return {
    todos: [
      coreTodo(TODO_DONE, true),
      coreTodo(TODO_OPEN, false),
      coreTodo(TODO_ROUND_1, true),
      coreTodo(TODO_ROUND_2, false),
      coreTodo(TODO_ROUND_3, false),
    ],
    habits: [{ habit: coreHabit() }],
    checkins: fullCheckins(),
    schedules: [],
    occurrences: [],
    ...patch,
  }
}

// ---- Fixture web --------------------------------------------------------------------

function webTask(id: string, done: boolean): GoalItem {
  return { id, kind: 'task', title: id, meta: '', done, rate: 0 }
}

function webHabit(id: string, rate: number): GoalItem {
  return { id, kind: 'habit', title: id, meta: '', done: false, rate }
}

function webChapter(patch: Partial<Chapter> = {}): Chapter {
  return {
    id: CHAPTER_A,
    title: 'Base building',
    start: PERIOD.startDate,
    end: PERIOD.endDate,
    isManualDone: false,
    isClosed: false,
    items: [],
    ...patch,
  }
}

function webGoal(chapters: Chapter[], along: GoalItem[] = []): Goal {
  return {
    id: GOAL_ID,
    title: 'Lari 10K',
    why: 'Sehat',
    category: 'kesehatan',
    status: 'aktif',
    start: PERIOD.startDate,
    end: PERIOD.endDate,
    cover: null,
    along,
    chapters,
  }
}

const MIXED_ITEMS = [webTask(TODO_DONE, true), webTask(TODO_OPEN, false), webHabit(HABIT_ID, 100)]
const MIXED_LINKS = [
  coreLink({ id: LINK_TODO_DONE, itemId: TODO_DONE }),
  coreLink({ id: LINK_TODO_OPEN, itemId: TODO_OPEN }),
  coreLink({ id: LINK_HABIT, itemType: 'habit', itemId: HABIT_ID }),
]

function coreChapterPercent(links: readonly GoalLink[], chapters = [coreChapter()]): number {
  const report = goalProgressReport({
    goal: coreGoal(),
    chapters,
    links,
    sources: coreSources(),
    todayLocalDate: TODAY,
  })
  const first = report.chapters[0]
  if (first === undefined) throw new Error('core tidak mengembalikan chapter')
  return first.percent
}

// ---- Progress chapter ---------------------------------------------------------------

describe('progress chapter: web harus sama dengan goalProgressReport core', () => {
  it('2 task (1 selesai) + 1 habit 100% -> core rata-rata per tipe, web rata-rata per item', () => {
    // core: (todo 50 + habit 100) / 2 = 75
    const corePercent = coreChapterPercent(MIXED_LINKS)
    expect(corePercent).toBe(75)

    // web: (100 + 0 + 100) / 3 = 67
    expect(chapterProgress(webChapter({ items: MIXED_ITEMS }))).toBe(corePercent)
  })

  it('3 task (1 selesai) -> pembulatan 0.1 desimal core, bukan Math.round web', () => {
    const links = [
      coreLink({ id: LINK_ROUND_1, itemId: TODO_ROUND_1 }),
      coreLink({ id: LINK_ROUND_2, itemId: TODO_ROUND_2 }),
      coreLink({ id: LINK_ROUND_3, itemId: TODO_ROUND_3 }),
    ]
    const corePercent = coreChapterPercent(links)
    expect(corePercent).toBe(33.3)

    const items = [
      webTask(TODO_ROUND_1, true),
      webTask(TODO_ROUND_2, false),
      webTask(TODO_ROUND_3, false),
    ]
    // 33 (dibulatkan ke bilangan bulat) != 33.3 (satu desimal, sama dengan mobile)
    expect(chapterProgress(webChapter({ items }))).toBe(corePercent)
  })
})

// ---- Progress main goal & Sepanjang Goal --------------------------------------------

describe('progress main goal: web harus sama dengan report.percent core', () => {
  it('chapter berisi + chapter kosong: bobot sama', () => {
    const chapters = [
      coreChapter(),
      coreChapter({ id: CHAPTER_EMPTY, title: 'Pemulihan', sortOrder: 1 }),
    ]
    const report = goalProgressReport({
      goal: coreGoal(),
      chapters,
      links: MIXED_LINKS.filter((link) => link.chapterId === CHAPTER_A),
      sources: coreSources(),
      todayLocalDate: TODAY,
    })
    // (75 + 0) / 2 = 37.5
    expect(report.percent).toBe(37.5)

    const web = webGoal([
      webChapter({ items: MIXED_ITEMS }),
      webChapter({ id: CHAPTER_EMPTY, title: 'Pemulihan', items: [] }),
    ])
    expect(webGoalProgress(web)).toBe(report.percent)
  })

  it('Sepanjang goal (item langsung ke main goal) memakai rata-rata per tipe core', () => {
    const links = [
      coreLink({ id: LINK_ALONG_DONE, chapterId: null, itemId: TODO_DONE }),
      coreLink({ id: LINK_ALONG_OPEN, chapterId: null, itemId: TODO_OPEN }),
      coreLink({ id: LINK_ALONG_HABIT, chapterId: null, itemType: 'habit', itemId: HABIT_ID }),
    ]
    const report = goalProgressReport({
      goal: coreGoal(),
      chapters: [],
      links,
      sources: coreSources(),
      todayLocalDate: TODAY,
    })
    expect(report.sepanjangGoalPercent).toBe(75)

    const web = webGoal([], MIXED_ITEMS)
    expect(webGoalProgress(web)).toBe(report.sepanjangGoalPercent)
  })
})

// ---- Status chapter (stepper) --------------------------------------------------------

describe('status chapter stepper: web harus sama dengan chapterStatus core', () => {
  it('chapter kosong yang sudah lewat tanggal = terlewat (bukan selesai)', () => {
    const chapter = webChapter({ id: CHAPTER_EMPTY, items: [] })
    expect(chapterStatus(chapter, TODAY)).toBe('terlewat')
    expect(coreChapterStatus(coreChapter({ id: CHAPTER_EMPTY }), TODAY, 0)).toBe('terlewat')
  })

  it('chapter ditutup menang atas tanggal', () => {
    const chapter = webChapter({ isClosed: true, items: MIXED_ITEMS })
    expect(chapterStatus(chapter, TODAY)).toBe('ditutup')
    expect(
      coreChapterStatus(coreChapter({ isClosed: true }), TODAY, coreChapterPercent(MIXED_LINKS)),
    ).toBe('ditutup')
  })

  it('chapter selesai manual DI DALAM periode = selesai', () => {
    const chapter = webChapter({ isManualDone: true, items: [] })
    expect(chapterStatus(chapter, '2026-01-07')).toBe('selesai')
    expect(
      coreChapterStatus(
        { startDate: PERIOD.startDate, endDate: PERIOD.endDate, isCompleted: true },
        '2026-01-07',
        100,
      ),
    ).toBe('selesai')
  })

  it('chapter selesai manual SEBELUM periode mulai = selesai (core), bukan belum mulai', () => {
    const chapter = webChapter({ isManualDone: true, items: [] })
    // core: isCompleted menang atas tanggal -> selesai
    expect(
      coreChapterStatus(
        { startDate: PERIOD.startDate, endDate: PERIOD.endDate, isCompleted: true },
        '2026-01-01',
        100,
      ),
    ).toBe('selesai')

    expect(chapterStatus(chapter, '2026-01-01')).toBe('selesai')
  })
})

// ---- Guard: goal B tidak boleh bercampur ---------------------------------------------

describe('goalProgressReport hanya menghitung record milik goal itu', () => {
  it('link & chapter goal lain diabaikan', () => {
    const report = goalProgressReport({
      goal: coreGoal(),
      chapters: [coreChapter({ id: CHAPTER_MANUAL, goalId: GOAL_B })],
      links: [coreLink({ goalId: GOAL_B })],
      sources: coreSources(),
      todayLocalDate: TODAY,
    })
    expect(report.chapters).toHaveLength(0)
    expect(report.percent).toBe(0)
  })
})
