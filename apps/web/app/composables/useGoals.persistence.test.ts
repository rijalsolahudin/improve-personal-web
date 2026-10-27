import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocalDataSession } from '~/utils/storage/session'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { emptyGoalDraft } from '~/utils/goals'
import { loadGoalRecords } from '~/utils/goals/persistence'

import { resetGoalsHydrationForTest, useGoals } from './useGoals'
import { TEST_KID_WIRE } from '../../tests/nuxt/record-key'

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

const STATE_KEYS = [
  'goals',
  'goalRecords',
  'goalLinks',
  'goalsStatus',
  'goalsError',
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
] as const

describe('useGoals di atas repository', () => {
  beforeEach(() => {
    clearNuxtState([...STATE_KEYS])
    resetGoalsHydrationForTest()
  })

  it('goal yang disimpan tetap ada setelah halaman dimuat ulang dari penyimpanan', async () => {
    const session = memorySession()
    const first = useGoals({ session: async () => session })
    await first.hydrate()

    const saved = first.save({ ...emptyGoalDraft(first.today.value), title: 'Belajar gitar' }, null)
    if (!('id' in saved)) throw new Error('gagal simpan')

    await vi.waitFor(async () => {
      const records = await loadGoalRecords(session)
      expect(records.goals.map((goal) => goal.title)).toContain('Belajar gitar')
    })

    // Reload penuh: state Nuxt + cache modul dibuang, hanya penyimpanan yang tersisa.
    clearNuxtState([...STATE_KEYS])
    resetGoalsHydrationForTest()
    const afterReload = useGoals({ session: async () => session })
    await afterReload.hydrate()

    expect(afterReload.goals.value.map((goal) => goal.title)).toContain('Belajar gitar')
    expect(afterReload.findGoal(saved.id)?.title).toBe('Belajar gitar')
  })
})
