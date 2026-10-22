// @vitest-environment node
//
// QA T10 (verifikasi independen, commit 561d73f): warna habit harus BERTAHAN setelah simpan lalu
// muat ulang sesi - bug lama membuat warna kembali ke palet pertama setiap reload.
//
// Diuji di lapisan persistensi dengan IndexedDB + libsodium sungguhan (bukan tiruan), karena yang
// diperiksa adalah round-trip `index palet UI` <-> `hex core` beserta toleransi record lama.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import { createManualClock } from '@improve-personal/core'

import { HABIT_COLORS, type Habit } from '../habits'
import { openLocalDataSession, type LocalDataSession } from '../storage/session'
import { fromIsoDate } from '../time'
import { loadHabits, persistHabit } from './persistence'

const TODAY = '2026-10-19'
const START_MS = fromIsoDate(TODAY).getTime() + 9 * 3_600_000
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'

/** Runtime node tidak punya syarat browser yang diperiksa `openLocalDataSession`. */
Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })

let counter = 0

function names(): { databaseName: string; keysDatabaseName: string } {
  counter += 1
  return {
    databaseName: `ip-habit-color-${counter}`,
    keysDatabaseName: `ip-habit-color-keys-${counter}`,
  }
}

async function openSession(dbNames: ReturnType<typeof names>): Promise<LocalDataSession> {
  return openLocalDataSession({ userId: USER_ID, clock: createManualClock(START_MS), ...dbNames })
}

function habitOf(session: LocalDataSession, overrides: Partial<Omit<Habit, 'id'>> = {}): Habit {
  return {
    id: session.newId(),
    name: 'Olahraga',
    icon: 'dumbbell',
    sticker: null,
    color: 0,
    days: null,
    target: 1,
    goalId: null,
    isArchived: false,
    ...overrides,
  }
}

/**
 * Tulis payload `habit` mentah (melewati `toCoreHabit`) untuk mensimulasikan record dari versi lain:
 * record lama sebelum `color` ada, atau hex di luar palet UI.
 */
async function writeRawHabit(
  session: LocalDataSession,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const id = session.newId()

  await session.writer.write({
    id,
    type: 'habit',
    data: (recordId) => ({
      id: recordId,
      name: 'Habit mentah',
      iconSticker: 'star',
      frequencyType: 'daily',
      frequencyDays: null,
      targetPerDay: 1,
      isArchived: false,
      createdAt: START_MS,
      updatedAt: START_MS,
      ...overrides,
    }),
    index: null,
  })

  return id
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('warna habit bertahan setelah reload (QA T10)', () => {
  it('semua warna palet kembali ke index yang sama setelah sesi baru dibuka', async () => {
    const dbNames = names()
    const first = await openSession(dbNames)
    const saved = HABIT_COLORS.map((_, index) =>
      habitOf(first, { color: index, name: `W${index}` }),
    )

    for (const habit of saved) await persistHabit(first, habit)

    const reopened = await openSession(dbNames)
    const loaded = await loadHabits(reopened)
    const colorById = new Map(loaded.habits.map((habit) => [habit.id, habit.color]))

    // Regresi bug: sebelum fix, SEMUA habit kembali `0` setelah reload.
    expect(saved.map((habit) => colorById.get(habit.id))).toEqual(saved.map((habit) => habit.color))
  })

  it('yang disimpan ke core adalah hex palet, bukan index (index UI boleh berubah urutan)', async () => {
    const session = await openSession(names())
    const saved = habitOf(session, { color: 5 })

    await persistHabit(session, saved)

    expect((await session.repos.habit.getById(saved.id))?.data).toMatchObject({ color: '#E6A800' })
  })

  it('record lama tanpa key `color` terbaca sebagai warna default, tanpa melempar', async () => {
    const session = await openSession(names())
    const id = await writeRawHabit(session, { name: 'Habit lama' })

    await expect(loadHabits(session)).resolves.toMatchObject({
      habits: [expect.objectContaining({ id, name: 'Habit lama', color: 0 })],
    })
  })

  it('hex di luar palet terbaca sebagai warna default, tanpa melempar', async () => {
    const session = await openSession(names())
    const id = await writeRawHabit(session, { color: '#123456' })

    await expect(loadHabits(session)).resolves.toMatchObject({
      habits: [expect.objectContaining({ id, color: 0 })],
    })
  })

  it('hex dari perangkat lain tetap dikenali walau huruf/spasi berbeda', async () => {
    const session = await openSession(names())
    const lower = await writeRawHabit(session, { color: '#e6a800' })
    const padded = await writeRawHabit(session, { color: ' #FF6A13 ' })

    const loaded = await loadHabits(session)
    const colorById = new Map(loaded.habits.map((habit) => [habit.id, habit.color]))

    expect(colorById.get(lower)).toBe(5)
    expect(colorById.get(padded)).toBe(1)
  })

  it('index palet di luar jangkauan tidak disimpan sebagai hex karangan', async () => {
    const session = await openSession(names())
    const saved = habitOf(session, { color: 99 })

    await persistHabit(session, saved)

    // `null` = "pakai warna default UI", bukan tebakan hex yang bisa berubah arti.
    expect((await session.repos.habit.getById(saved.id))?.data).toMatchObject({ color: null })
    expect((await loadHabits(session)).habits[0]?.color).toBe(0)
  })

  it('warna tidak hilang saat habit diedit (nama & target berubah)', async () => {
    const dbNames = names()
    const first = await openSession(dbNames)
    const saved = habitOf(first, { color: 3, name: 'Lari pagi' })
    await persistHabit(first, saved)

    await persistHabit(first, { ...saved, name: 'Lari sore', target: 3 })

    const reopened = await openSession(dbNames)
    expect((await loadHabits(reopened)).habits).toEqual([
      expect.objectContaining({ name: 'Lari sore', target: 3, color: 3 }),
    ])
  })

  it('warna `null` eksplisit dari platform lain juga jadi warna default', async () => {
    const session = await openSession(names())
    const id = await writeRawHabit(session, { color: null })

    expect((await loadHabits(session)).habits).toEqual([expect.objectContaining({ id, color: 0 })])
  })
})
