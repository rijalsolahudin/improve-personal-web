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

import { countOn, emptyHabitDraft, isMet, type Habit, type HabitDraft } from '~/utils/habits'
import { loadHabits, persistCheckin, persistHabit } from '~/utils/habits/persistence'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepository, createRepositorySet } from '~/utils/storage/repository'
import type { LocalDataSession } from '~/utils/storage/session'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { MS_PER_DAY, MS_PER_HOUR, addDays, fromIsoDate } from '~/utils/time'

import type { LocalDataState } from './useLocalData'
import { resetHabitsHydrationForTest, useHabits, type UseHabitsOptions } from './useHabits'

/** 2026-10-19 = Senin; akhir pekan 17–18 tidak terjadwal untuk habit Senin–Jumat. */
const TODAY = '2026-10-19'
const NOW_MS = fromIsoDate(TODAY).getTime() + 9 * MS_PER_HOUR
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }

/**
 * Kripto tiruan untuk test composable.
 *
 * Jalur kripto sungguhan diuji di `utils/habits/persistence.test.ts` (IndexedDB + libsodium); di sini
 * yang diuji WIRING-nya (hydrate, antrean tulis, state), jadi ciphertext tidak perlu asli.
 */
const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

/**
 * Sesi + jam manualnya.
 *
 * Jam dikembalikan terpisah (tipe `Clock` di sesi tidak punya `advance`) supaya test bisa
 * memundurkan waktu pembuatan habit - habit pekan lalu tidak mungkin dibuat hari ini.
 */
type MemorySession = LocalDataSession & { readonly clock: ManualClock }

/** Sesi data lokal palsu di atas adaptor memori core - semua port lain nyata. */
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
    // Test ini tidak pernah membuat envelope kunci; bentuknya mengikuti kontrak sesi.
    withMasterKey: async (work) => work(new Uint8Array(32)),
    repos: createRepositorySet({ storage, provider: fakeProvider, dataKey: DATA_KEY }),
    writer: createRecordWriter({ storage, provider: fakeProvider, dataKey: DATA_KEY, hlc, clock }),
  }
}

