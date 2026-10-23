import { describe, expect, it } from 'vitest'

import {
  chapterProgressPercent,
  goalChapterSchema,
  goalLinkSchema,
  goalSchema,
  type GoalChapter,
  type GoalLink,
} from '../domain/entities/goal.ts'
import { habitCheckinSchema, habitSchema } from '../domain/entities/habit.ts'
import { scheduleOccurrenceSchema } from '../domain/entities/schedule.ts'
import { todoSchema } from '../domain/entities/todo.ts'
import {
  goalItemsProgress,
  goalProgressReport,
  goalSlices,
  habitPeriodProgressPercent,
  schedulePeriodProgressPercent,
  taskProgressPercent,
  type GoalItemSources,
} from './goal.ts'

/**
 * Agregasi progress Goals (PRD F13, AC T17).
 *
 * Semua input tanggal berupa string lokal dan "hari ini" di-inject, jadi test ini deterministik dan
 * tidak bergantung zona waktu mesin yang menjalankannya.
 */

const GOAL_ID = '0192f0a0-0000-7000-8000-000000000001'
const OTHER_GOAL_ID = '0192f0a0-0000-7000-8000-000000000002'
const CHAPTER_JAN = '0192f0a0-0000-7000-8000-000000000003'
const CHAPTER_FEB = '0192f0a0-0000-7000-8000-000000000004'
const TODO_DONE = '0192f0a0-0000-7000-8000-000000000005'
const TODO_OPEN = '0192f0a0-0000-7000-8000-000000000006'
const TODO_ALONG = '0192f0a0-0000-7000-8000-000000000007'
const HABIT_ID = '0192f0a0-0000-7000-8000-000000000008'
const SCHEDULE_ID = '0192f0a0-0000-7000-8000-000000000009'
const LINK_TODO_DONE = '0192f0a0-0000-7000-8000-000000000010'
const LINK_TODO_OPEN = '0192f0a0-0000-7000-8000-000000000011'
const LINK_HABIT = '0192f0a0-0000-7000-8000-000000000012'
const LINK_SCHEDULE = '0192f0a0-0000-7000-8000-000000000013'
const LINK_ALONG = '0192f0a0-0000-7000-8000-000000000014'

const TODAY = '2026-02-15'

function goalFixture(patch: Record<string, unknown> = {}) {
  return goalSchema.parse({
    id: GOAL_ID,
    title: 'Lari 10K',
    reason: null,
    category: 'kesehatan',
    coverSticker: null,
    startDate: '2026-01-01',
    targetDate: '2026-03-31',
    status: 'aktif',
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  })
}

function chapterFixture(patch: Record<string, unknown> = {}): GoalChapter {
  return goalChapterSchema.parse({
    id: CHAPTER_JAN,
    goalId: GOAL_ID,
    title: 'Base building',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    sortOrder: 0,
    isCompleted: false,
    isClosed: false,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  })
}

function linkFixture(patch: Record<string, unknown> = {}): GoalLink {
  return goalLinkSchema.parse({
    id: LINK_TODO_DONE,
    goalId: GOAL_ID,
    chapterId: CHAPTER_JAN,
    itemType: 'todo',
    itemId: TODO_DONE,
    createdAt: 0,
    ...patch,
  })
}

function todoFixture(id: string, isDone: boolean) {
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

function habitFixture(patch: Record<string, unknown> = {}) {
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
    ...patch,
  })
}

function checkinFixture(id: string, localDate: string, amount = 1, habitId = HABIT_ID) {
  return habitCheckinSchema.parse({ id, habitId, localDate, amount, checkinAt: 0 })
}

function occurrenceFixture(
  id: string,
  occurrenceAt: number,
  status: 'pending' | 'done' | 'missed',
  scheduleId = SCHEDULE_ID,
) {
  return scheduleOccurrenceSchema.parse({
    id,
    scheduleId,
    occurrenceAt,
    status,
    markedAt: status === 'pending' ? null : occurrenceAt,
  })
}

