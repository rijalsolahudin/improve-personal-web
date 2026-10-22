import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { usePomodoroTargets } from '~/composables/usePomodoroTargets'
import { currentStreak, type CheckIns, type Habit } from '~/utils/habits'
import { MS_PER_HOUR, fromIsoDate } from '~/utils/time'

import { useDailyRoutine } from './useDailyRoutine'
import { useHabits } from './useHabits'
import { useOverview } from './useOverview'

/**
 * QA T10 - verifikasi independen: (a) hari yang bukan jadwal habit TIDAK memutus streak, dan
 * (b) habit terarsip tidak muncul di Daily/Overview (streak, heatmap, completion rate) maupun di
 * pilihan target Pomodoro.
 *
 * Consumer dijalankan lewat composable aslinya, bukan dengan memanggil fungsi murni saja, supaya
 * yang dibuktikan adalah perilaku yang dilihat user di halaman.
 */
const TODAY = '2026-10-19' // Senin
const NOW_MS = fromIsoDate(TODAY).getTime() + 9 * MS_PER_HOUR

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

/** `{ hari: jumlah }` untuk satu habit. */
function checkInsFor(habitId: string, days: Record<string, number>): CheckIns {
  return { [habitId]: days }
}

function seed(habits: Habit[], checkIns: CheckIns = {}): void {
  useState<Habit[]>('habits').value = habits
  useState<CheckIns>('habitsCheckIns').value = checkIns
}

/**
 * Jalankan composable di dalam `setup` komponen (sebagian butuh konteks setup, mis. `useI18n`), lalu
 * ambil nilai yang dipilih sebagai objek biasa.
 */
async function readComposable<T>(
  use: () => T,
  pick: (value: T) => Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let snapshot: Record<string, unknown> = {}
  const Harness = defineComponent({
    setup() {
      const api = use()
      return () => {
        snapshot = pick(api)
        return h('div')
      }
    },
  })

  const wrapper = await mountSuspended(Harness)
  await flushPromises()
  wrapper.unmount()
  return snapshot
}

const WEEKDAYS = [1, 2, 3, 4, 5]
/** Senin 12 – Jumat 16 Oktober + Senin 19 (hari ini); Sabtu–Minggu sengaja kosong. */
const FULL_WORK_WEEK = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', TODAY]

beforeEach(() => {
  clearNuxtState([
    'habits',
    'habitsCheckIns',
    'habitsStatus',
    'habitsError',
    'localData',
    'now',
    'daily-routine',
    'tasks',
    'schedules',
    'schedule-attendance',
    'overview-range',
    'overview-off',
    'overview-habit',
  ])
  useState<number>('now').value = NOW_MS
})

describe('streak tidak putus oleh hari non-jadwal (QA T10)', () => {
  it('Senin–Jumat: Sabtu & Minggu yang kosong dilewati, streak 6 hari kerja', () => {
    const weekdays = habitOf('h', { days: WEEKDAYS })
    const checkIns = checkInsFor('h', Object.fromEntries(FULL_WORK_WEEK.map((day) => [day, 1])))

    expect(currentStreak(weekdays, checkIns, TODAY)).toBe(6)
  })

  it('pembanding: habit tiap hari dengan data yang sama putus di akhir pekan', () => {
    const daily = habitOf('h', { days: null })
    const checkIns = checkInsFor('h', Object.fromEntries(FULL_WORK_WEEK.map((day) => [day, 1])))

    // Minggu 18 kosong -> streak berhenti di Senin 19.
    expect(currentStreak(daily, checkIns, TODAY)).toBe(1)
  })

  it('hari jadwal yang terlewat tetap memutus streak', () => {
    const weekdays = habitOf('h', { days: WEEKDAYS })
    const checkIns = checkInsFor('h', {
      [TODAY]: 1,
      '2026-10-16': 1,
      '2026-10-15': 1,
      // Rabu 14 terlewat -> berhenti di sini, Selasa/Senin tidak dihitung.
      '2026-10-13': 1,
      '2026-10-12': 1,
    })

    expect(currentStreak(weekdays, checkIns, TODAY)).toBe(3)
  })

  it('hari ini yang belum tercapai belum memutus streak, target >1 yang parsial tidak dihitung', () => {
    const weekdays = habitOf('h', { days: WEEKDAYS, target: 3 })
    const checkIns = checkInsFor('h', {
      '2026-10-16': 3,
      '2026-10-15': 3,
      '2026-10-14': 2, // parsial 2/3 -> tidak tercapai
    })

    expect(currentStreak(weekdays, checkIns, TODAY)).toBe(2)
  })

  it('composable memakai aturan yang sama saat membaca state aplikasi', async () => {
    const weekdays = habitOf('018f2c4e-0000-7000-8000-000000000001', { days: WEEKDAYS })
    seed(
      [weekdays],
      checkInsFor(weekdays.id, Object.fromEntries(FULL_WORK_WEEK.map((d) => [d, 1]))),
    )

    const result = await readComposable(
      () => useHabits(),
      ({ streakOf }) => ({ streak: streakOf(weekdays) }),
    )

    expect(result).toEqual({ streak: 6 })
  })
})

