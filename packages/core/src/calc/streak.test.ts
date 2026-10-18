import { describe, expect, it } from 'vitest'

import type { Habit, HabitCheckin } from '../domain/entities/habit.ts'
import { habitAmountOn, habitStreak, longestHabitStreak } from './streak.ts'

/**
 * AC T10: "Streak benar untuk habit hari tertentu (hari non-jadwal tidak memutus); unit test streak".
 *
 * Kalender acuan (2025):
 *   Jan 2025: 6 = Senin, 7 = Selasa, ..., 10 = Jumat, 11 = Sabtu, 12 = Minggu, 13 = Senin.
 * Jadi rentang kerja 6-10 Jan adalah Senin-Jumat, dan 11/12 Jan adalah akhir pekan.
 */

const WEEKDAY_NAMES = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'] as const

function assertWeekday(localDate: string, expected: string): void {
  const index = new Date(`${localDate}T00:00:00Z`).getUTCDay()
  const actual = WEEKDAY_NAMES[index]
  if (actual !== expected) throw new Error(`${localDate} adalah ${actual}, bukan ${expected}`)
}

function habit(patch: Partial<Habit> = {}): Habit {
  return {
    id: 'habit-1',
    name: 'Olahraga',
    iconSticker: null,
    frequencyType: 'daily',
    frequencyDays: null,
    targetPerDay: 1,
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

let checkinSerial = 0

function checkin(habitId: string, localDate: string, amount = 1): HabitCheckin {
  checkinSerial += 1
  return {
    id: `c-${String(checkinSerial).padStart(4, '0')}`,
    habitId,
    localDate,
    amount,
    checkinAt: 0,
  }
}

describe('habitStreak - habit harian', () => {
  it('menghitung hari berturut-turut yang target terpenuhi', () => {
    assertWeekday('2025-01-13', 'senin')

    const checkins = [
      checkin('habit-1', '2025-01-11'),
      checkin('habit-1', '2025-01-12'),
      checkin('habit-1', '2025-01-13'),
    ]

    const result = habitStreak({ habit: habit(), checkins, todayLocalDate: '2025-01-13' })
    expect(result.current).toBe(3)
    expect(result.metToday).toBe(true)
  })

  it('hari yang belum terpenuhi (kemarin) MEMUTUS streak', () => {
    const checkins = [checkin('habit-1', '2025-01-10'), checkin('habit-1', '2025-01-13')]
    const result = habitStreak({ habit: habit(), checkins, todayLocalDate: '2025-01-13' })

    expect(result.current).toBe(1)
    expect(result.metToday).toBe(true)
  })

  it('hari ini belum terpenuhi TIDAK memutus streak (pagi belum check-in)', () => {
    const checkins = [checkin('habit-1', '2025-01-11'), checkin('habit-1', '2025-01-12')]
    const result = habitStreak({ habit: habit(), checkins, todayLocalDate: '2025-01-13' })

    expect(result.current).toBe(2)
    expect(result.metToday).toBe(false)
  })

  it('tanpa check-in sama sekali: streak 0 dan metToday false', () => {
    const result = habitStreak({ habit: habit(), checkins: [], todayLocalDate: '2025-01-13' })
    expect(result.current).toBe(0)
    expect(result.metToday).toBe(false)
  })

  it('target > 1: akumulasi beberapa check-in sehari dihitung sebagai terpenuhi', () => {
    const checkins = [
      checkin('habit-1', '2025-01-12', 1),
      checkin('habit-1', '2025-01-12', 2),
      checkin('habit-1', '2025-01-13', 1),
      checkin('habit-1', '2025-01-13', 2),
    ]

    const result = habitStreak({
      habit: habit({ targetPerDay: 3 }),
      checkins,
      todayLocalDate: '2025-01-13',
    })

    expect(result.current).toBe(2)
    expect(result.metToday).toBe(true)
  })

  it('target > 1 belum terpenuhi: tidak dihitung, tapi kemarin tetap dihitung', () => {
    const checkins = [checkin('habit-1', '2025-01-12', 3), checkin('habit-1', '2025-01-13', 1)]
    const result = habitStreak({
      habit: habit({ targetPerDay: 3 }),
      checkins,
      todayLocalDate: '2025-01-13',
    })

    expect(result.current).toBe(1)
    expect(result.metToday).toBe(false)
  })
})

describe('habitStreak - AC T10 "hari non-jadwal tidak memutus streak"', () => {
  it('habit Senin-Jumat TIDAK putus di akhir pekan', () => {
    assertWeekday('2025-01-06', 'senin')
    assertWeekday('2025-01-10', 'jumat')
    assertWeekday('2025-01-11', 'sabtu')
    assertWeekday('2025-01-12', 'minggu')
    assertWeekday('2025-01-13', 'senin')

    // Dua pekan kerja penuh, tanpa check-in sama sekali di akhir pekan.
    const weekdays = ['2025-01-06', '2025-01-07', '2025-01-08', '2025-01-09', '2025-01-10']
    const weekdays2 = ['2025-01-13', '2025-01-14', '2025-01-15', '2025-01-16', '2025-01-17']
    const checkins = [...weekdays, ...weekdays2].map((date) => checkin('habit-1', date))

    const result = habitStreak({
      habit: habit({
        frequencyType: 'weekly_days',
        frequencyDays: ['senin', 'selasa', 'rabu', 'kamis', 'jumat'],
      }),
      checkins,
      todayLocalDate: '2025-01-17',
    })

    // 10 hari kerja berturut-turut; Sabtu & Minggu di antaranya tidak memutus.
    expect(result.current).toBe(10)
  })

  it('streak dihitung pada hari ini yang jatuh di akhir pekan: mundur melewati akhir pekan', () => {
    // Hari ini Sabtu 2025-01-11 dan habit Senin-Jumat: streak tetap seperti hari Jumat.
    const checkins = [
      checkin('habit-1', '2025-01-08'),
      checkin('habit-1', '2025-01-09'),
      checkin('habit-1', '2025-01-10'),
    ]

    const result = habitStreak({
      habit: habit({
        frequencyType: 'weekly_days',
        frequencyDays: ['senin', 'selasa', 'rabu', 'kamis', 'jumat'],
      }),
      checkins,
      todayLocalDate: '2025-01-11',
    })

    expect(result.current).toBe(3)
    expect(result.metToday).toBe(false)
  })

  it('habit satu hari per pekan: streak = jumlah pekan berturut-turut', () => {
    // Rabu-an selama 4 pekan.
    const wednesdays = ['2025-01-01', '2025-01-08', '2025-01-15', '2025-01-22']
    for (const date of wednesdays) assertWeekday(date, 'rabu')

    const checkins = wednesdays.map((date) => checkin('habit-1', date))
    const result = habitStreak({
      habit: habit({ frequencyType: 'weekly_days', frequencyDays: ['rabu'] }),
      checkins,
      todayLocalDate: '2025-01-22',
    })

    expect(result.current).toBe(4)
  })

  it('hari jadwal yang terlewat MEMUTUS streak walau hari lain aman', () => {
    // Rabu 8 Jan terlewat, padahal Rabu 1 & 15 Jan terpenuhi.
    const checkins = [checkin('habit-1', '2025-01-01'), checkin('habit-1', '2025-01-15')]
    const result = habitStreak({
      habit: habit({ frequencyType: 'weekly_days', frequencyDays: ['rabu'] }),
      checkins,
      todayLocalDate: '2025-01-15',
    })

    expect(result.current).toBe(1)
  })

  it('habit akhir pekan (Sabtu & Minggu) dihitung benar', () => {
    assertWeekday('2025-01-11', 'sabtu')
    assertWeekday('2025-01-12', 'minggu')
    assertWeekday('2025-01-18', 'sabtu')

    const checkins = ['2025-01-11', '2025-01-12', '2025-01-18'].map((date) =>
      checkin('habit-1', date),
    )
    const result = habitStreak({
      habit: habit({ frequencyType: 'weekly_days', frequencyDays: ['sabtu', 'minggu'] }),
      checkins,
      todayLocalDate: '2025-01-18',
    })

    expect(result.current).toBe(3)
  })
})

describe('habitStreak - batas & ketahanan', () => {
  it('berhenti di tanggal pembuatan habit: hari sebelum habit ada tidak dianggap terlewat', () => {
    // Habit dibuat 2025-01-13 dan hari ini 2025-01-15, tanpa check-in di 13 & 14.
    const checkins = [checkin('habit-1', '2025-01-15')]
    const result = habitStreak({
      habit: habit(),
      checkins,
      todayLocalDate: '2025-01-15',
      createdLocalDate: '2025-01-13',
    })

    // Kalau tidak dibatasi createdLocalDate, hari 13 & 14 akan memutus dan hasilnya 1 juga - jadi
    // yang diuji di sini adalah hari ini terhitung dan pencarian tidak jalan terus ke masa lalu.
    expect(result.current).toBe(1)
    expect(result.checkedDays).toBeLessThanOrEqual(3)
  })

  it('check-in habit lain tidak ikut terhitung', () => {
    const checkins = [
      checkin('habit-lain', '2025-01-11'),
      checkin('habit-lain', '2025-01-12'),
      checkin('habit-1', '2025-01-13'),
    ]

    const result = habitStreak({ habit: habit(), checkins, todayLocalDate: '2025-01-13' })
    expect(result.current).toBe(1)
  })

  it('maxLookbackDays membatasi pencarian (pengaman data rusak)', () => {
    const checkins = [checkin('habit-1', '2025-01-13')]
    const result = habitStreak({
      habit: habit(),
      checkins,
      todayLocalDate: '2025-01-13',
      maxLookbackDays: 1,
    })

    expect(result.current).toBe(1)
    expect(result.checkedDays).toBe(1)
  })

  it('streak panjang 30 hari berturut-turut', () => {
    const dates: string[] = []
    for (let day = 1; day <= 30; day += 1) {
      dates.push(`2025-04-${String(day).padStart(2, '0')}`)
    }

    const checkins = dates.map((date) => checkin('habit-1', date))
    const result = habitStreak({ habit: habit(), checkins, todayLocalDate: '2025-04-30' })
    expect(result.current).toBe(30)
  })
})

describe('longestHabitStreak', () => {
  it('menemukan streak terpanjang sepanjang riwayat', () => {
    const checkins = [
      // 3 hari berturut-turut, lalu bolong, lalu 5 hari berturut-turut.
      checkin('habit-1', '2025-01-01'),
      checkin('habit-1', '2025-01-02'),
      checkin('habit-1', '2025-01-03'),
      checkin('habit-1', '2025-01-10'),
      checkin('habit-1', '2025-01-11'),
      checkin('habit-1', '2025-01-12'),
      checkin('habit-1', '2025-01-13'),
      checkin('habit-1', '2025-01-14'),
    ]

    expect(longestHabitStreak({ habit: habit(), checkins, todayLocalDate: '2025-01-14' })).toBe(5)
  })

  it('menghormati hari non-jadwal (streak kerja 5 hari bukan 7)', () => {
    const weekdays = ['2025-01-06', '2025-01-07', '2025-01-08', '2025-01-09', '2025-01-10']
    const checkins = weekdays.map((date) => checkin('habit-1', date))

    const longest = longestHabitStreak({
      habit: habit({
        frequencyType: 'weekly_days',
        frequencyDays: ['senin', 'selasa', 'rabu', 'kamis', 'jumat'],
      }),
      checkins,
      todayLocalDate: '2025-01-12',
    })

    expect(longest).toBe(5)
  })

  it('tanpa data: 0', () => {
    expect(longestHabitStreak({ habit: habit(), checkins: [], todayLocalDate: '2025-01-14' })).toBe(
      0,
    )
  })
})

describe('habitAmountOn', () => {
  it('menjumlahkan amount satu hari untuk satu habit', () => {
    const checkins = [
      checkin('habit-1', '2025-01-13', 1),
      checkin('habit-1', '2025-01-13', 2),
      checkin('habit-1', '2025-01-12', 5),
      checkin('habit-lain', '2025-01-13', 9),
    ]

    expect(habitAmountOn({ id: 'habit-1' }, checkins, '2025-01-13')).toBe(3)
  })

  it('hari tanpa check-in: 0', () => {
    expect(habitAmountOn({ id: 'habit-1' }, [], '2025-01-13')).toBe(0)
  })
})
