import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type HabitCheckin,
  type ManualClock,
  type SecureKeyMaterial,
} from '@improve-personal/core'

import {
  countOn,
  emptyHabitDraft,
  type CheckIns,
  type Habit,
  type HabitDraft,
} from '~/utils/habits'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepository, createRepositorySet } from '~/utils/storage/repository'
import type { LocalDataSession } from '~/utils/storage/session'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { MS_PER_HOUR, addDays, fromIsoDate } from '~/utils/time'

import { resetHabitsHydrationForTest, useHabits, type UseHabitsOptions } from './useHabits'

/**
 * QA T10 - celah yang belum ditutup test lain: AC "check-in hari ini mengubah streak dengan benar"
 * dan "hari lampau dihitung sesuai aturan PRD".
 *
 * Test developer & QA sebelumnya membuktikan RUMUS streak (fungsi murni) dan CRUD/persistensi,
 * tapi tidak ada yang membuktikan bahwa aksi check-in lewat composable yang dipakai UI benar-benar
 * menggerakkan angka streak. Di sini yang diuji perilakunya:
 * 1. check-in hari ini menambah streak, klik kedua (batal) mengembalikannya;
 * 2. backfill hari lampau yang terlewat MENYAMBUNG streak (bukan hanya mengubah angka grid);
 * 3. hari bukan jadwal tidak bisa di-check-in dan tidak mengubah streak;
 * 4. angka streak yang sama muncul lagi setelah sesi dibuka ulang (persisten, bukan state halaman).
 *
 * Sesi memori + kripto tiruan murah dipakai supaya yang diuji wiring composable; jalur kripto
 * sungguhan ada di `utils/habits/persistence.test.ts`.
 */
const MONDAY = '2026-10-19' // Senin
const WEEK = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'] // Sen-Jum
const USER_ID = '018f2c4e-0000-7000-8000-00000000000b'
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }

const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

type MemorySession = LocalDataSession & { readonly clock: ManualClock }

function atNoon(iso: string): number {
  return fromIsoDate(iso).getTime() + 12 * MS_PER_HOUR
}

