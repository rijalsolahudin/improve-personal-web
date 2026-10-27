import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  goalProgressReport,
  habitCheckinSchema,
  scheduleOccurrenceSchema,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Habit } from './habits'
import type { LocalDataSession } from './storage/session'
import { createRecordWriter } from './storage/record-writer'
import { createRepositorySet } from './storage/repository'
import { createUuidV7Generator } from './storage/uuid'
import type { Goal } from './goals'
import { goalProgress } from './goals'
import { loadHabits, persistHabit, toCoreHabit } from './habits/persistence'
import { loadGoalLinks, syncItemGoalLink } from './goals/links'
import {
  loadGoalRecords,
  persistGoal,
  recordsToPresentations,
  removeGoal,
} from './goals/persistence'
import type { Schedule } from './schedule'
import { occurrencesBetween } from './schedule'
import { loadScheduleData, persistSchedule } from './schedules/persistence'
import type { Task } from './tasks'
import { toTodoPayload } from './tasks/persistence'
import { TEST_KID_WIRE } from '../../tests/nuxt/record-key'

/**
 * Daur hidup tautan item → goal (T18, PRD F13 "Tautan Item").
 *
 * Yang diuji adalah PERILAKU penyimpanan, bukan nama fungsi:
 * - memindah chapter = memperbarui tautan yang sama (tidak menambah tautan kedua),
 * - menghapus chapter = tautannya pindah ke Sepanjang goal (tidak yatim),
 * - menghapus goal = tautannya dilepas, itemnya tetap ada,
 * - habit & jadwal membaca tujuannya dari record `goal_link` saat dimuat ulang,
 * - goal/chapter yang sudah hilang tidak dihidupkan lagi dari state form yang basi.
 */

const NOW_MS = 1_700_000_000_000
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }

const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

function memorySession(): LocalDataSession {
  const clock = createManualClock(NOW_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: '018f2c4e-0000-7000-8000-0000000000d1', clock })

  return {
    storage,
    provider: fakeProvider,
    clock,
    dataKey: DATA_KEY,
    kid: TEST_KID_WIRE,
    hlc,
    deviceId: '018f2c4e-0000-7000-8000-0000000000d1',
    userId: '018f2c4e-0000-7000-8000-00000000000a',
    isFreshKey: true,
    keyStore: {
      has: async () => false,
      put: async () => undefined,
      get: async () => null,
      remove: async () => undefined,
    },
    newId: createUuidV7Generator({ clock }),
    withMasterKey: async (work) => work(new Uint8Array(32)),
    repos: createRepositorySet({ storage, provider: fakeProvider, dataKey: DATA_KEY }),
    writer: createRecordWriter({ storage, provider: fakeProvider, dataKey: DATA_KEY, hlc, clock }),
  }
}

const GOAL_ID = '0192f0a0-0000-7000-8000-000000000001'
const CHAPTER_A = '0192f0a0-0000-7000-8000-000000000003'
const CHAPTER_B = '0192f0a0-0000-7000-8000-000000000004'
const TODO_ID = '0192f0a0-0000-7000-8000-000000000010'
const HABIT_ID = '0192f0a0-0000-7000-8000-000000000020'
const SCHEDULE_ID = '0192f0a0-0000-7000-8000-000000000040'
const TZ = 'Asia/Jakarta'

function goalOf(chapters: { id: string; title: string; start: string; end: string }[]): Goal {
  return {
    id: GOAL_ID,
    title: 'Lari 10K',
    why: 'Sehat',
    category: 'kesehatan',
    status: 'aktif',
    start: '2026-01-05',
    end: '2026-03-31',
    cover: null,
    along: [],
    chapters: chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      start: chapter.start,
      end: chapter.end,
      isManualDone: false,
      isClosed: false,
      items: [],
    })),
  }
}

function twoChapters(): Goal {
  return goalOf([
    { id: CHAPTER_A, title: 'Base building', start: '2026-01-05', end: '2026-01-31' },
    { id: CHAPTER_B, title: 'Speed work', start: '2026-02-01', end: '2026-02-28' },
  ])
}

const HABIT: Habit = {
  id: HABIT_ID,
  name: 'Baca 10 menit',
  icon: 'star',
  sticker: null,
  color: 0,
  days: null,
  target: 1,
  goalId: GOAL_ID,
  goalChapterId: CHAPTER_A,
  isArchived: false,
}

const SCHEDULE: Schedule = {
  id: SCHEDULE_ID,
  title: 'Kelas',
  color: 2,
  start: '2026-10-05',
  time: '19:00',
  dur: 90,
  allDay: false,
  rec: { type: 'weekly', days: [1, 4], interval: 2 },
  ends: { type: 'until', date: '2026-12-31' },
  exceptions: [],
  goalId: GOAL_ID,
  goalChapterId: CHAPTER_B,
  tz: TZ,
}