function habitOf(id: string, overrides: Partial<Omit<Habit, 'id'>> = {}): Habit {
  return {
    id,
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

function checkinRepo(session: LocalDataSession) {
  return createRepository<HabitCheckin>(session, 'habit_checkin')
}

/**
 * Sesi yang `listAll` habit-nya ditahan setelah snapshot diambil.
 *
 * Dipakai untuk membuat jendela balapan hydrate deterministik: snapshot database sudah dibaca
 * (kosong), tetapi hasilnya belum diberikan ke composable - tepat saat user menyimpan habit.
 */
function gatedHabitList(session: MemorySession) {
  const habitRepo = session.repos.habit
  let release: () => void = () => undefined
  let markSnapshot: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const snapshotTaken = new Promise<void>((resolve) => {
    markSnapshot = resolve
  })

  const gated: MemorySession = {
    ...session,
    repos: {
      ...session.repos,
      habit: {
        ...habitRepo,
        listAll: async (options) => {
          const rows = await habitRepo.listAll(options)
          markSnapshot()
          await gate
          return rows
        },
      },
    },
  }

  return { gated, snapshotTaken, release: () => release() }
}

/** Sesi dengan satu operasi tulis yang selalu gagal - untuk menguji rollback. */
function withFailingWrite(session: MemorySession): MemorySession {
  return {
    ...session,
    writer: {
      ...session.writer,
      write: async () => {
        throw new Error('penyimpanan penuh')
      },
    },
  }
}

const scopes: EffectScope[] = []

/**
 * Composable di dalam effect scope supaya watcher-nya berhenti di akhir test.
 *
 * Di komponen Vue yang mematikan watcher saat unmount; di test tidak ada komponen, jadi tanpa
 * scope ini watcher test sebelumnya ikut bangun saat state Nuxt dibersihkan test berikutnya.
 */
function useScopedHabits(options: UseHabitsOptions = {}) {
  const scope = effectScope()
  scopes.push(scope)
  const store = scope.run(() => useHabits(options))
  if (store === undefined) throw new Error('useHabits tidak menghasilkan store')
  return store
}

beforeEach(() => {
  clearNuxtState(['habits', 'habitsCheckIns', 'habitsStatus', 'habitsError', 'localData', 'now'])
  resetHabitsHydrationForTest()
  // `today` composable dibaca dari jam global; dikunci supaya tanggal streak deterministik.
  useState<number>('now').value = NOW_MS
})

afterEach(() => {
  for (const scope of scopes) scope.stop()
  scopes.length = 0
})

describe('useHabits', () => {
  it('buat & edit habit benar-benar tersimpan (bukan cuma di state)', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const draft: HabitDraft = {
      ...emptyHabitDraft(),
      name: '  Lari pagi ',
      sticker: 'aktivitas/belajar',
      days: [1, 2, 3, 4, 5],
      target: 2,
    }
    const created = await store.save(draft, null)
    if (!created.ok) throw new Error('gagal simpan')

    expect(store.findHabit(created.id)).toMatchObject({
      name: 'Lari pagi',
      sticker: 'aktivitas/belajar',
      days: [1, 2, 3, 4, 5],
      target: 2,
    })

    await vi.waitFor(async () => {
      expect((await loadHabits(session)).habits).toEqual([
        expect.objectContaining({
          id: created.id,
          name: 'Lari pagi',
          sticker: 'aktivitas/belajar',
          days: [1, 2, 3, 4, 5],
          target: 2,
        }),
      ])
    })

    const edited = await store.save(
      { ...draft, name: 'Lari sore', target: 3, sticker: null },
      created.id,
    )
    if (!edited.ok) throw new Error('gagal edit')
    expect(edited.id).toBe(created.id)

    await vi.waitFor(async () => {
      expect((await loadHabits(session)).habits[0]).toMatchObject({
        name: 'Lari sore',
        target: 3,
        sticker: null,
      })
    })
  })

  it('klik berulang mengakumulasi check-in sampai target, lalu kembali 0 & record dihapus', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()
    expect(store.today.value).toBe(TODAY)

    const created = await store.save({ ...emptyHabitDraft(), name: 'Minum air', target: 3 }, null)
    if (!created.ok) throw new Error('gagal simpan')
    const habit = store.findHabit(created.id)
    if (!habit) throw new Error('habit hilang dari state')

    store.toggleDay(created.id, TODAY)
    store.toggleDay(created.id, TODAY)
    expect(countOn(store.checkIns.value, created.id, TODAY)).toBe(2)
    expect(store.isMetToday(habit)).toBe(false)

    store.toggleDay(created.id, TODAY)
    expect(countOn(store.checkIns.value, created.id, TODAY)).toBe(3)
    expect(store.isMetToday(habit)).toBe(true)

    await vi.waitFor(async () => {
      const records = await checkinRepo(session).listAll({ includeDeleted: false })
      expect(records).toHaveLength(1)
      expect(records[0]?.data).toMatchObject({
        habitId: created.id,
        localDate: TODAY,
        amount: 3,
      })
    })

    store.toggleDay(created.id, TODAY)
    expect(countOn(store.checkIns.value, created.id, TODAY)).toBe(0)

    await vi.waitFor(async () => {
      expect(await checkinRepo(session).listAll({ includeDeleted: false })).toEqual([])
    })
  })

  it('hari depan, hari bukan jadwal, dan hari lalu tetap mengikuti aturan grid', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const created = await store.save({ ...emptyHabitDraft(), name: 'Senin saja', days: [1] }, null)
    if (!created.ok) throw new Error('gagal simpan')

    store.toggleDay(created.id, '2026-10-13') // Selasa: bukan jadwal
    store.toggleDay(created.id, addDays(TODAY, 1)) // Selasa depan: hari depan
    expect(store.checkIns.value[created.id]).toBeUndefined()

    store.toggleDay(created.id, '2026-10-12') // Senin lalu: jadwal -> tercapai (target 1)
    expect(countOn(store.checkIns.value, created.id, '2026-10-12')).toBe(1)
  })

  // Regresi (T10): hari lampau dulu di-set penuh `target` sekali klik, padahal hint UI bilang
  // "target >1x/hari: klik berulang" - backfill hari lampau harus bisa dicicil seperti hari ini.
  it('hari lampau dengan target > 1 bertambah satu per klik, klik setelah target kembali 0', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const created = await store.save({ ...emptyHabitDraft(), name: 'Minum air', target: 3 }, null)
    if (!created.ok) throw new Error('gagal simpan')
    const habit = store.findHabit(created.id)
    if (!habit) throw new Error('habit hilang dari state')

    // Kemarin (Minggu 18 Okt) untuk habit tiap hari: hari lampau yang terjadwal.
    const yesterday = addDays(TODAY, -1)
    for (const amount of [1, 2, 3]) {
      store.toggleDay(created.id, yesterday)
      expect(countOn(store.checkIns.value, created.id, yesterday)).toBe(amount)
      expect(isMet(habit, store.checkIns.value, yesterday)).toBe(amount === 3)
    }

    await vi.waitFor(async () => {
      const records = await checkinRepo(session).listAll({ includeDeleted: false })
      expect(records).toHaveLength(1)
      expect(records[0]?.data).toMatchObject({
        habitId: created.id,
        localDate: yesterday,
        amount: 3,
      })
    })

    store.toggleDay(created.id, yesterday)
    expect(countOn(store.checkIns.value, created.id, yesterday)).toBe(0)

    await vi.waitFor(async () => {
      expect(await checkinRepo(session).listAll({ includeDeleted: false })).toEqual([])
    })
  })

  it('streak habit Senin–Jumat tidak putus oleh akhir pekan', async () => {
    // Habit dibuat dua pekan lalu; jam lalu dimajukan ke "sekarang" sebelum check-in ditulis.
    const session = memorySession(NOW_MS - 14 * MS_PER_DAY)
    const weekly = habitOf(session.newId(), { name: 'Olahraga', days: [1, 2, 3, 4, 5] })
    const daily = habitOf(session.newId(), { name: 'Harian', days: null })

    await persistHabit(session, weekly)
    await persistHabit(session, daily)

    session.clock.setTo(NOW_MS)

    // Senin 12 – Jumat 16 Oktober, lalu Senin 19 (hari ini). Sabtu–Minggu sengaja kosong.
    const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', TODAY]
    for (const day of days) {
      await persistCheckin(session, { habitId: weekly.id, localDate: day, amount: 1 })
      await persistCheckin(session, { habitId: daily.id, localDate: day, amount: 1 })
    }

    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const weeklyHabit = store.findHabit(weekly.id)
    const dailyHabit = store.findHabit(daily.id)
    if (!weeklyHabit || !dailyHabit) throw new Error('habit tidak termuat dari sesi')

    // 5 hari kerja pekan lalu + Senin ini; Sabtu–Minggu dilewati tanpa memutus.
    expect(store.streakOf(weeklyHabit)).toBe(6)
    // Pembanding: habit harian kehilangan akhir pekan, jadi streak-nya putus di Minggu.
    expect(store.streakOf(dailyHabit)).toBe(1)
  })

  it('hapus habit ikut menghapus seluruh check-in-nya (tombstone)', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const created = await store.save({ ...emptyHabitDraft(), name: 'Baca 10 halaman' }, null)
    if (!created.ok) throw new Error('gagal simpan')
    store.toggleToday(created.id)

    await vi.waitFor(async () => {
      expect(await checkinRepo(session).listAll({ includeDeleted: false })).toHaveLength(1)
    })

    expect(await store.remove(created.id)).toEqual({ ok: true })
    expect(store.findHabit(created.id)).toBeUndefined()
    expect(store.checkIns.value[created.id]).toBeUndefined()

    await vi.waitFor(async () => {
      expect(await checkinRepo(session).listAll({ includeDeleted: false })).toEqual([])
      expect((await loadHabits(session)).habits).toEqual([])
    })

    // Tombstone tetap ada supaya penghapusan ikut tersinkron - bukan hilang fisik.
    const tombstones = await checkinRepo(session).listAll({ includeDeleted: true })
    expect(tombstones.length).toBeGreaterThan(0)
    expect(tombstones.every((record) => record.deleted)).toBe(true)
  })

  it('hydrate memuat habit & riwayat yang sudah tersimpan', async () => {
    const session = memorySession()
    const stored = habitOf(session.newId(), { name: 'Meditasi', target: 2 })
    await persistHabit(session, stored)
    await persistCheckin(session, { habitId: stored.id, localDate: TODAY, amount: 1 })

    const { habits, checkIns, hydrate, status, error } = useScopedHabits({
      session: async () => session,
    })
    await hydrate()

    expect(status.value).toBe('ready')
    expect(error.value).toBeNull()
    expect(habits.value).toEqual([expect.objectContaining({ id: stored.id, name: 'Meditasi' })])
    expect(checkIns.value[stored.id]).toEqual({ [TODAY]: 1 })
  })

  it('tanpa sesi (SSR): daftar kosong dan status kembali idle, bukan error', async () => {
    const { habits, checkIns, hydrate, status } = useScopedHabits({ session: async () => null })
    await hydrate()

    expect(habits.value).toEqual([])
    expect(checkIns.value).toEqual({})
    expect(status.value).toBe('idle')
  })

  // F1 (QA): backfill sebelum `createdAt` dulu tersimpan tapi tidak pernah terbaca lagi.
  it('check-in backfill sebelum habit dibuat tetap ada setelah hydrate ulang', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const created = await store.save({ ...emptyHabitDraft(), name: 'Lari pagi' }, null)
    if (!created.ok) throw new Error('gagal simpan')

    // UI hanya menonaktifkan hari depan, jadi 7 hari sebelum habit dibuat adalah backfill sah.
    const backfill = [-7, -6, -5, -4, -3, -2, -1].map((offset) => addDays(TODAY, offset))
    for (const day of backfill) store.toggleDay(created.id, day)
    expect(Object.keys(store.checkIns.value[created.id] ?? {})).toHaveLength(backfill.length)

    await vi.waitFor(async () => {
      expect(await checkinRepo(session).listAll({ includeDeleted: false })).toHaveLength(
        backfill.length,
      )
    })

    // "Reload": state halaman dibuang, composable dimuat ulang dari sesi yang sama.
    clearNuxtState(['habits', 'habitsCheckIns', 'habitsStatus', 'habitsError'])
    resetHabitsHydrationForTest()
    const reloaded = useScopedHabits({ session: async () => session })
    await reloaded.hydrate()

    expect(reloaded.checkIns.value[created.id]).toEqual(
      Object.fromEntries(backfill.map((day) => [day, 1])),
    )
  })

  // F3 (QA): AC "arsipkan" belum ada; status arsip harus tersimpan dan bisa dibalik.
  it('arsip: tersimpan, hilang dari daftar aktif, dan bisa dikembalikan', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const created = await store.save({ ...emptyHabitDraft(), name: 'Baca buku' }, null)
    if (!created.ok) throw new Error('gagal simpan')
    expect(store.activeHabits.value.map((habit) => habit.name)).toEqual(['Baca buku'])

    expect(await store.setArchived(created.id, true)).toEqual({ ok: true })
    expect(store.activeHabits.value).toEqual([])
    expect(store.archivedHabits.value.map((habit) => habit.name)).toEqual(['Baca buku'])
    expect((await loadHabits(session)).habits[0]?.isArchived).toBe(true)

    // Reload: habit terarsip tetap ada, tapi tidak kembali ke daftar aktif.
    clearNuxtState(['habits', 'habitsCheckIns', 'habitsStatus', 'habitsError'])
    resetHabitsHydrationForTest()
    const reloaded = useScopedHabits({ session: async () => session })
    await reloaded.hydrate()
    expect(reloaded.activeHabits.value).toEqual([])
    expect(reloaded.archivedHabits.value.map((habit) => habit.name)).toEqual(['Baca buku'])

    expect(await reloaded.setArchived(created.id, false)).toEqual({ ok: true })
    expect(reloaded.activeHabits.value.map((habit) => habit.name)).toEqual(['Baca buku'])
    expect(reloaded.archivedHabits.value).toEqual([])
    expect((await loadHabits(session)).habits[0]?.isArchived).toBe(false)
  })

  // F3 (QA): habit terarsip harus hilang dari SEMUA consumer lama (grid Habit, Daily, Overview,
  // target Pomodoro) - karena itu `habits` (kunci yang mereka pakai) hanya berisi habit aktif.
  it('habit terarsip hilang dari daftar `habits` yang dipakai grid, Daily, Overview, dan Pomodoro', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => session })
    await store.hydrate()

    const kept = await store.save({ ...emptyHabitDraft(), name: 'Jalan pagi' }, null)
    const dropped = await store.save({ ...emptyHabitDraft(), name: 'Baca buku' }, null)
    if (!kept.ok || !dropped.ok) throw new Error('gagal simpan')

    expect(await store.setArchived(dropped.id, true)).toEqual({ ok: true })

    expect(store.habits.value.map((habit) => habit.name)).toEqual(['Jalan pagi'])
    expect(store.archivedHabits.value.map((habit) => habit.name)).toEqual(['Baca buku'])

    // Habit terarsip bukan cuma disembunyikan: check-in-nya juga tidak boleh bertambah.
    store.toggleToday(dropped.id)
    expect(store.checkIns.value[dropped.id]).toBeUndefined()

    // Form edit/arsip tetap bisa membuka habit terarsip -> `findHabit` mencari di semua habit.
    expect(store.findHabit(dropped.id)).toMatchObject({ name: 'Baca buku', isArchived: true })

    expect(await store.setArchived(dropped.id, false)).toEqual({ ok: true })
    expect(store.habits.value.map((habit) => habit.name)).toEqual(['Jalan pagi', 'Baca buku'])
    expect(store.archivedHabits.value).toEqual([])
  })

  // F4 (QA): sesi `null` dulu mengunci hydrate selamanya; unlock tidak memuat ulang halaman.
  it('hydrate otomatis jalan begitu sesi data lokal siap, tanpa reload manual', async () => {
    const session = memorySession()
    const stored = habitOf(session.newId(), { name: 'Meditasi' })
    await persistHabit(session, stored)

    let current: LocalDataSession | null = null
    const store = useScopedHabits({ session: async () => current })
    await store.hydrate()
    expect(store.status.value).toBe('idle')
    expect(store.habits.value).toEqual([])

    // Perangkat baru/terkunci: kunci dibuka (passkey/kode), status sesi jadi siap.
    current = session
    const ready: LocalDataState = {
      status: 'ready',
      isFreshKey: false,
      deviceId: USER_ID,
      userId: USER_ID,
      error: null,
    }
    useState<LocalDataState>('localData').value = ready

    await vi.waitFor(() => {
      expect(store.status.value).toBe('ready')
      expect(store.habits.value.map((habit) => habit.name)).toEqual(['Meditasi'])
    })
  })

  // F4 (QA): hydrate yang gagal karena sesi `null` tidak boleh memblokir percobaan berikutnya.
  it('hydrate bisa dicoba lagi setelah sesi null (tidak ada hydrate yang tersangkut)', async () => {
    const session = memorySession()
    await persistHabit(session, habitOf(session.newId(), { name: 'Jalan pagi' }))

    let current: LocalDataSession | null = null
    const store = useScopedHabits({ session: async () => current })
    await store.hydrate()
    expect(store.status.value).toBe('idle')

    current = session
    await store.hydrate()

    expect(store.status.value).toBe('ready')
    expect(store.habits.value.map((habit) => habit.name)).toEqual(['Jalan pagi'])
  })

  // F5 (QA): habit yang disimpan saat hydrate berjalan dulu tertimpa snapshot lama.
  it('habit yang disimpan saat hydrate berjalan tidak tertimpa hasil hydrate', async () => {
    const session = memorySession()
    const { gated, snapshotTaken, release } = gatedHabitList(session)
    const store = useScopedHabits({ session: async () => gated })

    // Snapshot database (masih kosong) sudah diambil; hydrate tertahan sebelum assign.
    await snapshotTaken

    const created = await store.save({ ...emptyHabitDraft(), name: 'Disiplin' }, null)
    if (!created.ok) throw new Error('gagal simpan')

    release()
    await store.hydrate()

    expect(store.status.value).toBe('ready')
    expect(store.habits.value.map((habit) => habit.name)).toEqual(['Disiplin'])
    expect(store.findHabit(created.id)).toMatchObject({ name: 'Disiplin' })
  })

  // F6 (QA): gagal tulis dulu hanya mengisi `error`; UI menutup form seolah berhasil.
  it('gagal menyimpan: hasil melaporkan gagal, state dikembalikan, DB tetap kosong', async () => {
    const session = memorySession()
    const store = useScopedHabits({ session: async () => withFailingWrite(session) })
    await store.hydrate()

    const result = await store.save({ ...emptyHabitDraft(), name: 'Gagal disimpan' }, null)

    expect(result).toEqual({ ok: false, error: 'persist' })
    expect(store.habits.value).toEqual([])
    expect(store.error.value).toBe('penyimpanan penuh')
    expect((await loadHabits(session)).habits).toEqual([])
  })

  it('gagal menghapus: habit kembali ke daftar beserta check-in-nya', async () => {
    const session = memorySession()
    let current: MemorySession = session
    const store = useScopedHabits({ session: async () => current })
    await store.hydrate()

    const created = await store.save({ ...emptyHabitDraft(), name: 'Jurnal' }, null)
    if (!created.ok) throw new Error('gagal simpan')
    store.toggleDay(created.id, TODAY)
    await vi.waitFor(async () => {
      expect(await checkinRepo(session).listAll({ includeDeleted: false })).toHaveLength(1)
    })

    current = {
      ...session,
      writer: {
        ...session.writer,
        remove: async () => {
          throw new Error('gagal hapus')
        },
      },
    }

    const result = await store.remove(created.id)

    expect(result).toEqual({ ok: false, message: 'gagal hapus' })
    expect(store.findHabit(created.id)).toMatchObject({ name: 'Jurnal' })
    expect(countOn(store.checkIns.value, created.id, TODAY)).toBe(1)
  })
})
