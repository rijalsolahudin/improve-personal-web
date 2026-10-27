import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'

import { loadCountdowns, persistCountdown } from '~/utils/countdown/persistence'
import { newCountdownDraft, type Countdown } from '~/utils/countdown'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import type { LocalDataSession } from '~/utils/storage/session'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { addDays, deviceTimeZone, toIsoDate } from '~/utils/time'

import { resetCountdownsHydrationForTest, useCountdowns } from './useCountdowns'
import { TEST_KID_WIRE } from '../../tests/nuxt/record-key'

const START_MS = 1_700_000_000_000
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const TZ = deviceTimeZone()
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }

const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

function memorySession(): LocalDataSession {
  const clock = createManualClock(START_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: USER_ID, clock })

  return {
    storage,
    provider: fakeProvider,
    clock,
    dataKey: DATA_KEY,
    kid: TEST_KID_WIRE,
    hlc,
    deviceId: USER_ID,
    userId: USER_ID,
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

function storedCountdown(session: LocalDataSession, overrides: Partial<Countdown> = {}): Countdown {
  return {
    id: session.newId(),
    title: 'Ulang tahun',
    date: addDays(toIsoDate(new Date()), 10),
    time: '',
    emoji: '🎂',
    sticker: null,
    color: '#F03FBF',
    yearly: true,
    archived: false,
    ...overrides,
  }
}

beforeEach(() => {
  clearNuxtState(['countdowns', 'countdownsStatus', 'countdownsError'])
  resetCountdownsHydrationForTest()
})

describe('useCountdowns', () => {
  it('simpan countdown baru: state langsung berubah dan tersimpan', async () => {
    const session = memorySession()
    const { countdowns, save, hydrate } = useCountdowns({ session: async () => session })
    await hydrate()

    const draft = { ...newCountdownDraft(toIsoDate(new Date())), title: '  Liburan  ' }
    draft.date = addDays(draft.date, 20)
    expect(save(draft, null)).toEqual({ ok: true })
    expect(countdowns.value).toHaveLength(1)

    await vi.waitFor(async () => {
      const stored = await loadCountdowns(session, TZ)
      expect(stored.map((item) => item.title)).toContain('Liburan')
    })
  })

  it('hydrate memuat countdown tersimpan (termasuk yearly & sepanjang hari)', async () => {
    const session = memorySession()
    const existing = storedCountdown(session)
    await persistCountdown(session, existing, TZ)

    const { countdowns, hydrate, status } = useCountdowns({ session: async () => session })
    await hydrate()

    expect(status.value).toBe('ready')
    expect(countdowns.value).toEqual([existing])
  })

  it('arsip & hapus ikut tersimpan', async () => {
    const session = memorySession()
    const existing = storedCountdown(session)
    await persistCountdown(session, existing, TZ)

    const { toggleArchive, remove, hydrate } = useCountdowns({ session: async () => session })
    await hydrate()

    toggleArchive(existing.id)
    await vi.waitFor(async () => {
      expect((await loadCountdowns(session, TZ))[0]?.archived).toBe(true)
    })

    remove(existing.id)
    await vi.waitFor(async () => {
      expect(await loadCountdowns(session, TZ)).toEqual([])
    })
  })

  it('tanpa sesi (SSR): daftar kosong dan status idle, bukan error', async () => {
    const { countdowns, hydrate, status } = useCountdowns({ session: async () => null })
    await hydrate()

    expect(countdowns.value).toEqual([])
    expect(status.value).toBe('idle')
  })
})
