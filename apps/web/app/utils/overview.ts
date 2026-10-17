// Overview (PRD F11): agregasi lokal lintas fitur. Fungsi murni; waktu di-inject.
// Rentang: keseluruhan / harian / pekanan / bulanan / tahunan; `off` 0 = sekarang, negatif = mundur.

import type { Countdown, CountdownView } from './countdown'
import { groupCountdowns } from './countdown'
import { chapterStatus, goalProgress, type Goal, type GoalCategory } from './goals'
import {
  completionRate,
  currentStreak,
  isMet,
  isScheduled,
  type CheckIns,
  type Habit,
} from './habits'
import type { Memo, MoodByDate } from './memo'
import { sessionMinutes, type FocusSession } from './pomodoro'
import { occursOn, SCHEDULE_COLORS, type Schedule } from './schedule'
import { isOverdue, QUADRANTS, type Quadrant, type Task } from './tasks'
import { MS_PER_DAY, MS_PER_HOUR, addDays, fromIsoDate, toIsoDate } from './time'

export type OverviewRange = 'keseluruhan' | 'harian' | 'pekanan' | 'bulanan' | 'tahunan'
export const OVERVIEW_RANGES: readonly OverviewRange[] = [
  'keseluruhan',
  'harian',
  'pekanan',
  'bulanan',
  'tahunan',
]

const startOfDay = (ms: number): number => new Date(ms).setHours(0, 0, 0, 0)

function mondayOfMs(ms: number): number {
  const date = new Date(startOfDay(ms))
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return date.getTime()
}

export interface OverviewWindow {
  /** Awal rentang (inklusif), epoch ms. */
  start: number
  /** Akhir rentang (eksklusif), epoch ms. */
  end: number
  /** Masih boleh maju ke rentang berikutnya? */
  canNext: boolean
}

export function windowFor(range: OverviewRange, off: number, now: number): OverviewWindow {
  const today = startOfDay(now)
  const date = new Date(today)
  switch (range) {
    case 'harian': {
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() + off).getTime()
      return { start, end: start + MS_PER_DAY, canNext: off < 0 }
    }
    case 'pekanan': {
      const start = mondayOfMs(now) + off * 7 * MS_PER_DAY
      return { start, end: start + 7 * MS_PER_DAY, canNext: off < 0 }
    }
    case 'bulanan': {
      const start = new Date(date.getFullYear(), date.getMonth() + off, 1).getTime()
      const end = new Date(date.getFullYear(), date.getMonth() + off + 1, 1).getTime()
      return { start, end, canNext: off < 0 }
    }
    case 'tahunan': {
      const year = date.getFullYear() + off
      return {
        start: new Date(year, 0, 1).getTime(),
        end: new Date(year + 1, 0, 1).getTime(),
        canNext: off < 0,
      }
    }
    case 'keseluruhan':
      return {
        start: new Date(date.getFullYear(), 0, 1).getTime(),
        end: today + MS_PER_DAY,
        canNext: false,
      }
  }
}

export interface Bucket {
  start: number
  end: number
  minutes: number
  count: number
}

export type BucketUnit = 'jam' | 'hari' | 'bulan'

/** Slot grafik menit fokus + isian dari riwayat sesi (dikelompokkan di slot `endedAt`). */
export function focusBuckets(
  range: OverviewRange,
  off: number,
  now: number,
  sessions: readonly FocusSession[],
): { unit: BucketUnit; buckets: Bucket[] } {
  const today = startOfDay(now)
  const date = new Date(today)
  let slots: { start: number; end: number }[] = []
  let unit: BucketUnit = 'hari'
  if (range === 'harian') {
    unit = 'jam'
    const base = new Date(date.getFullYear(), date.getMonth(), date.getDate() + off)
    for (let hour = 6; hour <= 23; hour += 1) {
      const start = new Date(base).setHours(hour, 0, 0, 0)
      slots.push({ start, end: start + MS_PER_HOUR })
    }
  } else if (range === 'pekanan') {
    const monday = mondayOfMs(now) + off * 7 * MS_PER_DAY
    slots = Array.from({ length: 7 }, (_, i) => ({
      start: monday + i * MS_PER_DAY,
      end: monday + (i + 1) * MS_PER_DAY,
    }))
  } else if (range === 'bulanan') {
    const first = new Date(date.getFullYear(), date.getMonth() + off, 1)
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    slots = Array.from({ length: days }, (_, i) => {
      const start = new Date(first.getFullYear(), first.getMonth(), i + 1).getTime()
      return { start, end: start + MS_PER_DAY }
    })
  } else if (range === 'tahunan') {
    unit = 'bulan'
    const year = date.getFullYear() + off
    slots = Array.from({ length: 12 }, (_, month) => ({
      start: new Date(year, month, 1).getTime(),
      end: new Date(year, month + 1, 1).getTime(),
    }))
  } else {
    unit = 'bulan'
    const year = date.getFullYear()
    slots = Array.from({ length: date.getMonth() + 1 }, (_, month) => ({
      start: new Date(year, month, 1).getTime(),
      end: new Date(year, month + 1, 1).getTime(),
    }))
  }

  const win = windowFor(range, off, now)
  const buckets: Bucket[] = slots.map((slot) => ({ ...slot, minutes: 0, count: 0 }))
  for (const session of sessions) {
    if (session.status !== 'selesai') continue
    if (session.endedAt < win.start || session.endedAt >= win.end) continue
    const bucket = buckets.find(
      (slot) => session.endedAt >= slot.start && session.endedAt < slot.end,
    )
    if (!bucket) continue
    bucket.minutes += sessionMinutes(session)
    bucket.count += 1
  }
  return { unit, buckets }
}

