// Overview (PRD F11): agregasi lokal lintas fitur. Fungsi murni; waktu di-inject.
// Rentang: keseluruhan / harian / pekanan / bulanan / tahunan; `off` 0 = sekarang, negatif = mundur.

import type { Countdown, CountdownView } from './countdown'
import { groupCountdowns } from './countdown'
import { chapterStatus, goalProgress, type Goal, type GoalCategory } from './goals'
import {
  HABIT_COLORS,
  completionRate,
  currentStreak,
  isMet,
  isScheduled,
  type CheckIns,
  type Habit,
} from './habits'
import type { Memo, MoodByDate } from './memo'
import { sessionMinutes, type FocusSession } from './pomodoro'
import { SCHEDULE_COLORS, occurrencesBetween, type Schedule } from './schedule'
import { isOverdue, QUADRANTS, type Quadrant, type Task } from './tasks'
import {
  MS_PER_DAY,
  MS_PER_HOUR,
  addDays,
  deviceTimeZone,
  fromIsoDate,
  isIsoDate,
  toIsoDate,
} from './time'

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

/** Rentang [start, end) yang dipakai filter task/goal. */
export interface OverviewRangeWindow {
  readonly start: number
  readonly end: number
}

/**
 * Batas bawah "Keseluruhan" untuk pemanggil yang tidak punya data.
 *
 * `windowFor` sengaja fungsi murni tanpa akses store. Di app, pemanggil mengirim timestamp data
 * terlama (`earliestActivityStart`); nilai ini hanya jaring pengaman supaya "Keseluruhan" tidak
 * pernah kembali ke 1 Januari tahun berjalan walau data belum termuat.
 */
export const ALL_TIME_FLOOR = new Date(2000, 0, 1).getTime()

