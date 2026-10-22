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
  isMet,
  type CheckIns,
  type Habit,
  type HabitDraft,
} from '~/utils/habits'
import { loadHabits, persistCheckin, persistHabit } from '~/utils/habits/persistence'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepository, createRepositorySet } from '~/utils/storage/repository'
import type { LocalDataSession } from '~/utils/storage/session'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { MS_PER_HOUR, addDays, fromIsoDate } from '~/utils/time'

import { resetHabitsHydrationForTest, useHabits, type UseHabitsOptions } from './useHabits'

/**
 * QA T10 - verifikasi independen commit 561d73f (bukan ulangan test developer).
 *
 * Tiga hal yang dibuktikan di lapisan composable, karena inilah yang dipakai UI:
 * 1. aturan klik check-in sekarang SATU untuk semua hari (hari lampau tidak lagi "penuh sekali klik");
 * 2. warna habit bertahan setelah simpan -> hydrate sesi baru (bug lama: balik ke palet pertama);
 * 3. CRUD lengkap (rename, ubah target, hapus) tidak meninggalkan check-in yatim.
 *
 * Sesi data lokal di sini memakai adaptor memori core + kripto tiruan murah; jalur kripto sungguhan
 * diuji di `utils/habits/habit-color.test.ts`.
 */
const TODAY = '2026-10-19' // Senin
const NOW_MS = fromIsoDate(TODAY).getTime() + 9 * MS_PER_HOUR
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }

const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

type MemorySession = LocalDataSession & { readonly clock: ManualClock }

function memorySession(startMs: number = NOW_MS): MemorySession {
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

/** Sesi baru di atas penyimpanan yang sama - meniru halaman dimuat ulang, bukan state yang sama. */
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

function checkinRepo(session: LocalDataSession) {
  return createRepository<HabitCheckin>(session, 'habit_checkin')
}

const scopes: EffectScope[] = []

function useScopedHabits(options: UseHabitsOptions = {}) {
  const scope = effectScope()
  scopes.push(scope)
  const store = scope.run(() => useHabits(options))
  if (store === undefined) throw new Error('useHabits tidak menghasilkan store')
  return store
}

/** "Reload": seluruh state halaman dibuang, lalu hydrate dari sesi (baru) yang sama penyimpanannya. */
async function reload(session: MemorySession) {
  clearNuxtState(['habits', 'habitsCheckIns', 'habitsStatus', 'habitsError'])
  resetHabitsHydrationForTest()
  const store = useScopedHabits({ session: async () => reopen(session) })
  await store.hydrate()
  return store
}

/** Habit dengan target tertentu, dibuat lewat jalur UI (`save`) supaya ikut validasi & persistensi. */
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

function daysWithCount(checkIns: CheckIns, habitId: string): Record<string, number> {
  return checkIns[habitId] ?? {}
}

beforeEach(() => {
  clearNuxtState(['habits', 'habitsCheckIns', 'habitsStatus', 'habitsError', 'localData', 'now'])
  resetHabitsHydrationForTest()
  useState<number>('now').value = NOW_MS
})

afterEach(() => {
  for (const scope of scopes) scope.stop()
  scopes.length = 0
})

describe('check-in: satu aturan untuk hari ini & hari lampau (QA T10)', () => {
  it('hari lampau target 3: klik 1..3 menghasilkan 1,2,3 lalu klik ke-4 kembali 0 & record hilang', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const habit = await createHabit(store, { name: 'Minum air', target: 3 })
    const pastDay = addDays(TODAY, -4)

    for (const expected of [1, 2, 3]) {
      store.toggleDay(habit.id, pastDay)
      expect(countOn(store.checkIns.value, habit.id, pastDay)).toBe(expected)
      expect(isMet(store.findHabit(habit.id) ?? habit, store.checkIns.value, pastDay)).toBe(
        expected === 3,
      )
    }

    await vi.waitFor(async () => {
      const rows = await checkinRepo(session).listAll({ includeDeleted: false })
      expect(rows).toHaveLength(1)
      expect(rows[0]?.data).toMatchObject({ habitId: habit.id, localDate: pastDay, amount: 3 })
    })

    store.toggleDay(habit.id, pastDay)
    expect(countOn(store.checkIns.value, habit.id, pastDay)).toBe(0)

    await vi.waitFor(async () => {
      expect(await checkinRepo(session).listAll({ includeDeleted: false })).toEqual([])
    })

    // Reload: hari itu benar-benar kosong, bukan hanya di state.
    const reloaded = await reload(session)
    expect(daysWithCount(reloaded.checkIns.value, habit.id)).toEqual({})
  })

  it('hari ini target 3 mengikuti urutan yang sama (1,2,3 lalu 0)', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()
    const habit = await createHabit(store, { name: 'Push up', target: 3 })

    for (const expected of [1, 2, 3, 0]) {
      store.toggleDay(habit.id, TODAY)
      expect(countOn(store.checkIns.value, habit.id, TODAY)).toBe(expected)
    }

    await vi.waitFor(async () => {
      expect(await checkinRepo(session).listAll({ includeDeleted: false })).toEqual([])
    })
  })

  it('target 1: 0 → 1 → 0 untuk hari ini maupun hari lampau', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()
    const habit = await createHabit(store, { name: 'Baca buku', target: 1 })
    const pastDay = addDays(TODAY, -2)

    for (const day of [TODAY, pastDay]) {
      store.toggleDay(habit.id, day)
      expect(countOn(store.checkIns.value, habit.id, day)).toBe(1)
      store.toggleDay(habit.id, day)
      expect(countOn(store.checkIns.value, habit.id, day)).toBe(0)
    }
  })

  it('target 1 yang sudah tercapai: klik berikutnya mengosongkan, bukan menumpuk jadi 2', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()
    const habit = await createHabit(store, { name: 'Jurnal', target: 1 })

    store.toggleDay(habit.id, TODAY)
    store.toggleDay(habit.id, TODAY)
    store.toggleDay(habit.id, TODAY)

    expect(countOn(store.checkIns.value, habit.id, TODAY)).toBe(1)
  })

  it('check-in parsial hari lampau bertahan setelah sesi baru dibuka', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()
    const habit = await createHabit(store, { name: 'Minum air', target: 3 })
    const pastDay = addDays(TODAY, -3)

    store.toggleDay(habit.id, pastDay)
    store.toggleDay(habit.id, pastDay)

    await vi.waitFor(async () => {
      const rows = await checkinRepo(session).listAll({ includeDeleted: false })
      expect(rows[0]?.data).toMatchObject({ localDate: pastDay, amount: 2 })
    })

    const reloaded = await reload(session)
    expect(reloaded.checkIns.value[habit.id]).toEqual({ [pastDay]: 2 })
  })

  it('hari depan dan hari bukan jadwal tidak bisa di-check-in', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()
    const habit = await createHabit(store, { name: 'Senin saja', days: [1] })

    store.toggleDay(habit.id, addDays(TODAY, 1)) // Selasa besok: hari depan
    store.toggleDay(habit.id, '2026-10-13') // Selasa lalu: bukan jadwal
    expect(store.checkIns.value[habit.id]).toBeUndefined()

    await vi.waitFor(async () => {
      expect(await checkinRepo(session).listAll({ includeDeleted: false })).toEqual([])
    })
  })
})