describe('habit terarsip tidak muncul di consumer (QA T10)', () => {
  const ACTIVE = habitOf('018f2c4e-0000-7000-8000-000000000001', { name: 'Jalan pagi' })
  const ARCHIVED = habitOf('018f2c4e-0000-7000-8000-000000000002', {
    name: 'Baca buku',
    isArchived: true,
  })
  /** Habit aktif tercapai hari ini; habit terarsip tidak pernah tercapai. */
  const CHECK_INS = checkInsFor(ACTIVE.id, { [TODAY]: 1 })

  beforeEach(() => {
    seed([ACTIVE, ARCHIVED], CHECK_INS)
  })

  it('Daily: daftar habit hari ini & progresnya hanya berisi habit aktif', async () => {
    const result = await readComposable(
      () => useDailyRoutine(),
      ({ habitsToday, habitProgress }) => ({
        names: habitsToday.value.map((item) => item.habit.name),
        done: habitsToday.value[0]?.isDone,
        progress: habitProgress.value,
      }),
    )

    expect(result).toEqual({
      names: ['Jalan pagi'],
      done: true,
      progress: { done: 1, total: 1, percent: 100 },
    })
  })

  it('Overview: daftar streak habit hanya berisi habit aktif', async () => {
    const result = await readComposable(
      () => useOverview(),
      ({ habitRows }) => ({
        names: habitRows.value.map((row) => row.name),
        current: habitRows.value[0]?.current,
      }),
    )

    expect(result).toEqual({ names: ['Jalan pagi'], current: 1 })
  })

  it('Overview: heatmap hanya bisa menampilkan habit aktif', async () => {
    const result = await readComposable(
      () => useOverview(),
      ({ heatmap, heatmapHabits }) => ({
        picker: heatmapHabits.value.map((habit) => habit.name),
        shown: heatmap.value?.name,
      }),
    )

    expect(result).toEqual({ picker: ['Jalan pagi'], shown: 'Jalan pagi' })
  })

  it('Overview: completion rate tidak diencerkan oleh habit terarsip', async () => {
    const result = await readComposable(
      () => useOverview(),
      ({ stats }) => ({
        habitRate: stats.value.find((stat) => stat.key === 'habit')?.value,
      }),
    )

    // Pekan ini (Sen 19 – Min 25): habit aktif 1 dari 7 hari = 14%. Kalau habit terarsip (0/7) ikut
    // dirata-rata, angkanya jadi 7% - itulah yang dicegah.
    expect(result).toEqual({ habitRate: '14%' })
  })

  it('Pomodoro: pilihan target habit hanya berisi habit aktif yang belum tercapai', async () => {
    // Keduanya belum tercapai hari ini, jadi pembeda satu-satunya adalah status arsip.
    seed([ACTIVE, ARCHIVED])

    const result = await readComposable(
      () => usePomodoroTargets(),
      ({ options }) => ({ labels: options.value.habit.map((option) => option.label) }),
    )

    expect(result).toEqual({ labels: ['Jalan pagi'] })
  })

  it('habit yang dikembalikan dari arsip langsung ikut lagi di Daily', async () => {
    expect(useState<Habit[]>('habits').value.map((habit) => habit.name)).toEqual([
      'Jalan pagi',
      'Baca buku',
    ])

    useState<Habit[]>('habits').value = [{ ...ARCHIVED, isArchived: false }, ACTIVE]

    const result = await readComposable(
      () => useDailyRoutine(),
      ({ habitsToday }) => ({ names: habitsToday.value.map((item) => item.habit.name).sort() }),
    )

    expect(result).toEqual({ names: ['Baca buku', 'Jalan pagi'] })
  })
})