function emptySources(patch: Partial<GoalItemSources> = {}): GoalItemSources {
  return {
    todos: [],
    habits: [],
    checkins: [],
    schedules: [],
    occurrences: [],
    ...patch,
  }
}

describe('taskProgressPercent - task selesai/total', () => {
  it('menghitung persentase task yang selesai', () => {
    expect(taskProgressPercent([{ isDone: true }, { isDone: false }, { isDone: false }])).toBe(33.3)
    expect(taskProgressPercent([{ isDone: true }, { isDone: true }])).toBe(100)
    expect(taskProgressPercent([{ isDone: false }])).toBe(0)
  })

  it('tanpa task = null (tidak ada data, bukan 0/100)', () => {
    expect(taskProgressPercent([])).toBeNull()
  })
})

describe('habitPeriodProgressPercent - % hari target tercapai di periode', () => {
  it('membagi hari terpenuhi dengan hari jadwal sampai hari ini', () => {
    const checkins = [
      checkinFixture('0192f0a0-0000-7000-8000-000000000101', '2026-01-01'),
      checkinFixture('0192f0a0-0000-7000-8000-000000000102', '2026-01-02'),
      checkinFixture('0192f0a0-0000-7000-8000-000000000103', '2026-01-03'),
    ]

    expect(
      habitPeriodProgressPercent({
        habit: habitFixture(),
        checkins,
        period: { startDate: '2026-01-01', endDate: '2026-01-07' },
        todayLocalDate: '2026-01-07',
      }),
    ).toBe(42.9)

    // Periode belum selesai: hari setelah "hari ini" tidak masuk penyebut.
    expect(
      habitPeriodProgressPercent({
        habit: habitFixture(),
        checkins,
        period: { startDate: '2026-01-01', endDate: '2026-01-31' },
        todayLocalDate: '2026-01-03',
      }),
    ).toBe(100)
  })

  it('beberapa check-in sehari diakumulasi untuk target harian', () => {
    const checkins = [
      checkinFixture('0192f0a0-0000-7000-8000-000000000111', '2026-01-01', 1),
      checkinFixture('0192f0a0-0000-7000-8000-000000000112', '2026-01-01', 1),
      checkinFixture('0192f0a0-0000-7000-8000-000000000113', '2026-01-02', 1),
    ]

    expect(
      habitPeriodProgressPercent({
        habit: habitFixture({ targetPerDay: 2 }),
        checkins,
        period: { startDate: '2026-01-01', endDate: '2026-01-02' },
        todayLocalDate: '2026-01-02',
      }),
    ).toBe(50)
  })

  it('hari sebelum habit dibuat tidak dihitung terlewat', () => {
    const checkins = [
      checkinFixture('0192f0a0-0000-7000-8000-000000000121', '2026-01-05'),
      checkinFixture('0192f0a0-0000-7000-8000-000000000122', '2026-01-06'),
      checkinFixture('0192f0a0-0000-7000-8000-000000000123', '2026-01-07'),
    ]

    expect(
      habitPeriodProgressPercent({
        habit: habitFixture(),
        checkins,
        period: { startDate: '2026-01-01', endDate: '2026-01-07' },
        todayLocalDate: '2026-01-07',
        createdLocalDate: '2026-01-05',
      }),
    ).toBe(100)
  })

  it('habit mingguan: hari non-jadwal tidak masuk penyebut', () => {
    // 2026-01-05 = Senin; periode 01-01..01-07 hanya punya satu hari Senin.
    const habit = habitFixture({ frequencyType: 'weekly_days', frequencyDays: ['senin'] })
    const checkins = [checkinFixture('0192f0a0-0000-7000-8000-000000000131', '2026-01-05')]

    expect(
      habitPeriodProgressPercent({
        habit,
        checkins,
        period: { startDate: '2026-01-01', endDate: '2026-01-07' },
        todayLocalDate: '2026-01-07',
      }),
    ).toBe(100)

    // Periode tanpa hari Senin (06-01..06-11) = tidak ada yang bisa dinilai.
    expect(
      habitPeriodProgressPercent({
        habit,
        checkins: [],
        period: { startDate: '2026-01-06', endDate: '2026-01-11' },
        todayLocalDate: '2026-01-11',
      }),
    ).toBeNull()
  })

  it('periode yang belum mulai = null', () => {
    expect(
      habitPeriodProgressPercent({
        habit: habitFixture(),
        checkins: [],
        period: { startDate: '2026-03-01', endDate: '2026-03-31' },
        todayLocalDate: '2026-02-15',
      }),
    ).toBeNull()
  })
})