describe('tautan item → goal: daur hidup record', () => {
  let session: LocalDataSession

  beforeEach(() => {
    session = memorySession()
  })

  it('pindah chapter memperbarui tautan yang sama, bukan menambah tautan kedua', async () => {
    await persistGoal(session, twoChapters())
    await syncItemGoalLink(session, {
      itemType: 'todo',
      itemId: TODO_ID,
      goalId: GOAL_ID,
      goalChapterId: CHAPTER_A,
    })

    const moved = await syncItemGoalLink(session, {
      itemType: 'todo',
      itemId: TODO_ID,
      goalId: GOAL_ID,
      goalChapterId: CHAPTER_B,
    })
    expect(moved.ok).toBe(true)

    const todoLinks = (await loadGoalLinks(session)).filter((link) => link.itemType === 'todo')
    expect(todoLinks).toHaveLength(1)
    expect(todoLinks[0]?.chapterId).toBe(CHAPTER_B)
  })

  it('hapus chapter memindahkan tautannya ke Sepanjang goal (tidak yatim)', async () => {
    await persistGoal(session, twoChapters())
    await syncItemGoalLink(session, {
      itemType: 'todo',
      itemId: TODO_ID,
      goalId: GOAL_ID,
      goalChapterId: CHAPTER_B,
    })

    // Form goal menyimpan tanpa chapter B: item wajib pindah ke Sepanjang goal.
    await persistGoal(
      session,
      goalOf([{ id: CHAPTER_A, title: 'Base building', start: '2026-01-05', end: '2026-01-31' }]),
    )

    const links = await loadGoalLinks(session)
    expect(links).toHaveLength(1)
    expect(links[0]?.chapterId).toBeNull()
    // Chapter B benar-benar hilang dari penyimpanan.
    const records = await loadGoalRecords(session)
    expect(records.chapters.map((chapter) => chapter.id)).toEqual([CHAPTER_A])
  })

  it('hapus goal melepas semua tautannya tanpa menghapus item', async () => {
    await persistGoal(session, twoChapters())
    await session.writer.write({
      id: TODO_ID,
      type: 'todo',
      data: () => ({
        id: TODO_ID,
        title: 'Lari 5K',
        note: null,
        deadlineAt: null,
        priority: 'medium' as const,
        isDone: false,
        completedAt: null,
        scheduleId: null,
        scheduleOccurrenceAt: null,
        createdAt: 0,
        updatedAt: 0,
      }),
      index: { rangeStartMs: null, rangeEndMs: null },
    })
    await syncItemGoalLink(session, {
      itemType: 'todo',
      itemId: TODO_ID,
      goalId: GOAL_ID,
      goalChapterId: CHAPTER_A,
    })

    await removeGoal(session, GOAL_ID)

    expect(await loadGoalLinks(session)).toEqual([])
    // Item tetap ada: tautan adalah soft ref, bukan pemilik item.
    expect(await session.repos.todo.getById(TODO_ID)).not.toBeNull()
  })

  it('habit membaca tujuannya dari goal_link saat dimuat ulang', async () => {
    await persistGoal(session, twoChapters())
    await persistHabit(session, HABIT)
    await syncItemGoalLink(session, {
      itemType: 'habit',
      itemId: HABIT_ID,
      goalId: GOAL_ID,
      goalChapterId: CHAPTER_A,
    })

    // Muat ulang: payload di-parse dari penyimpanan (objek baru), jadi hanya goal_link yang tersisa.
    const links = await loadGoalLinks(session)
    const { habits } = await loadHabits(
      session,
      new Map(
        links
          .filter((link) => link.itemType === 'habit')
          .map((link) => [link.itemId, link] as const),
      ),
    )

    expect(habits[0]?.goalId).toBe(GOAL_ID)
    expect(habits[0]?.goalChapterId).toBe(CHAPTER_A)
  })

  it('jadwal membaca tujuannya dari goal_link saat dimuat ulang', async () => {
    await persistGoal(session, twoChapters())
    await persistSchedule(session, SCHEDULE, TZ)
    await syncItemGoalLink(session, {
      itemType: 'schedule',
      itemId: SCHEDULE_ID,
      goalId: GOAL_ID,
      goalChapterId: CHAPTER_B,
    })

    const links = await loadGoalLinks(session)
    const { schedules } = await loadScheduleData(
      session,
      TZ,
      new Map(
        links
          .filter((link) => link.itemType === 'schedule')
          .map((link) => [link.itemId, link] as const),
      ),
    )

    expect(schedules[0]?.goalId).toBe(GOAL_ID)
    expect(schedules[0]?.goalChapterId).toBe(CHAPTER_B)
  })

  it('goal/chapter yang sudah dihapus tidak dihidupkan lagi dari state form basi', async () => {
    await persistGoal(session, twoChapters())

    const staleGoal = await syncItemGoalLink(session, {
      itemType: 'todo',
      itemId: TODO_ID,
      goalId: '0192f0a0-0000-7000-8000-0000000000ff',
      goalChapterId: CHAPTER_A,
    })
    expect(staleGoal.ok).toBe(true)
    expect(await loadGoalLinks(session)).toEqual([])

    const staleChapter = await syncItemGoalLink(session, {
      itemType: 'todo',
      itemId: TODO_ID,
      goalId: GOAL_ID,
      goalChapterId: '0192f0a0-0000-7000-8000-0000000000ff',
    })
    expect(staleChapter.ok).toBe(true)
    const links = await loadGoalLinks(session)
    expect(links).toHaveLength(1)
    // Chapter asing tidak dipakai: tautan jatuh ke Sepanjang goal, bukan menunjuk chapter yang tidak ada.
    expect(links[0]?.chapterId).toBeNull()
  })
})

