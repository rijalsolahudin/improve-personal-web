import { describe, expect, it } from 'vitest'

import type { FocusSession } from './pomodoro'
import type { CheckIns, Habit } from './habits'
import type { Schedule } from './schedule'
import type { Task } from './tasks'
import { addDays, toIsoDate } from './time'
import {
  activeGoals,
  bestDayStreak,
  currentDayStreak,
  eisenhowerCounts,
  focusBuckets,
  habitHeatmap,
  habitRate,
  moodCorrelation,
  scheduledMinutes,
  taskTotals,
  windowFor,
} from './overview'

const day = (year: number, month: number, d: number, hour = 0, minute = 0): number =>
  new Date(year, month - 1, d, hour, minute).getTime()
const iso = (ms: number): string => toIsoDate(new Date(ms))

function session(endedAt: number, minutes: number, status: FocusSession['status'] = 'selesai'): FocusSession {
  return {
    id: `s-${endedAt}`,
    startedAt: endedAt - minutes * 60_000,
    endedAt,
    target: 'Fokus',
    status,
  }
}

describe('windowFor', () => {
  const now = day(2026, 10, 14, 15) // Rabu

  it('pekanan mulai Senin, tidak bisa maju di rentang sekarang', () => {
    const win = windowFor('pekanan', 0, now)
    expect(iso(win.start)).toBe('2026-10-12')
    expect(win.canNext).toBe(false)
    expect(windowFor('pekanan', -1, now).canNext).toBe(true)
  })

  it('harian menggeser per hari', () => {
    expect(iso(windowFor('harian', -2, now).start)).toBe('2026-10-12')
  })

  it('keseluruhan tidak bisa dinavigasi', () => {
    expect(windowFor('keseluruhan', 0, now).canNext).toBe(false)
  })
})

describe('focusBuckets', () => {
  it('harian: 18 slot jam, menit masuk ke slot jam `endedAt`', () => {
    const now = day(2026, 10, 14, 15)
    const sessions = [session(day(2026, 10, 14, 10, 25), 25), session(day(2026, 10, 13, 10, 0), 25)]
    const { unit, buckets } = focusBuckets('harian', 0, now, sessions)
    expect(unit).toBe('jam')
    expect(buckets).toHaveLength(18)
    const hour10 = buckets.find((b) => new Date(b.start).getHours() === 10)
    expect(hour10).toMatchObject({ minutes: 25, count: 1 })
    // Sesi hari kemarin tidak ikut terhitung hari ini.
    expect(buckets.reduce((acc, b) => acc + b.count, 0)).toBe(1)
  })

  it("harian: sesi 'dilewati' tidak dihitung", () => {
    const now = day(2026, 10, 14, 15)
    const { buckets } = focusBuckets('harian', 0, now, [session(day(2026, 10, 14, 9, 0), 25, 'dilewati')])
    expect(buckets.reduce((acc, b) => acc + b.minutes, 0)).toBe(0)
  })
})

describe('streak', () => {
  const today = '2026-10-14'
  it('currentDayStreak berhenti di hari kosong, hari ini boleh kosong', () => {
    const days = new Set(['2026-10-14', '2026-10-13', '2026-10-12'])
    expect(currentDayStreak(days, today)).toBe(3)
    expect(currentDayStreak(new Set(['2026-10-13', '2026-10-12']), today)).toBe(2)
  })
  it('bestDayStreak ambil rentang terpanjang', () => {
    const days = new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10'])
    expect(bestDayStreak(days, today)).toBe(3)
  })
})

describe('habit', () => {
  const habit: Habit = {
    id: 'h1',
    name: 'Belajar',
    icon: '✎',
    sticker: null,
    color: 0,
    days: null,
    target: 1,
    goalId: null,
  }

  it('habitRate rata-rata dari rentang', () => {
    const checkIns: CheckIns = { h1: { '2026-10-13': 1, '2026-10-12': 1 } }
    expect(habitRate([habit], checkIns, day(2026, 10, 12), day(2026, 10, 15))).toBe(67)
  })

  it('habitHeatmap 20 minggu & rate', () => {
    const grid = habitHeatmap(habit, { h1: {} }, '2026-10-14')
    expect(grid.weeks).toHaveLength(20)
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true)
    expect(grid.rate).toBe(0)
  })
})

describe('scheduledMinutes', () => {
  const weekly: Schedule = {
    id: 's1',
    title: 'Kelas',
    color: 0,
    start: '2026-10-01',
    time: '09:00',
    dur: 60,
    allDay: false,
    rec: { type: 'weekly', days: [1], interval: 1 },
    until: null,
    exceptions: [],
    goalId: null,
  }

  it('menghitung occurrence di rentang × durasi', () => {
    const start = day(2026, 10, 12) // Senin
    expect(scheduledMinutes([weekly], start, start + 7 * 86_400_000)).toEqual([
      { id: 's1', title: 'Kelas', color: '#9B4FC9', minutes: 60 },
    ])
  })

  it('all-day dilewati, jadwal di luar rentang tidak muncul', () => {
    expect(scheduledMinutes([{ ...weekly, allDay: true }], day(2026, 10, 12), day(2026, 10, 19))).toEqual([])
    // Selasa–Kamis (3–5 Nov 2026) tidak ketemu Senin.
    expect(scheduledMinutes([weekly], day(2026, 11, 3), day(2026, 11, 6))).toEqual([])
  })
})

describe('moodCorrelation', () => {
  it('bagi tinggi/rendah berdasar median fokus', () => {
    const moods = { '2026-10-10': 2, '2026-10-11': 4, '2026-10-12': 5 }
    const focus = new Map([
      ['2026-10-10', 0],
      ['2026-10-11', 50],
      ['2026-10-12', 100],
    ])
    const result = moodCorrelation(moods, focus, day(2026, 10, 10), day(2026, 10, 13))
    expect(result.high).toBeGreaterThan(result.low ?? 0)
  })
})

describe('task & goal', () => {
  const tasks: Task[] = [
    { id: 't1', title: 'A', note: '', priority: 'urgent', deadline: null, done: true, scheduleId: null, quadrant: 'do' },
    { id: 't2', title: 'B', note: '', priority: 'low', deadline: day(2026, 10, 1), done: false, scheduleId: null, quadrant: 'plan' },
  ]

  it('taskTotals & eisenhowerCounts', () => {
    expect(taskTotals(tasks, day(2026, 10, 14))).toEqual({ done: 1, overdue: 1, total: 2 })
    expect(eisenhowerCounts(tasks)).toEqual({ do: 1, plan: 1, delegate: 0, drop: 0 })
  })

  it('activeGoals hanya status aktif + chapter berjalan', () => {
    const goals = [
      {
        id: 'g1',
        title: 'Lulus',
        why: '',
        category: 'karier' as const,
        status: 'aktif' as const,
        start: addDays('2026-10-01', 0),
        end: '2026-12-31',
        cover: null,
        along: [],
        chapters: [
          { id: 'c1', title: 'Bab 1', start: '2026-10-01', end: '2026-10-31', isManualDone: false, isClosed: false, items: [] },
        ],
      },
    ]
    expect(activeGoals(goals, '2026-10-14')).toEqual([
      { id: 'g1', title: 'Lulus', category: 'karier', pct: 0, chapter: 'Bab 1' },
    ])
  })
})