describe('schedulePeriodProgressPercent - kejadian selesai/hadir', () => {
  it('membagi kejadian done dengan kejadian yang diharapkan', () => {
    const occurrences = [
      occurrenceFixture('0192f0a0-0000-7000-8000-000000000201', 1_000, 'done'),
      occurrenceFixture('0192f0a0-0000-7000-8000-000000000202', 2_000, 'missed'),
      occurrenceFixture('0192f0a0-0000-7000-8000-000000000203', 3_000, 'pending'),
    ]

    expect(
      schedulePeriodProgressPercent({
        scheduleId: SCHEDULE_ID,
        occurrences,
        expectedOccurrenceAtMs: [1_000, 2_000, 3_000],
      }),
    ).toBe(33.3)
  })

  it('kejadian jadwal lain dan kejadian di luar periode diabaikan', () => {
    const occurrences = [
      occurrenceFixture('0192f0a0-0000-7000-8000-000000000211', 1_000, 'done'),
      // Di luar periode: pemanggil tidak memasukkannya ke `expectedOccurrenceAtMs`, jadi statusnya
      // tidak boleh menaikkan progress.
      occurrenceFixture('0192f0a0-0000-7000-8000-000000000212', 9_000, 'done'),
      // Waktu yang sama tapi jadwal lain.
      occurrenceFixture(
        '0192f0a0-0000-7000-8000-000000000213',
        2_000,
        'done',
        '0192f0a0-0000-7000-8000-000000000099',
      ),
    ]

    expect(
      schedulePeriodProgressPercent({
        scheduleId: SCHEDULE_ID,
        occurrences,
        expectedOccurrenceAtMs: [1_000, 2_000],
      }),
    ).toBe(50)
  })

  it('tidak ada kejadian yang diharapkan = null; waktu dobel tidak dihitung dua kali', () => {
    expect(
      schedulePeriodProgressPercent({
        scheduleId: SCHEDULE_ID,
        occurrences: [],
        expectedOccurrenceAtMs: [],
      }),
    ).toBeNull()

    expect(
      schedulePeriodProgressPercent({
        scheduleId: SCHEDULE_ID,
        occurrences: [occurrenceFixture('0192f0a0-0000-7000-8000-000000000221', 1_000, 'done')],
        expectedOccurrenceAtMs: [1_000, 1_000],
      }),
    ).toBe(100)
  })
})

