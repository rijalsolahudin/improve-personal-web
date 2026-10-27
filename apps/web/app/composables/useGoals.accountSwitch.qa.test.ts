import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'
import { describe, expect, it, vi } from 'vitest'

import type { LocalDataSession } from '~/utils/storage/session'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import type { Goal } from '~/utils/goals'
import { persistGoal } from '~/utils/goals/persistence'

import { useGoals } from './useGoals'
import type { LocalDataState } from './useLocalData'
import { TEST_KID_WIRE } from '../../tests/nuxt/record-key'

/**
 * Ganti akun tanpa reload halaman (T18): goal akun sebelumnya tidak boleh terlihat di akun baru.
 *
 * Satu skenario per file: composable memasang `watch` di level modul, jadi beberapa skenario dalam
 * satu file bisa saling menulis state. Isolasi file = isolasi watcher.
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
    kid: TEST_KID_WIRE,
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
const USER_B = '018f2c4e-0000-7000-8000-00000000000b'
const GOAL_A = '0192f0a0-0000-7000-8000-000000000001'
const GOAL_B = '0192f0a0-0000-7000-8000-000000000002'

function readyState(userId: string): LocalDataState {
  return { status: 'ready', isFreshKey: false, deviceId: null, userId, error: null }
}

function goalOf(id: string, title: string): Goal {
  return {
    id,
    title,
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

describe('ganti akun di halaman Goals', () => {
  it('goal akun lama tidak tampil setelah akun berganti', async () => {
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

    const sessionA = memorySession(USER_A)
    const sessionB = memorySession(USER_B)
    await persistGoal(sessionA, goalOf(GOAL_A, 'Goal akun A'))
    await persistGoal(sessionB, goalOf(GOAL_B, 'Goal akun B'))

    let current = sessionA
    useState<LocalDataState>('localData').value = readyState(USER_A)

    const goals = useGoals({ session: async () => current })
    await goals.hydrate()
    expect(goals.goals.value.map((goal) => goal.title)).toEqual(['Goal akun A'])

    // Login akun lain tanpa reload halaman.
    current = sessionB
    useState<LocalDataState>('localData').value = readyState(USER_B)

    await vi.waitFor(() => {
      expect(goals.goals.value.map((goal) => goal.title)).toEqual(['Goal akun B'])
    })
    expect(goals.findGoal(GOAL_A)).toBeUndefined()
  })
})