/** Rata-rata completion rate antar habit di rentang [from, to) ms. */
export function habitRate(
  habits: readonly Habit[],
  checkIns: CheckIns,
  from: number,
  to: number,
): number {
  if (!habits.length) return 0
  const fromIso = toIsoDate(new Date(from))
  const toIso = toIsoDate(new Date(to - 1))
  if (toIso < fromIso) return 0
  const sum = habits.reduce(
    (acc, habit) => acc + completionRate(habit, checkIns, fromIso, toIso),
    0,
  )
  return Math.round(sum / habits.length)
}

export interface TaskTotals {
  done: number
  overdue: number
  total: number
}

export function taskTotals(tasks: readonly Task[], now: number): TaskTotals {
  return {
    done: tasks.filter((task) => task.done).length,
    overdue: tasks.filter((task) => isOverdue(task, now)).length,
    total: tasks.length,
  }
}

export function eisenhowerCounts(tasks: readonly Task[]): Record<Quadrant, number> {
  const counts = Object.fromEntries(QUADRANTS.map((q) => [q, 0])) as Record<Quadrant, number>
  for (const task of tasks) if (task.quadrant) counts[task.quadrant] += 1
  return counts
}

/** Hari (ISO) dengan setidaknya satu sesi fokus selesai / satu memo. */
export function focusDaySet(sessions: readonly FocusSession[]): Set<string> {
  return new Set(
    sessions
      .filter((session) => session.status === 'selesai')
      .map((session) => toIsoDate(new Date(session.endedAt))),
  )
}

export function memoDaySet(memos: readonly Memo[]): Set<string> {
  return new Set(memos.map((memo) => memo.date))
}

/** Streak hari berturut-turut sampai `today`; hari ini boleh belum terisi (tidak memutus). */
export function currentDayStreak(days: ReadonlySet<string>, today: string): number {
  let streak = 0
  for (let offset = 0; offset < 400; offset += 1) {
    const day = addDays(today, -offset)
    if (days.has(day)) streak += 1
    else if (offset > 0) break
  }
  return streak
}

/** Rekor hari berturut-turut dalam rentang `count` hari terakhir. */
export function bestDayStreak(days: ReadonlySet<string>, today: string, count = 365): number {
  let best = 0
  let run = 0
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    if (days.has(addDays(today, -offset))) {
      run += 1
      best = Math.max(best, run)
    } else if (offset > 0) {
      run = 0
    }
  }
  return best
}

export interface HabitStreak {
  id: string
  name: string
  color: string
  current: number
  best: number
}

export function habitStreaks(
  habits: readonly Habit[],
  checkIns: CheckIns,
  today: string,
  count = 120,
): HabitStreak[] {
  return habits.map((habit) => {
    let best = 0
    let run = 0
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const day = addDays(today, -offset)
      if (!isScheduled(habit, day)) continue
      if (isMet(habit, checkIns, day)) {
        run += 1
        best = Math.max(best, run)
      } else if (offset > 0) {
        run = 0
      }
    }
    return {
      id: habit.id,
      name: habit.name,
      color: (HABIT_COLORS[habit.color] ?? HABIT_COLORS[0])[0],
      current: currentStreak(habit, checkIns, today),
      best: Math.max(best, currentStreak(habit, checkIns, today)),
    }
  })
}

export interface HeatmapCell {
  day: string
  scheduled: boolean
  met: boolean
  future: boolean
}

export interface HabitHeatmap {
  weeks: HeatmapCell[][]
  rate: number
}