describe('progress presentasi vs goalProgressReport core', () => {
  it('dataset sama (task + habit + jadwal) menghasilkan angka identik', async () => {
    const session = memorySession()
    const TODAY = '2026-02-15'
    const TASK_DONE = '0192f0a0-0000-7000-8000-000000000010'
    const TASK_OPEN = '0192f0a0-0000-7000-8000-000000000011'

    await persistGoal(
      session,
      goalOf([{ id: CHAPTER_A, title: 'Base building', start: '2026-01-05', end: '2026-01-31' }]),
    )
    for (const itemId of [TASK_DONE, TASK_OPEN]) {
      const result = await syncItemGoalLink(session, {
        itemType: 'todo',
        itemId,
        goalId: GOAL_ID,
        goalChapterId: CHAPTER_A,
      })
      expect(result.ok).toBe(true)
    }
    for (const [itemType, itemId] of [
      ['habit', HABIT_ID],
      ['schedule', SCHEDULE_ID],
    ] as const) {
      const result = await syncItemGoalLink(session, {
        itemType,
        itemId,
        goalId: GOAL_ID,
        goalChapterId: CHAPTER_A,
      })
      expect(result.ok).toBe(true)
    }

    const schedule: Schedule = {
      id: SCHEDULE_ID,
      title: 'Kelas',
      color: 2,
      start: '2026-01-05',
      time: '19:00',
      dur: 90,
      allDay: false,
      rec: { type: 'weekly', days: [1, 4], interval: 1 },
      ends: { type: 'until', date: '2026-01-31' },
      exceptions: [],
      goalId: GOAL_ID,
      goalChapterId: CHAPTER_A,
      tz: TZ,
    }
    const habit: Habit = { ...HABIT, goalChapterId: CHAPTER_A }

    const tasks: Task[] = [
      {
        id: TASK_DONE,
        title: 'Lari 5K',
        priority: 'medium',
        deadline: null,
        done: true,
        scheduleId: null,
        quadrant: null,
        position: 0,
      },
      {
        id: TASK_OPEN,
        title: 'Lari 7K',
        priority: 'medium',
        deadline: null,
        done: false,
        scheduleId: null,
        quadrant: null,
        position: 0,
      },
    ]

    // Semua hari periode di-check-in (habit harian) dan semua kejadian jadwal hadir.
    const periodDays: string[] = []
    for (let day = 5; day <= 31; day += 1) {
      periodDays.push(`2026-01-${String(day).padStart(2, '0')}`)
    }
    const checkIns: Record<string, Record<string, number>> = {
      [HABIT_ID]: Object.fromEntries(periodDays.map((day) => [day, 1])),
    }
    const occurrences = occurrencesBetween([schedule], '2026-01-05', '2026-01-31', TZ)
    const attendance = Object.fromEntries(occurrences.map((occurrence) => [occurrence.key, true]))

    const webGoal = recordsToPresentations(
      await loadGoalRecords(session),
      await loadGoalLinks(session),
      { tasks, habits: [habit], checkIns, schedules: [schedule], attendance },
      TODAY,
    )[0]
    if (webGoal === undefined) throw new Error('presentasi goal tidak ada')

    const records = await loadGoalRecords(session)
    const links = await loadGoalLinks(session)
    const coreGoal = records.goals[0]
    if (coreGoal === undefined) throw new Error('record goal tidak ada')

    const corePercent = goalProgressReport({
      goal: coreGoal,
      chapters: records.chapters,
      links,
      sources: {
        todos: tasks.map((task) => toTodoPayload(task, NOW_MS)),
        habits: [{ habit: toCoreHabit(habit, NOW_MS) }],
        checkins: periodDays.map((localDate, index) =>
          habitCheckinSchema.parse({
            id: `0192f0a0-0000-7000-8000-${String(index).padStart(12, '0')}`,
            habitId: HABIT_ID,
            localDate,
            amount: 1,
            checkinAt: 0,
          }),
        ),
        schedules: [
          { scheduleId: SCHEDULE_ID, expectedOccurrenceAtMs: occurrences.map((o) => o.at) },
        ],
        occurrences: occurrences.map((occurrence, index) =>
          scheduleOccurrenceSchema.parse({
            id: `0192f0a0-0000-7000-b000-${String(index).padStart(12, '0')}`,
            scheduleId: SCHEDULE_ID,
            occurrenceAt: occurrence.at,
            status: 'done',
            markedAt: NOW_MS,
          }),
        ),
      },
      todayLocalDate: TODAY,
    })

    // (task 50 + habit 100 + jadwal 100) / 3 tipe = 83.3
    expect(corePercent.percent).toBe(83.3)
    expect(goalProgress(webGoal)).toBe(corePercent.percent)
    expect(webGoal.chapters[0]?.items).toHaveLength(4)
  })
})