describe('warna habit lewat composable (QA T10)', () => {
  it('simpan warna 5 → sesi baru → warna tetap 5 dan yang tersimpan hex palet', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const habit = await createHabit(store, { name: 'Jalan pagi', color: 5 })
    expect(habit.color).toBe(5)

    expect((await session.repos.habit.getById(habit.id))?.data).toMatchObject({ color: '#E6A800' })

    const reloaded = await reload(session)
    expect(reloaded.findHabit(habit.id)).toMatchObject({ color: 5, name: 'Jalan pagi' })
  })

  it('edit warna juga bertahan setelah sesi baru dibuka', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()
    const habit = await createHabit(store, { name: 'Meditasi', color: 0 })

    const edited = await store.save({ ...emptyHabitDraft(), name: 'Meditasi', color: 6 }, habit.id)
    if (!edited.ok) throw new Error('gagal edit')

    const reloaded = await reload(session)
    expect(reloaded.findHabit(habit.id)?.color).toBe(6)
  })
})

describe('regresi CRUD habit (QA T10)', () => {
  it('rename + ubah target tersimpan dan check-in lama tidak hilang', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()
    const habit = await createHabit(store, { name: 'Lari pagi', target: 1 })

    store.toggleDay(habit.id, addDays(TODAY, -1))
    store.toggleDay(habit.id, addDays(TODAY, -2))
    store.toggleDay(habit.id, TODAY)

    const edited = await store.save(
      { ...emptyHabitDraft(), name: '  Lari sore  ', target: 3, color: 2 },
      habit.id,
    )
    if (!edited.ok) throw new Error('gagal edit')
    expect(edited.id).toBe(habit.id)

    await vi.waitFor(async () => {
      const stored = (await session.repos.habit.getById(habit.id))?.data
      expect(stored).toMatchObject({ name: 'Lari sore', targetPerDay: 3, color: '#1DA20F' })
    })

    const reloaded = await reload(session)
    expect(reloaded.findHabit(habit.id)).toMatchObject({
      name: 'Lari sore',
      target: 3,
      color: 2,
    })
    expect(reloaded.checkIns.value[habit.id]).toEqual({
      [addDays(TODAY, -1)]: 1,
      [addDays(TODAY, -2)]: 1,
      [TODAY]: 1,
    })
    // Target naik: hari-hari yang sudah 1/3 belum dianggap tercapai.
    const afterEdit = reloaded.findHabit(habit.id)
    if (!afterEdit) throw new Error('habit hilang setelah reload')
    expect(isMet(afterEdit, reloaded.checkIns.value, TODAY)).toBe(false)
  })

  it('hapus habit menghapus seluruh check-in-nya, juga setelah sesi baru dibuka', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const kept = await createHabit(store, { name: 'Disiplin' })
    const dropped = await createHabit(store, { name: 'Baca buku' })

    store.toggleDay(kept.id, TODAY)
    store.toggleDay(dropped.id, TODAY)
    store.toggleDay(dropped.id, addDays(TODAY, -5))

    await vi.waitFor(async () => {
      expect(await checkinRepo(session).listAll({ includeDeleted: false })).toHaveLength(3)
    })

    expect(await store.remove(dropped.id)).toEqual({ ok: true })
    expect(store.findHabit(dropped.id)).toBeUndefined()
    expect(store.checkIns.value[dropped.id]).toBeUndefined()

    await vi.waitFor(async () => {
      expect(await checkinRepo(session).listAll({ includeDeleted: false })).toHaveLength(1)
    })

    const reloaded = await reload(session)
    expect(reloaded.habits.value.map((habit) => habit.name)).toEqual(['Disiplin'])
    expect(Object.keys(reloaded.checkIns.value)).toEqual([kept.id])
    expect(reloaded.checkIns.value[kept.id]).toEqual({ [TODAY]: 1 })
  })

  it('validasi menolak input tidak sah dan tidak menulis apa pun', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const cases: { draft: Partial<HabitDraft>; error: string }[] = [
      { draft: { name: '   ' }, error: 'nameRequired' },
      { draft: { name: 'x'.repeat(81) }, error: 'nameTooLong' },
      { draft: { name: 'Tanpa hari', days: [] }, error: 'noDays' },
      { draft: { name: 'Target nol', target: 0 }, error: 'target' },
      { draft: { name: 'Target kebesaran', target: 21 }, error: 'target' },
      { draft: { name: 'Target pecahan', target: 2.5 }, error: 'target' },
    ]

    for (const { draft, error } of cases) {
      const result = await store.save({ ...emptyHabitDraft(), ...draft }, null)
      expect(result).toEqual({ ok: false, error })
    }

    expect(store.habits.value).toEqual([])
    await vi.waitFor(async () => {
      expect((await loadHabits(session)).habits).toEqual([])
    })
  })
})