/** Grid ala GitHub: `weeks` minggu (Senin–Minggu) berakhir di minggu `today`. */
export function habitHeatmap(
  habit: Habit,
  checkIns: CheckIns,
  today: string,
  weeks = 20,
): HabitHeatmap {
  const endMonday = mondayOfMs(fromIsoDate(today).getTime())
  let met = 0
  let scheduled = 0
  const grid = Array.from({ length: weeks }, (_, week) => {
    const weekStart = addDays(toIsoDate(new Date(endMonday)), (week - (weeks - 1)) * 7)
    return Array.from({ length: 7 }, (_, index): HeatmapCell => {
      const day = addDays(weekStart, index)
      const future = day > today
      const isOn = isScheduled(habit, day)
      const done = !future && isOn && isMet(habit, checkIns, day)
      if (!future && isOn) {
        scheduled += 1
        if (done) met += 1
      }
      return { day, scheduled: isOn, met: done, future }
    })
  })
  return { weeks: grid, rate: Math.round((met / Math.max(1, scheduled)) * 100) }
}

/** Menit fokus per hari (ISO) dari riwayat sesi selesai. */
export function focusMinutesByDay(sessions: readonly FocusSession[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const session of sessions) {
    if (session.status !== 'selesai') continue
    const day = toIsoDate(new Date(session.endedAt))
    map.set(day, (map.get(day) ?? 0) + sessionMinutes(session))
  }
  return map
}

export interface MoodPoint {
  day: string
  mood: number
}

/** Titik mood (0–4) per hari di rentang [start, end) yang punya nilai. */
export function moodSeries(moods: MoodByDate, start: number, end: number): MoodPoint[] {
  const points: MoodPoint[] = []
  for (let ms = startOfDay(start); ms < end; ms += MS_PER_DAY) {
    const day = toIsoDate(new Date(ms))
    const mood = moods[day]
    if (mood !== undefined) points.push({ day, mood })
  }
  return points
}

/** Rata-rata mood di hari fokus tinggi vs rendah (median split). Null kalau data kurang. */
export function moodCorrelation(
  moods: MoodByDate,
  focusByDay: ReadonlyMap<string, number>,
  start: number,
  end: number,
): { high: number | null; low: number | null } {
  const samples: { mood: number; focus: number }[] = []
  for (let ms = startOfDay(start); ms < end; ms += MS_PER_DAY) {
    const day = toIsoDate(new Date(ms))
    const mood = moods[day]
    if (mood !== undefined) samples.push({ mood, focus: focusByDay.get(day) ?? 0 })
  }
  if (samples.length < 2) return { high: null, low: null }
  const sorted = [...samples].map((s) => s.focus).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  const high = samples.filter((s) => s.focus >= median)
  const low = samples.filter((s) => s.focus < median)
  const avg = (list: typeof samples): number | null =>
    list.length ? list.reduce((acc, s) => acc + s.mood, 0) / list.length : null
  return { high: avg(high), low: avg(low) }
}

export interface ScheduledSlice {
  id: string
  title: string
  color: string
  minutes: number
}

/** Total menit jadwal (bukan all-day) per jadwal di rentang [start, end). */
export function scheduledMinutes(
  schedules: readonly Schedule[],
  start: number,
  end: number,
): ScheduledSlice[] {
  const slices = new Map<string, ScheduledSlice>()
  for (const schedule of schedules) {
    if (schedule.allDay) continue
    let minutes = 0
    for (let ms = startOfDay(start); ms < end; ms += MS_PER_DAY) {
      if (occursOn(schedule, toIsoDate(new Date(ms)))) minutes += schedule.dur
    }
    if (minutes > 0) {
      slices.set(schedule.id, {
        id: schedule.id,
        title: schedule.title,
        color: (SCHEDULE_COLORS[schedule.color] ?? SCHEDULE_COLORS[0])[0],
        minutes,
      })
    }
  }
  return [...slices.values()].sort((a, b) => b.minutes - a.minutes)
}

/** Task terlambat (deadline lewat, belum selesai), terdekat dulu. */
export function lateTasks(tasks: readonly Task[], now: number, limit = 3): Task[] {
  return tasks
    .filter((task) => isOverdue(task, now))
    .sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0))
    .slice(0, limit)
}

/** Countdown terdekat yang belum lewat. */
export function upcomingCountdowns(
  countdowns: readonly Countdown[],
  now: number,
  limit = 3,
): CountdownView[] {
  return groupCountdowns(countdowns, now).upcoming.slice(0, limit)
}

export interface GoalOverviewItem {
  id: string
  title: string
  category: GoalCategory
  pct: number
  /** Judul chapter yang sedang berjalan, atau null. */
  chapter: string | null
}

export function activeGoals(goals: readonly Goal[], today: string): GoalOverviewItem[] {
  return goals
    .filter((goal) => goal.status === 'aktif')
    .map((goal) => {
      const running = goal.chapters.find((chapter) => chapterStatus(chapter, today) === 'berjalan')
      return {
        id: goal.id,
        title: goal.title,
        category: goal.category,
        pct: goalProgress(goal),
        chapter: running ? running.title : null,
      }
    })
}