describe('goalSlices - satu slice per tipe item', () => {
  const sources = emptySources({
    todos: [todoFixture(TODO_DONE, true), todoFixture(TODO_OPEN, false)],
    habits: [{ habit: habitFixture() }],
    checkins: [
      checkinFixture('0192f0a0-0000-7000-8000-000000000301', '2026-01-01'),
      checkinFixture('0192f0a0-0000-7000-8000-000000000302', '2026-01-02'),
    ],
    schedules: [{ scheduleId: SCHEDULE_ID, expectedOccurrenceAtMs: [1_000, 2_000, 3_000, 4_000] }],
    occurrences: [
      occurrenceFixture('0192f0a0-0000-7000-8000-000000000311', 1_000, 'done'),
      occurrenceFixture('0192f0a0-0000-7000-8000-000000000312', 2_000, 'missed'),
    ],
  })

  const links = [
    linkFixture({ id: LINK_TODO_DONE, itemId: TODO_DONE }),
    linkFixture({ id: LINK_TODO_OPEN, itemId: TODO_OPEN }),
    linkFixture({ id: LINK_HABIT, itemType: 'habit', itemId: HABIT_ID }),
    linkFixture({ id: LINK_SCHEDULE, itemType: 'schedule', itemId: SCHEDULE_ID }),
  ]

  it('task per tipe selesai/total, habit per hari jadwal, jadwal per kejadian', () => {
    const slices = goalSlices({
      period: { startDate: '2026-01-01', endDate: '2026-01-31' },
      links,
      sources,
      todayLocalDate: TODAY,
    })

    expect(slices).toEqual([
      { itemType: 'todo', percent: 50 },
      { itemType: 'habit', percent: 6.5 },
      { itemType: 'schedule', percent: 25 },
    ])
  })

  it('item yang sudah dihapus / tidak ditautkan tidak menghasilkan slice palsu', () => {
    const slices = goalSlices({
      period: { startDate: '2026-01-01', endDate: '2026-01-31' },
      links: [linkFixture({ id: LINK_TODO_DONE, itemId: TODO_ALONG })],
      sources,
      todayLocalDate: TODAY,
    })

    expect(slices).toEqual([])
  })

  it('tanpa tautan = tanpa slice', () => {
    expect(
      goalSlices({
        period: { startDate: '2026-01-01', endDate: '2026-01-31' },
        links: [],
        sources,
        todayLocalDate: TODAY,
      }),
    ).toEqual([])
  })
})

describe('goalItemsProgress - bobot per tipe, bukan per item', () => {
  it('2 task (1 selesai) + habit 100% = 75%, bukan 67%', () => {
    const progress = goalItemsProgress({
      period: { startDate: '2026-01-01', endDate: '2026-01-01' },
      links: [
        linkFixture({ id: LINK_TODO_DONE, itemId: TODO_DONE }),
        linkFixture({ id: LINK_TODO_OPEN, itemId: TODO_OPEN }),
        linkFixture({ id: LINK_HABIT, itemType: 'habit', itemId: HABIT_ID }),
      ],
      sources: emptySources({
        todos: [todoFixture(TODO_DONE, true), todoFixture(TODO_OPEN, false)],
        habits: [{ habit: habitFixture() }],
        checkins: [checkinFixture('0192f0a0-0000-7000-8000-000000000401', '2026-01-01')],
      }),
      todayLocalDate: '2026-01-01',
    })

    expect(progress.percent).toBe(75)
  })

  it('slice null tidak ikut penyebut', () => {
    const progress = goalItemsProgress({
      period: { startDate: '2026-01-06', endDate: '2026-01-06' },
      links: [
        linkFixture({ id: LINK_TODO_DONE, itemId: TODO_DONE }),
        linkFixture({ id: LINK_TODO_OPEN, itemId: TODO_OPEN }),
        linkFixture({ id: LINK_HABIT, itemType: 'habit', itemId: HABIT_ID }),
      ],
      sources: emptySources({
        todos: [todoFixture(TODO_DONE, true), todoFixture(TODO_OPEN, false)],
        // Habit mingguan Senin, sementara 2026-01-06 = Selasa -> tidak ada hari yang bisa dinilai.
        habits: [
          {
            habit: habitFixture({ frequencyType: 'weekly_days', frequencyDays: ['senin'] }),
          },
        ],
      }),
      todayLocalDate: '2026-01-06',
    })

    expect(progress.slices).toEqual([
      { itemType: 'todo', percent: 50 },
      { itemType: 'habit', percent: null },
    ])
    expect(progress.percent).toBe(50)
  })

  it('chapter kosong = 0%, selesai manual = 100%', () => {
    const base = {
      period: { startDate: '2026-01-01', endDate: '2026-01-31' },
      links: [],
      sources: emptySources(),
      todayLocalDate: TODAY,
    }

    expect(goalItemsProgress(base).percent).toBe(0)
    expect(goalItemsProgress({ ...base, isCompleted: true }).percent).toBe(100)
  })
})

