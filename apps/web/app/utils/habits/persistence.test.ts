// @vitest-environment node
//
// Persistensi habit: `Habit` (UI) <-> record `habit` + `habit_checkin`, lewat sesi data lokal nyata
// (IndexedDB + kripto sungguhan).
//
// Yang diuji adalah hal yang gampang rusak tanpa terlihat: terjemahan hari, sticker & warna, `createdAt`
// yang tidak boleh berubah saat edit, satu baris check-in per hari, index rentang untuk heatmap,
// dan apakah data benar-benar bertahan setelah halaman dimuat ulang.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import { createManualClock, type HabitCheckin, type ManualClock } from '@improve-personal/core'

import type { Habit } from '../habits'
import { createRepository } from '../storage/repository'
import { openLocalDataSession, type LocalDataSession } from '../storage/session'
import { MS_PER_DAY, addDays, fromIsoDate } from '../time'
import { loadCheckIns, loadHabits, persistCheckin, persistHabit, removeHabit } from './persistence'

const TODAY = '2026-10-19' // Senin
const START_MS = fromIsoDate(TODAY).getTime() + 9 * 3_600_000
/** Akun uji: penyimpanan lokal dipisah per akun (lihat `account-scope.test.ts`). */
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'

/**
 * Runtime test (node) tidak punya syarat browser yang diperiksa `openLocalDataSession`
 * (`isSecureContext`, `navigator.locks`). Dinyatakan di sini supaya yang diuji adalah pemetaan
 * habit <-> record, bukan kelengkapan browser.
 */
Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })

let counter = 0

function names() {
  counter += 1
  return {
    databaseName: `ip-habits-test-${counter}`,
    keysDatabaseName: `ip-habits-test-keys-${counter}`,
  }
}

type OpenSession = LocalDataSession & { readonly clock: ManualClock }

async function openSession(dbNames: ReturnType<typeof names>): Promise<OpenSession> {
  const clock = createManualClock(START_MS)
  const session = await openLocalDataSession({ userId: USER_ID, clock, ...dbNames })
  return { ...session, clock }
}

function habitOf(session: LocalDataSession, overrides: Partial<Omit<Habit, 'id'>> = {}): Habit {
  return {
    id: session.newId(),
    name: 'Olahraga',
    icon: 'dumbbell',
    sticker: null,
    color: 3,
    days: null,
    target: 1,
    goalId: null,
    isArchived: false,
    ...overrides,
  }
}

