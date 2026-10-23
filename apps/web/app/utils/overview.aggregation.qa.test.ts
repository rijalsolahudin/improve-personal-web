import { describe, expect, it } from 'vitest'

import type { CheckIns, Habit } from '~/utils/habits'
import type { Memo } from '~/utils/memo'
import type { FocusSession } from '~/utils/pomodoro'
import type { Schedule } from '~/utils/schedule'
import type { Task } from '~/utils/tasks'
import {
  bestDayStreak,
  eisenhowerCounts,
  focusBuckets,
  focusDaySet,
  focusMinutesByDay,
  habitHeatmap,
  habitRate,
  habitStreaks,
  lateTasks,
  memoDaySet,
  moodCorrelation,
  moodSeries,
  scheduledMinutes,
  taskTotals,
  windowFor,
} from '~/utils/overview'
import { MS_PER_DAY, addDays, toIsoDate } from '~/utils/time'

/**
 * QA T13 — AC "agregasi satu kali per ganti rentang, bukan per widget re-scan".
 *
 * Test ini mengukur satu pass agregasi penuh seperti yang dilakukan `useOverview` (semua fungsi
 * `utils/overview` yang dipanggil computed widget), lalu membandingkannya dengan budget INP
 * `apps/web/.claude/rules/performance.md` (INP ≤ 200 ms). Kalau satu pass saja sudah > 200 ms,
 * setiap ganti rentang / setiap tick 1 detik (lihat `overview.range.qa.test.ts`) memblokir main
 * thread lebih lama dari budget.
 *
 * Fixture sengaja "user sibuk tapi wajar": 20 jadwal rutin mingguan (Senin–Jumat), 20 habit dengan
 * 400 hari check-in, 150 sesi fokus, 250 memo, 150 task. Semua masih di dalam jendela data yang
 * benar-benar dimuat app (pomodoro 180 hari, habit 400 hari).
 */

const NOW = new Date(2026, 9, 14, 15).getTime()
const TODAY = toIsoDate(new Date(NOW))

const sessions: FocusSession[] = Array.from({ length: 150 }, (_, i) => {
  const endedAt = NOW - i * MS_PER_DAY + 2 * 3_600_000
  return {
    id: `s${i}`,
    startedAt: endedAt - 25 * 60_000,
    endedAt,
    target: 'Fokus',
    status: 'selesai' as const,
  }
})
const memos: Memo[] = Array.from({ length: 250 }, (_, i) => ({
  id: `m${i}`,
  date: addDays(TODAY, -i),
  createdAt: NOW,
  title: `Memo ${i}`,
  text: 'isi jurnal',
  feelings: [],
  paper: 'plain' as Memo['paper'],
}))
const moods: Record<string, number> = {}
for (let i = 0; i < 250; i += 1) moods[addDays(TODAY, -i)] = i % 5
const habits: Habit[] = Array.from({ length: 20 }, (_, h) => ({
  id: `h${h}`,
  name: `Habit ${h}`,
  icon: 'book-open',
  sticker: null,
  color: 0,
  days: null,
  target: 1,
  goalId: null,
  isArchived: false,
}))
const checkIns: CheckIns = {}
for (const habit of habits) {
  checkIns[habit.id] = {}
  for (let i = 0; i < 400; i += 1) checkIns[habit.id]![addDays(TODAY, -i)] = i % 3 === 0 ? 1 : 0
}
const schedules: Schedule[] = Array.from({ length: 20 }, (_, i) => ({
  id: `sc${i}`,
  title: `Jadwal ${i}`,
  color: 0,
  start: addDays(TODAY, -300 + i),
  time: '09:00',
  dur: 60,
  allDay: false,
  rec: { type: 'weekly', days: [1, 2, 3, 4, 5], interval: 1 },
  ends: { type: 'never' },
  exceptions: [],
  goalId: null,
}))
const tasks: Task[] = Array.from({ length: 150 }, (_, i) => ({
  id: `t${i}`,
  title: `Task ${i}`,
  priority: 'medium',
  deadline: NOW - i * MS_PER_DAY,
  done: i % 2 === 0,
  scheduleId: null,
  quadrant: (['do', 'plan', 'delegate', 'drop'] as const)[i % 4]!,
  position: 0,
}))

const INP_BUDGET_MS = 200

function aggregationPass(): void {
  const win = windowFor('tahunan', 0, NOW)
  const focusDays = focusDaySet(sessions)
  const focusByDay = focusMinutesByDay(sessions)
  focusBuckets('tahunan', 0, NOW, sessions)
  memoDaySet(memos)
  moodSeries(moods, win.start, win.end)
  moodCorrelation(moods, focusByDay, win.start, win.end)
  habitRate(habits, checkIns, Math.max(win.start, NOW - 120 * MS_PER_DAY), win.end)
  habitStreaks(habits, checkIns, TODAY)
  habitHeatmap(habits[0]!, checkIns, TODAY)
  scheduledMinutes(schedules, win.start, win.end)
  bestDayStreak(focusDays, TODAY)
  taskTotals(tasks, NOW)
  eisenhowerCounts(tasks)
  lateTasks(tasks, NOW)
}

describe('AC3 - biaya agregasi satu pass', () => {
  it(`satu pass agregasi rentang tahunan <= ${INP_BUDGET_MS} ms (budget INP)`, () => {
    aggregationPass() // pemanasan: JIT + cache formatter Intl
    let best = Number.POSITIVE_INFINITY
    for (let run = 0; run < 3; run += 1) {
      const started = performance.now()
      aggregationPass()
      best = Math.min(best, performance.now() - started)
    }

    expect(
      best,
      `satu pass agregasi = ${best.toFixed(0)} ms (20 jadwal mingguan, 20 habit, 150 sesi, 250 memo, 150 task)`,
    ).toBeLessThan(INP_BUDGET_MS)
  }, 60_000)
})
