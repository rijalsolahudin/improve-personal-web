import { QUADRANT_STYLE, type Quadrant } from '~/utils/tasks'
import {
  activeGoals,
  bestDayStreak,
  currentDayStreak,
  earliestActivityStart,
  earliestCheckInStart,
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
  onTimeRate,
  scheduledMinutes,
  taskTotals,
  upcomingCountdowns,
  windowFor,
  OVERVIEW_RANGES,
  type OverviewRange,
} from '~/utils/overview'
import { HABIT_COLORS } from '~/utils/habits'
import { fromIsoDate, MS_PER_DAY } from '~/utils/time'

const QUADRANT_ORDER: readonly Quadrant[] = ['do', 'plan', 'delegate', 'drop']

interface MoodPointLike {
  day: string
  mood: number
}

/** Rentang tahunan/keseluruhan menampilkan tren mood per bulan, bukan per hari. */
function groupMoodByMonth(points: readonly MoodPointLike[]): MoodPointLike[] {
  const buckets = new Map<string, number[]>()
  for (const point of points) {
    const key = point.day.slice(0, 7)
    const list = buckets.get(key)
    if (list === undefined) buckets.set(key, [point.mood])
    else list.push(point.mood)
  }
  return [...buckets.entries()].map(([key, list]) => ({
    day: `${key}-01`,
    mood: list.reduce((a, b) => a + b, 0) / list.length,
  }))
}

/**
 * Data halaman Overview (PRD F11): agregasi lokal dari semua store.
 *
 * Prinsip AC "kalkulasi sekali per ganti rentang":
 * - Semua sumber dipindai di SATU computed `aggregate`, bukan satu pemindaian per widget.
 * - `aggregate` hanya bergantung pada `range`, `off`, perubahan data, dan AWAL HARI - bukan pada
 *   `now` yang berdetak tiap detik. Nilai "berjalan" (task terlambat, countdown) dihitung terpisah
 *   supaya tick jam tidak memicu agregasi ulang.
 */