function memorySession(startMs: number): MemorySession {
  const clock = createManualClock(startMs)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: USER_ID, clock })

  return {
    storage,
    provider: fakeProvider,
    clock,
    dataKey: DATA_KEY,
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

/** Sesi baru di atas penyimpanan yang sama - meniru halaman dimuat ulang. */
function reopen(session: MemorySession): MemorySession {
  return {
    ...session,
    repos: createRepositorySet({
      storage: session.storage,
      provider: session.provider,
      dataKey: session.dataKey,
    }),
    writer: createRecordWriter({
      storage: session.storage,
      provider: session.provider,
      dataKey: session.dataKey,
      hlc: session.hlc,
      clock: session.clock,
    }),
  }
}

const scopes: EffectScope[] = []

function useScopedHabits(options: UseHabitsOptions = {}) {
  const scope = effectScope()
  scopes.push(scope)
  const store = scope.run(() => useHabits(options))
  if (store === undefined) throw new Error('useHabits tidak menghasilkan store')
  return store
}

async function reload(session: MemorySession) {
  clearNuxtState(['habits', 'habitsCheckIns', 'habitsStatus', 'habitsError'])
  resetHabitsHydrationForTest()
  const store = useScopedHabits({ session: async () => reopen(session) })
  await store.hydrate()
  return store
}

async function createHabit(
  store: ReturnType<typeof useScopedHabits>,
  draft: Partial<HabitDraft>,
): Promise<Habit> {
  const result = await store.save({ ...emptyHabitDraft(), ...draft }, null)
  if (!result.ok) throw new Error(`gagal menyimpan habit: ${result.error}`)
  const habit = store.findHabit(result.id)
  if (!habit) throw new Error('habit tidak ada di state setelah disimpan')
  return habit
}

function streak(store: ReturnType<typeof useScopedHabits>, habitId: string): number {
  const habit = store.findHabit(habitId)
  if (!habit) throw new Error(`habit ${habitId} tidak ada`)
  return store.streakOf(habit)
}

function daysOf(checkIns: CheckIns, habitId: string): Record<string, number> {
  return checkIns[habitId] ?? {}
}

/** Baris check-in yang benar-benar tersimpan (bukan state optimistis di composable). */
function storedCheckins(session: LocalDataSession) {
  return createRepository<HabitCheckin>(session, 'habit_checkin').listAll({ includeDeleted: false })
}

const WEEKDAYS_DRAFT: Partial<HabitDraft> = { days: [1, 2, 3, 4, 5] }

beforeEach(() => {
  clearNuxtState(['habits', 'habitsCheckIns', 'habitsStatus', 'habitsError', 'localData', 'now'])
  resetHabitsHydrationForTest()
  useState<number>('now').value = atNoon(MONDAY)
})

afterEach(() => {
  for (const scope of scopes) scope.stop()
  scopes.length = 0
})

describe('check-in mengubah streak (QA T10)', () => {
  it('hari ini: streak naik saat dicentang dan kembali saat centang dibatalkan', async () => {
    const session = memorySession(atNoon(MONDAY))
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const habit = await createHabit(store, { name: 'Olahraga', ...WEEKDAYS_DRAFT })
    for (const day of WEEK) store.toggleDay(habit.id, day)

    // 5 hari kerja pekan lalu terpenuhi; Senin ini belum dicentang, jadi streak belum bertambah.
    expect(streak(store, habit.id)).toBe(5)

    store.toggleToday(habit.id)
    expect(countOn(store.checkIns.value, habit.id, MONDAY)).toBe(1)
    expect(streak(store, habit.id)).toBe(6)

    store.toggleToday(habit.id)
    expect(countOn(store.checkIns.value, habit.id, MONDAY)).toBe(0)
    expect(streak(store, habit.id)).toBe(5)
  })

  it('backfill hari lampau yang terlewat menyambung streak sesuai aturan PRD', async () => {
    const friday = '2026-10-16'
    // Jam global ikut dimajukan: `today` di composable dibaca dari jam ini, bukan dari jam sesi.
    useState<number>('now').value = atNoon(friday)
    const session = memorySession(atNoon(friday))
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const habit = await createHabit(store, { name: 'Jalan kaki' })
    for (const day of ['2026-10-12', '2026-10-13', '2026-10-15']) store.toggleDay(habit.id, day)

    // Rabu 14 terlewat -> rantai berhenti di Kamis 15 (hari ini belum dicentang).
    expect(streak(store, habit.id)).toBe(1)

    // Backfill hari lampau yang bolong: Kamis, Rabu, Selasa, Senin tersambung lagi.
    store.toggleDay(habit.id, '2026-10-14')
    expect(streak(store, habit.id)).toBe(4)

    store.toggleToday(habit.id)
    expect(streak(store, habit.id)).toBe(5)
  })

  it('hari bukan jadwal tidak bisa dicentang dan tidak memutus streak', async () => {
    const session = memorySession(atNoon(MONDAY))
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const habit = await createHabit(store, { name: 'Kerja fokus', ...WEEKDAYS_DRAFT })
    store.toggleDay(habit.id, '2026-10-16')
    store.toggleDay(habit.id, '2026-10-15')
    expect(streak(store, habit.id)).toBe(2)

    // Sabtu 17 & Minggu 18 bukan jadwal; upaya check-in harus diabaikan tanpa memutus streak.
    store.toggleDay(habit.id, '2026-10-17')
    store.toggleDay(habit.id, '2026-10-18')
    expect(daysOf(store.checkIns.value, habit.id)).toEqual({
      '2026-10-15': 1,
      '2026-10-16': 1,
    })
    expect(streak(store, habit.id)).toBe(2)

    // Hari depan juga ditolak.
    store.toggleDay(habit.id, addDays(MONDAY, 1))
    expect(daysOf(store.checkIns.value, habit.id)).not.toHaveProperty(addDays(MONDAY, 1))
  })

  it('streak yang sama terbaca setelah halaman dimuat ulang', async () => {
    const session = memorySession(atNoon(MONDAY))
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const habit = await createHabit(store, { name: 'Baca buku', ...WEEKDAYS_DRAFT })
    for (const day of WEEK) store.toggleDay(habit.id, day)
    store.toggleToday(habit.id)

    await vi.waitFor(async () => {
      expect(await storedCheckins(session)).toHaveLength(6)
    })

    const reloaded = await reload(session)
    expect(reloaded.status.value).toBe('ready')
    expect(reloaded.findHabit(habit.id)).toMatchObject({ name: 'Baca buku', days: [1, 2, 3, 4, 5] })
    expect(daysOf(reloaded.checkIns.value, habit.id)).toEqual(
      Object.fromEntries([...WEEK, MONDAY].map((day) => [day, 1])),
    )
    expect(streak(reloaded, habit.id)).toBe(6)
  })
})