describe('goalProgressReport - main goal, chapter, Sepanjang Goal', () => {
  const goal = goalFixture()

  it('menggabungkan chapter (bobot sama) + Sepanjang Goal, dan menandai review', () => {
    const chapters = [
      chapterFixture({
        id: CHAPTER_JAN,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      }),
      chapterFixture({
        id: CHAPTER_FEB,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        sortOrder: 1,
      }),
    ]
    const links = [
      linkFixture({ id: LINK_TODO_DONE, chapterId: CHAPTER_JAN, itemId: TODO_DONE }),
      linkFixture({ id: LINK_TODO_OPEN, chapterId: CHAPTER_JAN, itemId: TODO_OPEN }),
      linkFixture({ id: LINK_ALONG, chapterId: null, itemId: TODO_ALONG }),
    ]
    const sources = emptySources({
      todos: [
        todoFixture(TODO_DONE, true),
        todoFixture(TODO_OPEN, false),
        todoFixture(TODO_ALONG, true),
      ],
    })

    const report = goalProgressReport({ goal, chapters, links, sources, todayLocalDate: TODAY })

    expect(report.chapters.map((chapter) => chapter.percent)).toEqual([50, 0])
    expect(report.chapters.map((chapter) => chapter.status)).toEqual(['terlewat', 'berjalan'])
    expect(report.sepanjangGoalPercent).toBe(100)
    // (50 + 0 + 100) / 3
    expect(report.percent).toBe(50)
    expect(report.needsReview).toBe(true)
  })

  it('chapter ditutup tidak lagi memicu review dan tetap dihitung progress terukurnya', () => {
    const chapters = [
      chapterFixture({
        id: CHAPTER_JAN,
        isClosed: true,
      }),
    ]

    const report = goalProgressReport({
      goal,
      chapters,
      links: [linkFixture({ id: LINK_TODO_OPEN, itemId: TODO_OPEN })],
      sources: emptySources({ todos: [todoFixture(TODO_OPEN, false)] }),
      todayLocalDate: TODAY,
    })

    expect(report.chapters[0]?.status).toBe('ditutup')
    expect(report.chapters[0]?.percent).toBe(0)
    expect(report.needsReview).toBe(false)
  })

  it('goal tanpa chapter: progress langsung dari item Sepanjang Goal', () => {
    const report = goalProgressReport({
      goal,
      chapters: [],
      links: [
        linkFixture({ id: LINK_TODO_DONE, chapterId: null, itemId: TODO_DONE }),
        linkFixture({ id: LINK_TODO_OPEN, chapterId: null, itemId: TODO_OPEN }),
      ],
      sources: emptySources({
        todos: [todoFixture(TODO_DONE, true), todoFixture(TODO_OPEN, false)],
      }),
      todayLocalDate: TODAY,
    })

    expect(report.sepanjangGoalPercent).toBe(50)
    expect(report.percent).toBe(50)
    expect(report.needsReview).toBe(false)
  })

  it('chapter & tautan milik goal lain diabaikan (tidak dobel hitung)', () => {
    const report = goalProgressReport({
      goal,
      chapters: [chapterFixture({ id: CHAPTER_FEB, goalId: OTHER_GOAL_ID, sortOrder: 1 })],
      links: [
        linkFixture({ id: LINK_TODO_DONE, goalId: OTHER_GOAL_ID, itemId: TODO_DONE }),
        linkFixture({ id: LINK_TODO_OPEN, chapterId: null, itemId: TODO_OPEN }),
      ],
      sources: emptySources({
        todos: [todoFixture(TODO_DONE, true), todoFixture(TODO_OPEN, false)],
      }),
      todayLocalDate: TODAY,
    })

    expect(report.chapters).toEqual([])
    expect(report.percent).toBe(0)
  })

  it('progress konsisten dengan primitif domain (tidak ada dua definisi)', () => {
    const chapters = [
      chapterFixture({
        id: CHAPTER_JAN,
        isCompleted: true,
      }),
    ]
    const report = goalProgressReport({
      goal,
      chapters,
      links: [],
      sources: emptySources(),
      todayLocalDate: TODAY,
    })

    expect(report.chapters[0]?.percent).toBe(chapterProgressPercent({ isCompleted: true }, []))
    expect(report.percent).toBe(100)
  })
})