export function windowFor(
  range: OverviewRange,
  off: number,
  now: number,
  allTimeStart?: number,
): OverviewWindow {
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
        start: startOfDay(allTimeStart ?? ALL_TIME_FLOOR),
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
  allTimeStart?: number,
): { unit: BucketUnit; buckets: Bucket[] } {
  const today = startOfDay(now)
  const date = new Date(today)
  const win = windowFor(range, off, now, allTimeStart)
  let slots: { start: number; end: number }[] = []
  let unit: BucketUnit = 'hari'
  if (range === 'harian') {
    unit = 'jam'
    const base = new Date(date.getFullYear(), date.getMonth(), date.getDate() + off)
    // PRD F11 "Harian: per jam (0:00–23:00)" - sesi dini hari ikut terhitung.
    for (let hour = 0; hour < 24; hour += 1) {
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
    // Keseluruhan: satu slot per bulan, dari bulan data terlama sampai bulan berjalan.
    unit = 'bulan'
    const first = new Date(win.start)
    const last = new Date(win.end - 1)
    const lastMonth = new Date(last.getFullYear(), last.getMonth(), 1).getTime()
    for (
      let cursor = new Date(first.getFullYear(), first.getMonth(), 1);
      cursor.getTime() <= lastMonth;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    ) {
      const start = cursor.getTime()
      slots.push({ start, end: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime() })
    }
  }

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

/**
 * Ringkasan task. `window` (opsional) membuat `done` mengikuti rentang: hanya task yang
 * `completedAt`-nya jatuh di [start, end). Tanpa `window`, perilaku lama dipertahankan (semua task
 * selesai) supaya pemanggil non-rentang tidak berubah.
 */
export function taskTotals(
  tasks: readonly Task[],
  now: number,
  window?: OverviewRangeWindow,
): TaskTotals {
  return {
    done: window
      ? tasks.filter((task) => isCompletedWithin(task, window)).length
      : tasks.filter((task) => task.done).length,
    overdue: tasks.filter((task) => isOverdue(task, now)).length,
    total: tasks.length,
  }
}

/** Task punya `completedAt` yang jatuh di rentang (inklusif awal, eksklusif akhir). */
function isCompletedWithin(task: Task, window: OverviewRangeWindow): boolean {
  const completedAt = task.completedAt ?? null
  return (
    task.done && completedAt !== null && completedAt >= window.start && completedAt < window.end
  )
}

/**
 * Persentase task selesai tepat waktu di rentang: selesai sebelum/tepat deadline.
 * Task tanpa deadline tidak dihitung (tidak bisa disebut tepat waktu maupun terlambat).
 */
export function onTimeRate(tasks: readonly Task[], window: OverviewRangeWindow): number {
  let withDeadline = 0
  let onTime = 0
  for (const task of tasks) {
    if (!isCompletedWithin(task, window)) continue
    const completedAt = task.completedAt ?? 0
    if (task.deadline === null) continue
    withDeadline += 1
    if (completedAt <= task.deadline) onTime += 1
  }
  return withDeadline ? Math.round((onTime / withDeadline) * 100) : 0
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

/** Rekor hari berturut-turut. Default: sepanjang data yang ada (Keseluruhan = all-time). */
export function bestDayStreak(days: ReadonlySet<string>, today: string, count?: number): number {
  if (!days.size) return 0
  const start = count === undefined ? earliestDay(days) : addDays(today, -(count - 1))
  if (start > today) return 0
  let best = 0
  let run = 0
  for (let day = start; day <= today; day = addDays(day, 1)) {
    if (days.has(day)) {
      run += 1
      best = Math.max(best, run)
    } else {
      run = 0
    }
  }
  return best
}

/** Tanggal ISO paling awal di himpunan. */
function earliestDay(days: ReadonlySet<string>): string {
  let earliest: string | null = null
  for (const day of days) {
    if (earliest === null || day < earliest) earliest = day
  }
  return earliest ?? ''
}

export interface HabitStreak {
  id: string
  name: string
  color: string
  current: number
  best: number
}

/** Streak habit aktif + rekor. Default rekor: sepanjang check-in yang ada (bukan 120 hari). */
export function habitStreaks(
  habits: readonly Habit[],
  checkIns: CheckIns,
  today: string,
  count?: number,
): HabitStreak[] {
  return habits.map((habit) => {
    const entries = checkIns[habit.id] ?? {}
    const start =
      count === undefined ? earliestCheckedDay(entries, today) : addDays(today, -(count - 1))
    let best = 0
    let run = 0
    for (let day = start; day <= today; day = addDays(day, 1)) {
      if (!isScheduled(habit, day)) continue
      if (isMet(habit, checkIns, day)) {
        run += 1
        best = Math.max(best, run)
      } else {
        run = 0
      }
    }
    const current = currentStreak(habit, checkIns, today)
    return {
      id: habit.id,
      name: habit.name,
      color: (HABIT_COLORS[habit.color] ?? HABIT_COLORS[0])[0],
      current,
      best: Math.max(best, current),
    }
  })
}

/** Hari check-in paling awal milik satu habit; `today` kalau belum ada riwayat. */
function earliestCheckedDay(entries: Readonly<Record<string, number>>, today: string): string {
  let earliest: string | null = null
  for (const day of Object.keys(entries)) {
    if (earliest === null || day < earliest) earliest = day
  }
  return earliest ?? today
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
  return moodsWithin(moods, start, end).map(([day, mood]) => ({ day, mood }))
}

/** Entri mood di [start, end), urut tanggal. Iterasi hanya hari yang punya mood (bukan semua hari). */
function moodsWithin(moods: MoodByDate, start: number, end: number): [string, number][] {
  const from = toIsoDate(new Date(startOfDay(start)))
  const to = toIsoDate(new Date(end - 1))
  return Object.entries(moods)
    .filter(([day, mood]) => mood !== undefined && day >= from && day <= to)
    .sort(([a], [b]) => a.localeCompare(b))
}

/** Rata-rata mood di hari fokus tinggi vs rendah (median split). Null kalau data kurang. */
export function moodCorrelation(
  moods: MoodByDate,
  focusByDay: ReadonlyMap<string, number>,
  start: number,
  end: number,
): { high: number | null; low: number | null } {
  const samples: { mood: number; focus: number }[] = []
  for (const [day, mood] of moodsWithin(moods, start, end)) {
    samples.push({ mood, focus: focusByDay.get(day) ?? 0 })
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

/**
 * Total menit jadwal (bukan all-day) per jadwal di rentang [start, end).
 *
 * Ekspansi dilakukan SEKALI untuk seluruh rentang lewat cache `occurrencesBetween` - bukan
 * `occursOn` per hari × jadwal. Versi lama memanggil `deviceTimeZone()` (membuat
 * `Intl.DateTimeFormat` baru) dan mengekspansi grid bulan untuk setiap hari, sehingga satu pass
 * tahunan dengan 20 jadwal memakan ratusan milidetik.
 */
export function scheduledMinutes(
  schedules: readonly Schedule[],
  start: number,
  end: number,
  tz = deviceTimeZone(),
): ScheduledSlice[] {
  if (end <= start) return []
  const from = toIsoDate(new Date(startOfDay(start)))
  const to = toIsoDate(new Date(end - 1))
  if (to < from) return []

  const active = schedules.filter((schedule) => {
    if (schedule.allDay) return false
    if (schedule.start > to) return false
    if (schedule.ends.type === 'until' && schedule.ends.date < from) return false
    return true
  })
  if (!active.length) return []

  const minutes = new Map<string, number>()
  for (const occurrence of occurrencesBetween(active, from, to, tz)) {
    const id = occurrence.schedule.id
    minutes.set(id, (minutes.get(id) ?? 0) + occurrence.schedule.dur)
  }

  const byId = new Map(active.map((schedule) => [schedule.id, schedule]))

  return [...minutes.entries()]
    .map(([id, total]) => {
      const schedule = byId.get(id)
      return {
        id,
        title: schedule?.title ?? '',
        color: (SCHEDULE_COLORS[schedule?.color ?? 0] ?? SCHEDULE_COLORS[0])[0],
        minutes: total,
      }
    })
    .sort((a, b) => b.minutes - a.minutes)
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

/**
 * Goal aktif yang punya chapter beririsan dengan rentang.
 *
 * `window` opsional: tanpa window (pemanggil lama) semua goal aktif tampil. Goal tanpa chapter
 * tetap tampil karena tidak punya tanggal untuk difilter.
 */
export function activeGoals(
  goals: readonly Goal[],
  today: string,
  window?: OverviewRangeWindow,
): GoalOverviewItem[] {
  const from = window === undefined ? null : toIsoDate(new Date(startOfDay(window.start)))
  const to = window === undefined ? null : toIsoDate(new Date(window.end - 1))
  return goals
    .filter((goal) => goal.status === 'aktif')
    .filter((goal) => {
      if (from === null || to === null || goal.chapters.length === 0) return true
      return goal.chapters.some((chapter) => chapter.start <= to && chapter.end >= from)
    })
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

/** Awal hari dari check-in paling awal di semua habit, atau `null` kalau belum ada check-in. */
export function earliestCheckInStart(checkIns: CheckIns): number | null {
  let earliest: string | null = null
  for (const entries of Object.values(checkIns)) {
    for (const day of Object.keys(entries)) {
      if (!isIsoDate(day)) continue
      if (earliest === null || day < earliest) earliest = day
    }
  }
  return earliest === null ? null : startOfDay(fromIsoDate(earliest).getTime())
}

/** Semua sumber yang menentukan seberapa jauh "Keseluruhan" harus mundur. */
export interface OverviewActivity {
  readonly sessions: readonly FocusSession[]
  readonly memos: readonly Memo[]
  readonly moods: MoodByDate
  readonly tasks: readonly Task[]
  readonly goals: readonly Goal[]
  readonly schedules: readonly Schedule[]
  readonly checkIns: CheckIns
}

/**
 * Timestamp data terlama yang dimuat (awal hari), atau `null` kalau belum ada data.
 *
 * Dipakai `windowFor('keseluruhan', ...)` supaya "semua data" benar-benar mencakup data lama -
 * bukan dipotong ke 1 Januari tahun berjalan.
 */
export function earliestActivityStart(input: OverviewActivity): number | null {
  let earliest: number | null = null
  const consider = (value: number | null | undefined): void => {
    if (value === null || value === undefined || !Number.isFinite(value)) return
    if (earliest === null || value < earliest) earliest = value
  }
  const considerDay = (day: string): void => {
    if (isIsoDate(day)) consider(fromIsoDate(day).getTime())
  }

  for (const session of input.sessions) consider(session.endedAt)
  for (const memo of input.memos) considerDay(memo.date)
  for (const day of Object.keys(input.moods)) considerDay(day)
  for (const task of input.tasks) {
    consider(task.completedAt ?? null)
    consider(task.deadline)
  }
  for (const goal of input.goals) considerDay(goal.start)
  for (const schedule of input.schedules) considerDay(schedule.start)
  for (const entries of Object.values(input.checkIns)) {
    for (const day of Object.keys(entries)) considerDay(day)
  }

  return earliest === null ? null : startOfDay(earliest)
}
