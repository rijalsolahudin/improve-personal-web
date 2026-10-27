// @vitest-environment node
//
// QA T10 (verifikasi independen): jalur baca yang dipakai grid Habit / Daily / Overview harus tetap
// satu query rentang ber-index, bukan memindai seluruh riwayat dan bukan satu query per habit
// (N+1). Yang diukur di sini adalah BENTUK query & jumlah dekripsi saat hydrate, dengan sesi
// data lokal di atas adaptor memori core.
import { describe, expect, it } from 'vitest'

import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type EntityType,
  type SecureKeyMaterial,
  type StorageAdapter,
} from '@improve-personal/core'

import { HABIT_LOOKBACK_DAYS, type Habit } from '../habits'
import { createRecordWriter } from '../storage/record-writer'
import { createRepositorySet } from '../storage/repository'
import type { LocalDataSession } from '../storage/session'
import { createUuidV7Generator } from '../storage/uuid'
import { MS_PER_HOUR, addDays, fromIsoDate } from '../time'
import { loadHabits, persistHabit } from './persistence'
import { TEST_KID_WIRE } from '../../../tests/nuxt/record-key'

const TODAY = '2026-10-19'
const NOW_MS = fromIsoDate(TODAY).getTime() + 9 * MS_PER_HOUR
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }
const HABIT_COUNT = 3
/** Riwayat di luar jendela baca ikut ditulis: yang diuji adalah jumlah yang DIBACA, bukan disimpan. */
const CHECKIN_DAYS = 450

/**
 * Kripto tiruan yang menghitung dekripsi.
 *
 * Jalur kripto sungguhan diuji di `habit-color.test.ts` (IndexedDB + libsodium). Di sini kripto
 * sengaja murah supaya yang terukur adalah jumlah rekaman yang dibuka, bukan kecepatan sodium.
 */
function countingProvider() {
  const counts = { openRecord: 0, sealRecord: 0 }
  const provider: CryptoProvider = {
    sealRecord: async ({ plaintext }) => {
      counts.sealRecord += 1
      return Buffer.from(plaintext, 'utf8').toString('base64')
    },
    openRecord: async ({ blob }) => {
      counts.openRecord += 1
      return Buffer.from(blob, 'base64').toString('utf8')
    },
  }
  return { provider, counts }
}

/** Adaptor yang menghitung jenis query - bukti "ber-index, sekali, tanpa N+1". */
function countingStorage(base: StorageAdapter) {
  const counts: {
    queryByRange: number
    rowsFromRange: number
    listIndexByType: Partial<Record<EntityType, number>>
    getRecordsCalls: number
    recordsFetched: number
    getRecordCalls: number
  } = {
    queryByRange: 0,
    rowsFromRange: 0,
    listIndexByType: {},
    getRecordsCalls: 0,
    recordsFetched: 0,
    getRecordCalls: 0,
  }

  const storage: StorageAdapter = {
    ...base,
    queryByRange: async (query) => {
      counts.queryByRange += 1
      const rows = await base.queryByRange(query)
      counts.rowsFromRange += rows.length
      return rows
    },
    listIndexByType: async (entityType) => {
      counts.listIndexByType[entityType] = (counts.listIndexByType[entityType] ?? 0) + 1
      return base.listIndexByType(entityType)
    },
    getRecords: async (ids) => {
      counts.getRecordsCalls += 1
      counts.recordsFetched += ids.length
      return base.getRecords(ids)
    },
    getRecord: async (id) => {
      counts.getRecordCalls += 1
      return base.getRecord(id)
    },
  }

  return { storage, counts }
}

type InstrumentedSession = {
  readonly session: LocalDataSession
  readonly counts: ReturnType<typeof countingStorage>['counts']
  readonly crypto: ReturnType<typeof countingProvider>['counts']
}

function memorySession(): InstrumentedSession {
  const clock = createManualClock(NOW_MS)
  const { provider, counts: crypto } = countingProvider()
  const { storage, counts } = countingStorage(createMemoryStorage({ clock }))
  const hlc = createHlcGenerator({ deviceId: USER_ID, clock })

  const session: LocalDataSession = {
    storage,
    provider,
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
    repos: createRepositorySet({ storage, provider, dataKey: DATA_KEY }),
    writer: createRecordWriter({ storage, provider, dataKey: DATA_KEY, hlc, clock }),
  }

  return { session, counts, crypto }
}