/**
 * Tulis payload `habit` MENTAH (melewati `toCoreHabit`), untuk mensimulasikan record dari versi lain:
 * record lama yang belum punya key `color`, atau hex di luar palet UI.
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

describe('persistensi habit', () => {
  it('simpan lalu muat: jadwal, target, dan sticker kembali utuh', async () => {
    const session = await openSession(names())
    const saved = habitOf(session, {
      name: 'Lari pagi',
      sticker: 'aktivitas/belajar',
      days: [1, 2, 3, 4, 5],
      target: 2,
    })

    await persistHabit(session, saved)

    expect((await loadHabits(session)).habits).toEqual([
      expect.objectContaining({
        id: saved.id,
        name: 'Lari pagi',
        sticker: 'aktivitas/belajar',
        days: [1, 2, 3, 4, 5],
        target: 2,
        isArchived: false,
      }),
    ])
  })

  it('warna habit bertahan setelah sesi dibuka ulang: disimpan sebagai hex palet, dibaca jadi index', async () => {
    const dbNames = names()
    const first = await openSession(dbNames)
    const saved = habitOf(first, { color: 5 })

    await persistHabit(first, saved)

    // Yang ditulis adalah hex, bukan index: urutan palet di UI boleh berubah tanpa mengubah warnanya.
    expect((await first.repos.habit.getById(saved.id))?.data).toMatchObject({ color: '#E6A800' })

    const reopened = await openSession(dbNames)
    // Regresi bug: sebelumnya warna selalu kembali ke palet pertama (0) setelah reload.
    expect((await loadHabits(reopened)).habits[0]?.color).toBe(5)
  })

  it('record habit lama tanpa key color tetap terbaca dan memakai warna default', async () => {
    const session = await openSession(names())
    const id = await writeRawHabit(session, { name: 'Habit lama' })

    const loaded = await loadHabits(session)

    expect(loaded.habits).toEqual([expect.objectContaining({ id, name: 'Habit lama', color: 0 })])
  })

  it('color berisi hex di luar palet dibaca sebagai warna default, tidak melempar', async () => {
    const session = await openSession(names())
    const id = await writeRawHabit(session, { color: '#123456' })

    await expect(loadHabits(session)).resolves.toMatchObject({
      habits: [expect.objectContaining({ id, color: 0 })],
    })
  })

  it('hex palet dikenali tanpa peduli huruf besar/kecil', async () => {
    const session = await openSession(names())
    const id = await writeRawHabit(session, { color: '#e6a800' })

    expect((await loadHabits(session)).habits).toEqual([expect.objectContaining({ id, color: 5 })])
  })

  it('habit harian disimpan tanpa daftar hari, bukan daftar kosong', async () => {
    const session = await openSession(names())
    const saved = habitOf(session, { days: null })

    await persistHabit(session, saved)

    const stored = await session.repos.habit.getById(saved.id)
    expect(stored?.data).toMatchObject({ frequencyType: 'daily', frequencyDays: null })
    expect((await loadHabits(session)).habits[0]?.days).toBeNull()
  })

  it('status arsip ditulis ke record core dan bertahan setelah sesi dibuka ulang', async () => {
    const dbNames = names()
    const first = await openSession(dbNames)
    const saved = habitOf(first, { name: 'Meditasi' })

    await persistHabit(first, saved)
    expect((await loadHabits(first)).habits[0]?.isArchived).toBe(false)

    await persistHabit(first, { ...saved, isArchived: true })

    const reopened = await openSession(dbNames)
    expect((await reopened.repos.habit.getById(saved.id))?.data).toMatchObject({
      isArchived: true,
    })
    expect((await loadHabits(reopened)).habits[0]).toMatchObject({
      id: saved.id,
      isArchived: true,
    })
  })

  it('data tersimpan terenkripsi: nama habit tidak terlihat di blob', async () => {
    const session = await openSession(names())
    await persistHabit(session, habitOf(session, { name: 'Rahasia pribadi' }))
    const [row] = await session.storage.listIndexByType('habit')
    const stored = await session.storage.getRecord(row!.recordId)

    expect(stored?.blob).not.toContain('Rahasia pribadi')
    expect(await loadHabits(session)).toMatchObject({
      habits: [expect.objectContaining({ name: 'Rahasia pribadi' })],
    })
  })

  it('edit mempertahankan createdAt dan memperbarui updatedAt', async () => {
    const session = await openSession(names())
    const saved = habitOf(session)

    await persistHabit(session, saved)
    session.clock.advance(60_000)
    await persistHabit(session, { ...saved, name: 'Olahraga pagi', target: 3 })
    const payload = (await session.repos.habit.getById(saved.id))?.data
    expect(payload).toMatchObject({
      name: 'Olahraga pagi',
      targetPerDay: 3,
      createdAt: START_MS,
      updatedAt: START_MS + 60_000,
    })
  })

  it('check-in satu baris per hari: akumulasi menimpa, nol menghapus', async () => {
    const session = await openSession(names())
    const saved = habitOf(session)
    await persistHabit(session, saved)

    await persistCheckin(session, { habitId: saved.id, localDate: TODAY, amount: 1 })
    session.clock.advance(1000)
    await persistCheckin(session, { habitId: saved.id, localDate: TODAY, amount: 3 })
    const checkins = createRepository<HabitCheckin>(session, 'habit_checkin')
    const rows = await checkins.listAll({ includeDeleted: false })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.data).toMatchObject({ habitId: saved.id, localDate: TODAY, amount: 3 })

    await persistCheckin(session, { habitId: saved.id, localDate: TODAY, amount: 0 })
    expect(await checkins.listAll({ includeDeleted: false })).toEqual([])
    expect((await loadHabits(session)).checkIns).toEqual({})
  })

  it('check-in bisa dibaca per rentang lewat index (heatmap), bukan seluruh riwayat', async () => {
    const session = await openSession(names())
    const saved = habitOf(session)
    await persistHabit(session, saved)

    const monday = TODAY
    const wednesday = '2026-10-21'
    await persistCheckin(session, { habitId: saved.id, localDate: monday, amount: 1 })
    await persistCheckin(session, { habitId: saved.id, localDate: wednesday, amount: 1 })

    const mondayOnly = await loadCheckIns(session, {
      fromMs: fromIsoDate(monday).getTime(),
      toMs: fromIsoDate(monday).getTime() + MS_PER_DAY - 1,
    })

    expect(mondayOnly.map((checkin) => checkin.localDate)).toEqual([monday])
  })

  it('check-in sebelum tanggal habit dibuat tetap terbaca setelah sesi dibuka ulang', async () => {
    const dbNames = names()
    const first = await openSession(dbNames)
    // Habit lahir hari ini, tapi UI mengizinkan backfill ke hari-hari sebelumnya.
    const saved = habitOf(first)
    await persistHabit(first, saved)

    const backfill = [-7, -6, -5, -4, -3, -2, -1].map((offset) => addDays(TODAY, offset))
    for (const localDate of backfill) {
      await persistCheckin(first, { habitId: saved.id, localDate, amount: 1 })
    }

    const reopened = await openSession(dbNames)
    const loaded = await loadHabits(reopened)

    expect(loaded.checkIns[saved.id]).toEqual(Object.fromEntries(backfill.map((day) => [day, 1])))
  })

  it('hapus habit ikut menghapus check-in dan tidak hidup lagi setelah sesi dibuka ulang', async () => {
    const dbNames = names()
    const first = await openSession(dbNames)
    const saved = habitOf(first)
    await persistHabit(first, saved)
    await persistCheckin(first, { habitId: saved.id, localDate: TODAY, amount: 1 })

    await removeHabit(first, saved.id)
    expect(await loadHabits(first)).toEqual({ habits: [], checkIns: {} })

    const reopened = await openSession(dbNames)
    expect(await loadHabits(reopened)).toEqual({ habits: [], checkIns: {} })
    // Tombstone tetap ada supaya penghapusan ikut tersinkron.
    const tombstones = await reopened.storage.listIndexByType('habit_checkin')
    expect(tombstones.length).toBeGreaterThan(0)
  })

  it('hapus habit menyapu check-in di luar jendela baca, bukan menyisakan baris yatim', async () => {
    const session = await openSession(names())
    const saved = habitOf(session)
    await persistHabit(session, saved)

    // Satu di dalam jendela baca (sekitar `createdAt`), satu jauh sebelum habit dibuat:
    // keduanya sah karena UI mengizinkan backfill, dan keduanya harus ikut terhapus.
    await persistCheckin(session, { habitId: saved.id, localDate: TODAY, amount: 1 })
    await persistCheckin(session, {
      habitId: saved.id,
      localDate: addDays(TODAY, -48),
      amount: 1,
    })

    const checkins = createRepository<HabitCheckin>(session, 'habit_checkin')
    const before = await checkins.listAll({ includeDeleted: true })
    expect(before).toHaveLength(2)

    await removeHabit(session, saved.id)

    // Tidak ada baris hidup yang tertinggal...
    expect(await checkins.listAll({ includeDeleted: false })).toEqual([])
    // ...semua yang tersisa adalah tombstone, dan tiap tombstone punya outbox `delete`
    // supaya penghapusan ikut tersinkron ke perangkat lain.
    const tombstones = await checkins.listAll({ includeDeleted: true })
    expect(tombstones.map((record) => record.id).sort()).toEqual(
      before.map((record) => record.id).sort(),
    )
    expect(tombstones.every((record) => record.deleted)).toBe(true)

    const deletedRecordIds = (await session.storage.listOutbox(100))
      .filter((row) => row.op === 'delete')
      .map((row) => row.recordId)
    for (const tombstone of tombstones) expect(deletedRecordIds).toContain(tombstone.id)
    expect(deletedRecordIds).toContain(saved.id)
  })

  it('data bertahan setelah halaman dimuat ulang (sesi baru, database sama)', async () => {
    const dbNames = names()
    const first = await openSession(dbNames)
    const saved = habitOf(first, { name: 'Meditasi', days: [1, 3, 5], target: 2 })

    await persistHabit(first, saved)
    await persistCheckin(first, { habitId: saved.id, localDate: TODAY, amount: 1 })

    const reopened = await openSession(dbNames)
    const loaded = await loadHabits(reopened)

    expect(loaded.habits).toEqual([
      expect.objectContaining({ id: saved.id, name: 'Meditasi', days: [1, 3, 5], target: 2 }),
    ])
    expect(loaded.checkIns).toEqual({ [saved.id]: { [TODAY]: 1 } })
  })
})
