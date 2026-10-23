import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'
import { beforeEach, describe, expect, it } from 'vitest'

import type { LocalDataSession } from '~/utils/storage/session'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import type { Goal } from '~/utils/goals'
import { goalProgress } from '~/utils/goals'
import { addDays } from '~/utils/time'
import { persistGoal, recordsToPresentations, loadGoalRecords } from './persistence'
import { loadGoalLinks, syncItemGoalLink } from './links'

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
const GOAL_B = '0192f0a0-0000-7000-8000-000000000002'
const CHAPTER_ID = '0192f0a0-0000-7000-8000-000000000003'
const TODO_DONE = '0192f0a0-0000-7000-8000-000000000010'
const TODO_OPEN = '0192f0a0-0000-7000-8000-000000000011'
const HABIT_ID = '0192f0a0-0000-7000-8000-000000000020'

function goalOf(id = GOAL_ID): Goal {
  return {
    id,
    title: 'Lari 10K',
    why: 'Sehat',
    category: 'kesehatan',
    status: 'aktif',
    start: '2026-01-05',
    end: '2026-03-31',
    cover: null,
    along: [],
    chapters: [
      {
        id: id === GOAL_ID ? CHAPTER_ID : '0192f0a0-0000-7000-8000-000000000004',
        title: 'Base building',
        start: '2026-01-05',
        end: '2026-01-31',
        isManualDone: false,
        isClosed: false,
        items: [],
      },
    ],
  }
}

const TASKS = [
  {
    id: TODO_DONE,
    title: 'Lari 5K',
    priority: 'medium' as const,
    deadline: null,
    done: true,
    scheduleId: null,
    quadrant: null,
    position: 0,
  },
  {
    id: TODO_OPEN,
    title: 'Lari 7K',
    priority: 'medium' as const,
    deadline: null,
    done: false,
    scheduleId: null,
    quadrant: null,
    position: 0,
  },
]

const HABITS = [
  {
    id: HABIT_ID,
    name: 'Baca 10 menit',
    icon: 'star' as const,
    sticker: null,
    color: 0,
    days: null,
    target: 1,
    goalId: GOAL_ID,
    isArchived: false,
  },
]

function sources(checkIns: Record<string, Record<string, number>> = {}) {
  return { tasks: TASKS, habits: HABITS, checkIns, schedules: [], attendance: {} }
}

describe('persistensi goal', () => {
  let session: LocalDataSession

  beforeEach(() => {
    session = memorySession()
  })

  it('goal + chapter bertahan setelah dimuat ulang (record core, bukan mock)', async () => {
    await persistGoal(session, goalOf())
    const records = await loadGoalRecords(session)

    expect(records.goals.map((goal) => goal.title)).toEqual(['Lari 10K'])
    expect(records.chapters.map((chapter) => chapter.title)).toEqual(['Base building'])
  })

  it('progress presentasi dari tautan = per tipe core (75%), bukan per item (67%)', async () => {
    await persistGoal(session, goalOf())
    for (const [itemId, itemType] of [
      [TODO_DONE, 'todo'],
      [TODO_OPEN, 'todo'],
      [HABIT_ID, 'habit'],
    ] as const) {
      const result = await syncItemGoalLink(session, {
        itemType,
        itemId,
        goalId: GOAL_ID,
        goalChapterId: CHAPTER_ID,
      })
      expect(result.ok).toBe(true)
    }

    const links = await loadGoalLinks(session)
    const [goal] = recordsToPresentations(
      await loadGoalRecords(session),
      links,
      sources({
        [HABIT_ID]: Object.fromEntries(
          Array.from({ length: 27 }, (_, offset) => [addDays('2026-01-05', offset), 1]),
        ),
      }),
      '2026-02-15',
    )

    expect(goal).toBeDefined()
    if (!goal) return
    // (task 50 + habit 100) / 2 = 75. Per item akan menghasilkan 66.7.
    expect(goalProgress(goal)).toBe(75)
  })

  it('satu item cuma punya satu tautan: pindah goal memperbarui record yang sama', async () => {
    await persistGoal(session, goalOf())
    await persistGoal(session, goalOf(GOAL_B))

    const first = await syncItemGoalLink(session, {
      itemType: 'todo',
      itemId: TODO_DONE,
      goalId: GOAL_ID,
      goalChapterId: CHAPTER_ID,
    })
    expect(first.ok).toBe(true)

    const moved = await syncItemGoalLink(session, {
      itemType: 'todo',
      itemId: TODO_DONE,
      goalId: GOAL_B,
      goalChapterId: null,
    })
    expect(moved.ok).toBe(true)

    const todoLinks = (await loadGoalLinks(session)).filter((link) => link.itemType === 'todo')
    expect(todoLinks).toHaveLength(1)
    expect(todoLinks[0]?.itemId).toBe(TODO_DONE)
    expect(todoLinks[0]?.goalId).toBe(GOAL_B)
    expect(todoLinks[0]?.chapterId).toBeNull()
  })

  it('tautan yatim (item dihapus) tidak dihitung progress', async () => {
    await persistGoal(session, goalOf())
    await syncItemGoalLink(session, {
      itemType: 'todo',
      itemId: TODO_DONE,
      goalId: GOAL_ID,
      goalChapterId: CHAPTER_ID,
    })

    const links = await loadGoalLinks(session)
    const [goal] = recordsToPresentations(
      await loadGoalRecords(session),
      links,
      { tasks: [], habits: [], checkIns: {}, schedules: [], attendance: {} },
      '2026-02-15',
    )
    expect(goal?.chapters[0]?.items).toEqual([])
  })
})