function habitOf(session: LocalDataSession, index: number): Habit {
  return {
    id: session.newId(),
    name: `Habit ${index}`,
    icon: 'dumbbell',
    sticker: null,
    color: index,
    days: null,
    target: 1,
    goalId: null,
    isArchived: false,
  }
}

/** Tulis satu check-in langsung lewat writer (tanpa membaca ulang rentang seperti `persistCheckin`). */
async function seedCheckin(
  session: LocalDataSession,
  habitId: string,
  localDate: string,
): Promise<void> {
  await session.writer.write({
    type: 'habit_checkin',
    data: (id) => ({ id, habitId, localDate, amount: 1, checkinAt: NOW_MS }),
    index: { rangeStartMs: fromIsoDate(localDate).getTime(), rangeEndMs: null },
  })
}

describe('jalur baca habit (QA T10)', () => {
  it('hydrate memakai SATU query rentang untuk semua habit, tanpa memindai seluruh riwayat', async () => {
    const { session, counts, crypto } = memorySession()

    const habits = Array.from({ length: HABIT_COUNT }, (_, index) => habitOf(session, index))
    for (const habit of habits) await persistHabit(session, habit)
    for (const habit of habits) {
      for (let offset = 1; offset <= CHECKIN_DAYS; offset += 1) {
        await seedCheckin(session, habit.id, addDays(TODAY, -offset))
      }
    }

    // Hitungan di-reset setelah penyemaian: yang diukur hanya biaya hydrate.
    counts.queryByRange = 0
    counts.rowsFromRange = 0
    counts.listIndexByType = {}
    counts.getRecordsCalls = 0
    counts.recordsFetched = 0
    counts.getRecordCalls = 0
    crypto.openRecord = 0

    const loaded = await loadHabits(session)

    // Satu query rentang untuk SELURUH habit: tidak ada query per habit (N+1).
    expect(counts.queryByRange).toBe(1)
    // Riwayat check-in dibaca lewat index, bukan `listAll`/scan tabel check-in.
    expect(counts.listIndexByType.habit).toBe(1)
    expect(counts.listIndexByType.habit_checkin).toBeUndefined()
    // Daftar habit diambil satu batch, bukan `getById` per habit.
    expect(counts.getRecordsCalls).toBe(1)
    expect(counts.getRecordCalls).toBe(0)

    // Jendela baca = HABIT_LOOKBACK_DAYS hari ke belakang (hari ke-400 terpotong karena jendela
    // mulai pukul 09.00, sementara index check-in di tengah malam lokal).
    const windowDays = HABIT_LOOKBACK_DAYS - 1
    expect(counts.rowsFromRange).toBe(HABIT_COUNT * windowDays)
    // Terbukti dibatasi jendela, bukan seluruh isi database (3 × 450 baris tersimpan).
    expect(counts.rowsFromRange).toBeLessThan(HABIT_COUNT * CHECKIN_DAYS)

    // Semua yang dibaca dipakai: hari yang dimuat = baris yang didekripsi, tidak ada pembacaan sia-sia.
    const loadedDays = loaded.habits.reduce(
      (total, habit) => total + Object.keys(loaded.checkIns[habit.id] ?? {}).length,
      0,
    )
    expect(loadedDays).toBe(counts.rowsFromRange)
    // Dekripsi = baris rentang + 3 payload habit; tidak ada dekripsi riwayat di luar jendela.
    expect(crypto.openRecord).toBe(counts.rowsFromRange + HABIT_COUNT)
  })

  it('jumlah query tidak tumbuh bersama jumlah habit (bukan N+1)', async () => {
    const { session, counts } = memorySession()
    const single = habitOf(session, 0)
    await persistHabit(session, single)
    await seedCheckin(session, single.id, TODAY)

    counts.queryByRange = 0
    await loadHabits(session)
    const withOneHabit = counts.queryByRange

    const more = Array.from({ length: 9 }, (_, index) => habitOf(session, index + 1))
    for (const habit of more) await persistHabit(session, habit)

    counts.queryByRange = 0
    await loadHabits(session)

    expect(counts.queryByRange).toBe(withOneHabit)
    expect(counts.queryByRange).toBe(1)
  })
})