describe('arsip (QA T10)', () => {
  it('habit terarsip hilang dari daftar aktif, tidak bisa di-check-in, dan bisa dikembalikan', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const habit = await createHabit(store, { name: 'Baca buku' })
    expect(await store.setArchived(habit.id, true)).toEqual({ ok: true })

    expect(store.habits.value).toEqual([])
    expect(store.archivedHabits.value.map((item) => item.name)).toEqual(['Baca buku'])

    store.toggleDay(habit.id, TODAY)
    store.toggleToday(habit.id)
    expect(store.checkIns.value[habit.id]).toBeUndefined()

    const reloaded = await reload(session)
    expect(reloaded.habits.value).toEqual([])
    expect(reloaded.archivedHabits.value.map((item) => item.name)).toEqual(['Baca buku'])

    expect(await reloaded.setArchived(habit.id, false)).toEqual({ ok: true })
    expect(reloaded.habits.value.map((item) => item.name)).toEqual(['Baca buku'])
  })

  it('habit terarsip tetap punya riwayat check-in saat dikembalikan', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()
    const habit = await createHabit(store, { name: 'Jurnal' })

    store.toggleDay(habit.id, addDays(TODAY, -1))
    await vi.waitFor(async () => {
      expect(await checkinRepo(session).listAll({ includeDeleted: false })).toHaveLength(1)
    })

    await store.setArchived(habit.id, true)
    const reloaded = await reload(session)
    await reloaded.setArchived(habit.id, false)

    expect(reloaded.checkIns.value[habit.id]).toEqual({ [addDays(TODAY, -1)]: 1 })
    // Bukti arsip tidak menyentuh riwayat: record masih ada di penyimpanan.
    expect(await checkinRepo(session).listAll({ includeDeleted: false })).toHaveLength(1)
    expect((await loadHabits(session)).habits[0]).toMatchObject({ isArchived: false })
  })
})

describe('fixture pemeriksaan (QA T10)', () => {
  it('check-in yang ditulis langsung ke penyimpanan terbaca sebagai hari yang sama', async () => {
    // Menjaga asumsi test di atas: `persistCheckin` + `loadHabits` memakai kunci tanggal lokal yang sama.
    const session = memorySession()
    const habit: Habit = {
      id: session.newId(),
      name: 'Kontrol',
      icon: 'star',
      sticker: null,
      color: 0,
      days: null,
      target: 1,
      goalId: null,
      isArchived: false,
    }
    await persistHabit(session, habit)
    await persistCheckin(session, { habitId: habit.id, localDate: TODAY, amount: 1 })

    const loaded = await loadHabits(session)
    expect(loaded.checkIns[habit.id]).toEqual({ [TODAY]: 1 })
  })
})