export function useOverview() {
  const { t } = useI18n()
  const now = useNow()
  const { longDate, dayMonth, dayMonthYear, monthShort, weekdayShort, monthYear } = useDateFormat()
  const formatTimeLeft = useTimeLeft()
  const countdownText = useCountdownText()

  const { tasks } = useTasks()
  const habitsStore = useHabits()
  const pomodoro = usePomodoro()
  const memosStore = useMemos()
  const { goals, today } = useGoals()
  const { schedules } = useSchedules()
  const { countdowns } = useCountdowns()

  const range = useState<OverviewRange>('overview-range', () => 'pekanan')
  const off = useState<number>('overview-off', () => 0)
  const habitIndex = useState<number>('overview-habit', () => 0)

  /** Awal hari ini: `now` berdetak tiap detik, nilai ini berubah sekali sehari. */
  const dayStart = computed(() => new Date(now.value).setHours(0, 0, 0, 0))

  /** Awal "Keseluruhan" = data terlama yang dimuat; belum ada data → 1 Januari tahun berjalan. */
  const allTimeStart = computed(() => {
    const earliest = earliestActivityStart({
      sessions: pomodoro.history.value,
      memos: memosStore.memos.value,
      moods: memosStore.moods.value,
      tasks: tasks.value,
      goals: goals.value,
      schedules: schedules.value,
      checkIns: habitsStore.checkIns.value,
    })
    return earliest ?? new Date(new Date(dayStart.value).getFullYear(), 0, 1).getTime()
  })

  const win = computed(() => windowFor(range.value, off.value, dayStart.value, allTimeStart.value))
  const canNav = computed(() => range.value !== 'keseluruhan')

  function labelFor(): string {
    const { start, end } = win.value
    switch (range.value) {
      case 'harian':
        return longDate(start)
      case 'pekanan':
        return `${dayMonth(start)} – ${dayMonthYear(end - MS_PER_DAY)}`
      case 'bulanan':
        return monthYear(start)
      case 'tahunan':
        return t('overview.range.year', { year: new Date(start).getFullYear() })
      case 'keseluruhan':
        return t('overview.range.allTime', { year: new Date(start).getFullYear() })
    }
  }
  const label = computed(labelFor)

  /**
   * Satu pass agregasi untuk seluruh widget. Tidak ada `now` per detik di sini - lihat komentar
   * di atas `useOverview`.
   */
  const aggregate = computed(() => {
    const window = win.value
    const history = pomodoro.history.value
    const moods = memosStore.moods.value
    const focus = focusBuckets(range.value, off.value, dayStart.value, history, allTimeStart.value)
    const focusByDay = focusMinutesByDay(history)
    const moodPoints = moodSeries(moods, window.start, window.end)

    return {
      focus,
      focusDays: focusDaySet(history),
      memoDays: memoDaySet(memosStore.memos.value),
      focusByDay,
      totals: taskTotals(tasks.value, dayStart.value, window),
      onTime: onTimeRate(tasks.value, window),
      habitRate: habitRate(
        habitsStore.habits.value,
        habitsStore.checkIns.value,
        // Data check-in yang dimuat terbatas (HABIT_LOOKBACK_DAYS); jangan hitung hari tanpa
        // riwayat sebagai "tidak tercapai". Untuk Keseluruhan ini menggantikan floor 120 hari.
        Math.max(window.start, earliestCheckInStart(habitsStore.checkIns.value) ?? window.start),
        window.end,
      ),
      habitRows: habitStreaks(habitsStore.habits.value, habitsStore.checkIns.value, today.value),
      scheduled: scheduledMinutes(schedules.value, window.start, window.end),
      moodPoints:
        range.value === 'tahunan' || range.value === 'keseluruhan'
          ? groupMoodByMonth(moodPoints)
          : moodPoints,
      correlation: moodCorrelation(moods, focusByDay, window.start, window.end),
      goals: activeGoals(goals.value, today.value, window),
      eisenhower: eisenhowerCounts(tasks.value),
    }
  })

  // ---- Grafik menit fokus -------------------------------------------------------------
  const focus = computed(() => aggregate.value.focus)
  const focusTotal = computed(() => focus.value.buckets.reduce((acc, b) => acc + b.minutes, 0))
  const focusSessions = computed(() => focus.value.buckets.reduce((acc, b) => acc + b.count, 0))
  const focusMax = computed(() => Math.max(1, ...focus.value.buckets.map((b) => b.minutes)))

  const bars = computed(() => {
    const max = Math.max(0, ...focus.value.buckets.map((bucket) => bucket.minutes))
    const multiYear = range.value === 'keseluruhan' && focus.value.buckets.length > 12
    return focus.value.buckets.map((bucket, index) => {
      const ms = bucket.start
      const minutes = bucket.minutes
      let tick = ''
      if (focus.value.unit === 'jam')
        tick = index % 3 === 0 ? String(new Date(ms).getHours()).padStart(2, '0') : ''
      else if (focus.value.unit === 'bulan')
        // Multi-tahun: label bulan akan berulang, jadi tandai pergantian tahun saja.
        tick = multiYear
          ? new Date(ms).getMonth() === 0
            ? String(new Date(ms).getFullYear())
            : ''
          : monthShort(ms)
      else if (range.value === 'pekanan') tick = weekdayShort(ms)
      else if (index % 5 === 0) tick = String(new Date(ms).getDate())
      const tip =
        focus.value.unit === 'jam'
          ? `${String(new Date(ms).getHours()).padStart(2, '0')}:00 · ${t('overview.minutesShort', { n: minutes })}`
          : `${multiYear ? monthYear(ms) : dayMonth(ms)} · ${t('overview.minutesShort', { n: minutes })}`
      return {
        key: index,
        label: tick,
        tip,
        minutes,
        highlight: minutes > 0 && minutes === max,
        height: Math.max(minutes ? 4 : 1.5, (minutes / focusMax.value) * 100),
      }
    })
  })
  const bestBucket = computed(() =>
    bars.value.reduce<(typeof bars.value)[number] | null>(
      (a, b) => (a === null || b.minutes > a.minutes ? b : a),
      null,
    ),
  )
  const focusUnitLabel = computed(() => {
    const unit =
      focus.value.unit === 'jam'
        ? t('overview.perHour')
        : focus.value.unit === 'bulan'
          ? t('overview.perMonth')
          : t('overview.perDay')
    const best = bestBucket.value
    return best && best.minutes
      ? `${unit} · ${t('overview.best')} ${best.tip.split(' · ')[0] ?? ''}`
      : unit
  })
  const barGap = computed(() => (bars.value.length > 20 ? 3 : 8))

  // ---- Statistik ----------------------------------------------------------------------
  const fmtMinutes = (m: number): string =>
    m >= 60 ? `${Math.floor(m / 60)}j${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`
  const stats = computed(() => [
    {
      key: 'focus',
      label: t('overview.stat.focus'),
      value: fmtMinutes(focusTotal.value),
      sub: t('overview.stat.focusSub'),
      bg: '#FFD9BF',
      fg: '#9A3A0C',
    },
    {
      key: 'sessions',
      label: t('overview.stat.sessions'),
      value: String(focusSessions.value),
      sub: t('overview.stat.sessionsSub', { minutes: pomodoro.config.value.focus }),
      bg: '#DCD3F4',
      fg: '#5E3A9A',
    },
    {
      key: 'habit',
      label: t('overview.stat.habit'),
      value: `${aggregate.value.habitRate}%`,
      sub: t('overview.stat.habitSub'),
      bg: '#C7E3EE',
      fg: '#1E5D78',
    },
    {
      key: 'done',
      label: t('overview.stat.done'),
      value: String(aggregate.value.totals.done),
      sub: t('overview.stat.doneSub'),
      bg: '#CDE8C6',
      fg: '#2E6A26',
    },
    {
      key: 'onTime',
      label: t('overview.stat.onTime'),
      value: `${aggregate.value.onTime}%`,
      sub: t('overview.stat.onTimeSub'),
      bg: '#F3E7B8',
      fg: '#6B5300',
    },
  ])

  // ---- Streak -------------------------------------------------------------------------
  const productiveStreak = computed(() =>
    range.value === 'keseluruhan'
      ? bestDayStreak(aggregate.value.focusDays, today.value)
      : currentDayStreak(aggregate.value.focusDays, today.value),
  )
  const memoSame = computed(() =>
    range.value === 'keseluruhan'
      ? bestDayStreak(aggregate.value.memoDays, today.value)
      : currentDayStreak(aggregate.value.memoDays, today.value),
  )
  const bigStreaks = computed(() => [
    {
      key: 'productive',
      n: productiveStreak.value,
      label: t(
        range.value === 'keseluruhan'
          ? 'overview.streak.productiveBest'
          : 'overview.streak.productive',
      ),
      bg: '#FBDDB7',
      fg: '#8A5A12',
    },
    {
      key: 'memo',
      n: memoSame.value,
      label: t(range.value === 'keseluruhan' ? 'overview.streak.memoBest' : 'overview.streak.memo'),
      bg: '#C7E3EE',
      fg: '#1E5D78',
    },
  ])
  const habitRows = computed(() => aggregate.value.habitRows)
  const streakNote = computed(() =>
    t(range.value === 'keseluruhan' ? 'overview.streak.noteBest' : 'overview.streak.note'),
  )

  // ---- Habit heatmap ------------------------------------------------------------------
  const heatmapHabits = computed(() =>
    habitsStore.habits.value.map((habit) => ({
      id: habit.id,
      name: habit.name,
      color: (HABIT_COLORS[habit.color] ?? HABIT_COLORS[0])[0],
    })),
  )
  const heatmap = computed(() => {
    const habit = habitsStore.habits.value[habitIndex.value] ?? habitsStore.habits.value[0]
    if (!habit) return null
    const grid = habitHeatmap(habit, habitsStore.checkIns.value, today.value)
    const color = (HABIT_COLORS[habit.color] ?? HABIT_COLORS[0])[0]
    return {
      name: habit.name,
      color,
      rate: grid.rate,
      weeks: grid.weeks.map((week) =>
        week.map((cell) => ({
          day: cell.day,
          color: cell.future
            ? 'transparent'
            : cell.met
              ? color
              : cell.scheduled
                ? 'var(--chip)'
                : 'transparent',
          tip: cell.future
            ? ''
            : `${dayMonth(fromIsoDate(cell.day).getTime())}${cell.met ? ` · ${t('overview.heatmap.met')}` : ''}`,
        })),
      ),
    }
  })

  // ---- Tren mood ----------------------------------------------------------------------
  const moodPoints = computed(() => aggregate.value.moodPoints)
  const moodLine = computed(() =>
    moodPoints.value.length < 2
      ? ''
      : moodPoints.value
          .map(
            (p, i) =>
              `${((i / (moodPoints.value.length - 1)) * 300).toFixed(1)},${(105 - (p.mood / 4) * 95).toFixed(1)}`,
          )
          .join(' '),
  )
  const moodArea = computed(() =>
    moodLine.value ? `M0,110 L${moodLine.value.split(' ').join(' L')} L300,110 Z` : '',
  )
  const correlation = computed(() => aggregate.value.correlation)

  // ---- Distribusi Eisenhower ----------------------------------------------------------
  const eisenhower = computed(() => {
    const counts = aggregate.value.eisenhower
    const total = Math.max(
      1,
      QUADRANT_ORDER.reduce((acc, q) => acc + counts[q], 0),
    )
    return QUADRANT_ORDER.map((quadrant) => ({
      key: quadrant,
      label: t(`eisenhower.quadrant.${quadrant}`),
      color: QUADRANT_STYLE[quadrant].solid,
      n: counts[quadrant],
      pct: (counts[quadrant] / total) * 100,
    }))
  })
  const eisenhowerNote = computed(() => {
    const doN = eisenhower.value.find((q) => q.key === 'do')?.n ?? 0
    const planN = eisenhower.value.find((q) => q.key === 'plan')?.n ?? 0
    return t(doN > planN ? 'overview.eisenhower.fire' : 'overview.eisenhower.balanced')
  })

  // ---- Waktu terjadwal ----------------------------------------------------------------
  const scheduled = computed(() => aggregate.value.scheduled)
  const scheduledMax = computed(() => Math.max(1, ...scheduled.value.map((s) => s.minutes)))
  const scheduledTotal = computed(() =>
    fmtMinutes(scheduled.value.reduce((acc, s) => acc + s.minutes, 0)),
  )

  // ---- Goal, task terlambat, countdown ------------------------------------------------
  const goalRows = computed(() => aggregate.value.goals)
  const late = computed(() =>
    lateTasks(tasks.value, now.value).map((task) => ({
      id: task.id,
      title: task.title,
      left: task.deadline !== null ? formatTimeLeft(task.deadline, now.value) : '',
    })),
  )
  const nextCountdowns = computed(() =>
    upcomingCountdowns(countdowns.value, now.value).map((view) => ({
      id: view.countdown.id,
      title: `${view.countdown.emoji} ${view.countdown.title}`,
      date: dayMonthYear(view.target),
      left: view.today ? t('countdown.today') : countdownText(view.target, now.value),
    })),
  )

  function setRange(next: OverviewRange): void {
    range.value = next
    off.value = 0
  }
  function shift(direction: -1 | 1): void {
    if (direction === 1 && off.value >= 0) return
    off.value += direction
  }
  function setHabit(index: number): void {
    habitIndex.value = index
  }

  return {
    ranges: OVERVIEW_RANGES,
    range: readonly(range),
    off: readonly(off),
    setRange,
    shift,
    canNav,
    canNext: computed(() => win.value.canNext),
    label,
    // focus
    bars,
    barGap,
    focusUnitLabel,
    // stats / streak
    stats,
    streakNote,
    bigStreaks,
    habitRows,
    // heatmap
    heatmap,
    heatmapHabits,
    habitIndex: readonly(habitIndex),
    setHabit,
    // mood
    moodLine,
    moodArea,
    moodHi: computed(() =>
      correlation.value.high === null ? '—' : correlation.value.high.toFixed(1),
    ),
    moodLo: computed(() =>
      correlation.value.low === null ? '—' : correlation.value.low.toFixed(1),
    ),
    moodFrom: computed(() =>
      moodPoints.value[0] ? dayMonth(fromIsoDate(moodPoints.value[0].day).getTime()) : '',
    ),
    moodTo: computed(() => t('overview.mood.today')),
    // eisenhower / scheduled / goals / late / countdown
    eisenhower,
    eisenhowerNote,
    scheduled,
    scheduledMax,
    scheduledTotal,
    goalRows,
    late,
    nextCountdowns,
  }
}
