import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { syncItemGoalLink } from '~/utils/goals/links'
import { loadGoalRecords } from '~/utils/goals/persistence'
import { addMonths, toIsoDate } from '~/utils/time'
import type { LocalDataSession } from '~/utils/storage/session'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { resetSyncReloadersForTest, runSyncReloaders } from '~/utils/sync/refresh'
import { persistTask } from '~/utils/tasks/persistence'
import type { Task } from '~/utils/tasks'
import type { GoalDraft } from '~/utils/goals'

import { resetGoalLinksHydrationForTest } from './useGoalLinks'
import { resetGoalsHydrationForTest, useGoals } from './useGoals'
import { resetHabitsHydrationForTest } from './useHabits'
import { resetSchedulesHydrationForTest } from './useSchedules'
import { resetTasksHydrationForTest } from './useTasks'

/**
 * Urutan `RELOAD_ORDER` (goalLinks -> goals -> tasks) hanya benar kalau presentation goal dihitung
 * ULANG setelah task/habit/jadwal selesai dimuat. Kalau tidak, progress goal basi satu putaran:
 * angka di kartu goal masih memakai task versi lama sampai pull berikutnya (5 menit kemudian).
 *
 * Test ini menjalankan satu putaran reloader lewat registry - jalur yang sama dengan event pull - dan
 * memeriksa angka presentation, bukan state internal store.
 */

const START_MS = 1_700_000_000_000
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }
const DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d1'
const TODAY = toIsoDate(new Date())

const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

function memorySession(): LocalDataSession {
  const clock = createManualClock(START_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: DEVICE_ID, clock })

  return {
    storage,
    provider: fakeProvider,
    clock,
    dataKey: DATA_KEY,
    hlc,
    deviceId: DEVICE_ID,
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

function taskOf(id: string, title: string): Task {
  return {
    id,
    title,
    priority: 'medium',
    deadline: null,
    done: false,
    scheduleId: null,
    quadrant: null,
    position: 0,
  }
}

function goalDraft(): GoalDraft {
  return {
    title: 'Lari 10K',
    why: 'Sehat',
    category: 'kesehatan',
    status: 'aktif',
    start: TODAY,
    end: addMonths(TODAY, 3),
    chapters: [
      {
        key: 'base',
        sourceId: null,
        title: 'Base',
        start: TODAY,
        end: addMonths(TODAY, 1),
      },
    ],
  }
}

beforeEach(() => {
  clearNuxtState([
    'goals',
    'goalRecords',
    'goalsStatus',
    'goalsError',
    'goalLinks',
    'tasks',
    'tasksStatus',
    'tasksError',
    'habits',
    'habitsCheckIns',
    'habitsStatus',
    'habitsError',
    'schedules',
    'schedule-attendance',
    'schedulesStatus',
    'schedulesError',
    'localData',
    'now',
  ])
  resetGoalsHydrationForTest()
  resetGoalLinksHydrationForTest()
  resetTasksHydrationForTest()
  resetHabitsHydrationForTest()
  resetSchedulesHydrationForTest()
  resetSyncReloadersForTest()
})

describe('useGoals: presentation setelah putaran reload pull (AC T77)', () => {
  it('progress goal memakai task hasil pull, bukan versi lama satu putaran', async () => {
    const session = memorySession()
    const goals = useGoals({ session: async () => session })
    await goals.hydrate()

    const created = goals.save(goalDraft(), null)
    if ('error' in created) throw new Error('goal gagal disimpan')
    const goalId = created.id

    await vi.waitFor(async () => {
      const stored = await loadGoalRecords(session)
      expect(stored.goals.map((goal) => goal.id)).toContain(goalId)
    })

    const chapterId = goals.findGoal(goalId)?.chapters[0]?.id
    if (chapterId === undefined) throw new Error('goal tanpa chapter')

    // Task + tautannya ditulis di luar store ini - persis seperti hasil pull perangkat lain.
    const task = taskOf(session.newId(), 'Lari 5K')
    await persistTask(session, task)
    const link = await syncItemGoalLink(session, {
      itemType: 'todo',
      itemId: task.id,
      goalId,
      goalChapterId: chapterId,
    })
    expect(link.ok).toBe(true)

    await runSyncReloaders()
    await flushPromises()

    const item = goals.findGoal(goalId)?.chapters[0]?.items.find((entry) => entry.id === task.id)
    expect(item?.done).toBe(false)

    // Task yang sama dicentang di perangkat lain -> putaran reload berikutnya harus memperbarui goal.
    await persistTask(session, { ...task, done: true })
    await runSyncReloaders()
    await flushPromises()

    const updated = goals.findGoal(goalId)?.chapters[0]?.items.find((entry) => entry.id === task.id)
    expect(updated?.done).toBe(true)
  })
})
