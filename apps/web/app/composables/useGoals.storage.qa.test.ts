import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'
import { describe, expect, it } from 'vitest'

import type { LocalDataSession } from '~/utils/storage/session'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import type { Goal } from '~/utils/goals'
import { persistGoal } from '~/utils/goals/persistence'

import { resetGoalLinksHydrationForTest } from './useGoalLinks'
import { resetGoalsHydrationForTest, useGoals } from './useGoals'
import { resetHabitsHydrationForTest } from './useHabits'
import type { LocalDataState } from './useLocalData'
import { resetSchedulesHydrationForTest } from './useSchedules'
import { resetTasksHydrationForTest } from './useTasks'

/**
 * Sumber data Goals di atas penyimpanan sungguhan (T18, catatan QA #31 N5/B6).
 *
 * Yang membedakan "data user" dari "mock/cache":
 * - sesi kosong tetap kosong setelah hydrate (tidak ada 5 goal contoh),
 * - state Goals + cache modul dibuang → daftar dibaca ulang dari penyimpanan.
 *
 * Ganti akun diuji terpisah (`useGoals.accountSwitch.qa.test.ts`) supaya watcher dari satu kasus
 * tidak ikut menulis state kasus lain.
 */

const NOW_MS = 1_700_000_000_000
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }

const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

function memorySession(userId: string): LocalDataSession {
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
    userId,
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

const USER_A = '018f2c4e-0000-7000-8000-00000000000a'
const GOAL_A = '0192f0a0-0000-7000-8000-000000000001'

function readyState(userId: string): LocalDataState {
  return { status: 'ready', isFreshKey: false, deviceId: null, userId, error: null }
}

function goalOf(): Goal {
  return {
    id: GOAL_A,
    title: 'Lari 10K',
    why: '',
    category: 'kesehatan',
    status: 'aktif',
    start: '2026-01-05',
    end: '2026-03-31',
    cover: null,
    along: [],
    chapters: [],
  }
}

function resetModuleCaches(): void {
  resetGoalsHydrationForTest()
  resetGoalLinksHydrationForTest()
  resetTasksHydrationForTest()
  resetHabitsHydrationForTest()
  resetSchedulesHydrationForTest()
}

describe('Goals di atas penyimpanan sungguhan', () => {
  it('sesi kosong tetap kosong setelah hydrate (tidak ada goal contoh)', async () => {
    clearNuxtState([
      'goals',
      'goalRecords',
      'goalLinks',
      'goalsStatus',
      'goalsError',
      'tasks',
      'habits',
      'habitsCheckIns',
      'schedules',
      'localData',
    ])
    resetModuleCaches()

    const session = memorySession(USER_A)
    useState<LocalDataState>('localData').value = readyState(USER_A)

    const { goals, status, hydrate } = useGoals({ session: async () => session })
    await hydrate()

    expect(status.value).toBe('ready')
    expect(goals.value).toEqual([])
  })

  it('daftar goal dibaca ulang dari penyimpanan setelah state & cache modul dibuang', async () => {
    clearNuxtState(['goals', 'goalLinks', 'goalsStatus', 'goalsError'])
    resetModuleCaches()

    const session = memorySession(USER_A)
    await persistGoal(session, goalOf())
    useState<LocalDataState>('localData').value = readyState(USER_A)

    const first = useGoals({ session: async () => session })
    await first.hydrate()
    expect(first.goals.value.map((goal) => goal.title)).toEqual(['Lari 10K'])

    // Buang state Goals + cache modul: satu-satunya sumber yang tersisa adalah penyimpanan.
    clearNuxtState(['goals', 'goalLinks', 'goalsStatus', 'goalsError'])
    resetModuleCaches()

    const afterReload = useGoals({ session: async () => session })
    await afterReload.hydrate()

    expect(afterReload.goals.value.map((goal) => goal.title)).toEqual(['Lari 10K'])
  })
})
