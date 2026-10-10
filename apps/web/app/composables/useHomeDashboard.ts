import { nextOccurrence, occurrenceStartMs, occurrencesOn, type Occurrence } from '~/utils/schedule'
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, daysUntil, toIsoDate } from '~/utils/time'

import { createHomeMock } from './home/mock'
import type { HomeMemo, HomeSchedule, Priority } from './home/types'

/** Deadline default untuk task dari quick add (design: +8 jam). */
const QUICK_ADD_DEADLINE_MS = 8 * MS_PER_HOUR

/**
 * Data widget Home (PRD F12). Fase 1: sumbernya `createHomeMock` (dummy, in-memory).
 * Begitu packages/core siap, cukup ganti isi `useState` ini dengan repository lokal.
 */
export function useHomeDashboard() {
  const now = useNow()
  const snapshot = useState('home-dashboard', () => createHomeMock(Date.now()))

  const { schedules } = useSchedules()
  const { findGoal } = useGoals()

  // Jadwal diambil dari store jadwal bersama (Kalender/Jadwal), bukan snapshot Home.
  function toHomeSchedule(occurrence: Occurrence): HomeSchedule {
    const startsAt = occurrenceStartMs(occurrence)
    return {
      id: occurrence.key,
      title: occurrence.schedule.title,
      startsAt,
      endsAt: startsAt + occurrence.schedule.dur * MS_PER_MINUTE,
      goalTitle: findGoal(occurrence.schedule.goalId)?.title ?? null,
    }
  }
  const scheduleToday = computed(() =>
    occurrencesOn(schedules.value, toIsoDate(new Date(now.value)))
      .filter((occurrence) => !occurrence.schedule.allDay)
      .map(toHomeSchedule),
  )
  const nextSchedule = computed(() => {
    const occurrence = nextOccurrence(schedules.value, now.value)
    return occurrence ? toHomeSchedule(occurrence) : null
  })

  const { tasks, toggle: toggleTask, add } = useTasks()
  const { focusMinutesToday } = usePomodoro()
  /** Task yang deadline-nya < 24 jam lagi (termasuk yang terlambat). */
  const todayTasks = computed(() =>
    tasks.value.filter((task) => task.deadline !== null && task.deadline - now.value < MS_PER_DAY),
  )

  const stats = computed(() => {
    const done = tasks.value.filter((task) => task.done).length
    return {
      productiveStreak: snapshot.value.productiveStreak,
      focusMinutes: focusMinutesToday.value,
      tasksDone: done,
      tasksTotal: tasks.value.length,
      tasksPercent: tasks.value.length ? Math.round((done / tasks.value.length) * 100) : 0,
    }
  })

  // Habit dari store habit bersama; Home cuma menampilkan yang terjadwal hari ini.
  const habitStore = useHabits()
  const habits = computed(() =>
    habitStore.habits.value
      .filter((habit) => isScheduled(habit, habitStore.today.value))
      .map((habit) => {
        const done = habitStore.isMetToday(habit)
        const streakNow = habitStore.streakOf(habit)
        return {
          id: habit.id,
          name: habit.name,
          color: (HABIT_COLORS[habit.color] ?? HABIT_COLORS[0])[0],
          done,
          streak: streakNow - (done ? 1 : 0),
          streakNow,
        }
      }),
  )
  const habitsDone = computed(() => habits.value.filter((habit) => habit.done).length)

  const goal = computed(() => {
    const value = snapshot.value.goal
    return value ? { ...value, daysLeft: daysUntil(value.endsAt, now.value) } : null
  })

  const countdowns = computed(() =>
    [...snapshot.value.countdowns]
      .sort((a, b) => a.at - b.at)
      .map((item) => ({ ...item, daysLeft: daysUntil(item.at, now.value) })),
  )

  const memoStore = useMemos()
  const memosToday = computed(() => memosOn(memoStore.memos.value, toIsoDate(new Date(now.value))))

  /** Quick add Home: deadline otomatis +8 jam (design). */
  function addTask(title: string, priority: Priority): boolean {
    return add(title, priority, Date.now() + QUICK_ADD_DEADLINE_MS)
  }

  function toggleHabit(id: string): void {
    habitStore.toggleToday(id)
  }

  /** Memo cepat Home: halaman jurnal hari ini + mood hari ini (kalau dipilih). */
  function saveMemo(entry: HomeMemo): boolean {
    const today = toIsoDate(new Date())
    const saved = memoStore.add({
      date: today,
      title: '',
      text: entry.text,
      feelings: [],
      paper: entry.paper,
    })
    if (saved && entry.mood !== null) memoStore.setMood(today, entry.mood)
    return saved
  }

  return {
    now: readonly(now),
    nextSchedule,
    scheduleToday,
    stats,
    tasks,
    todayTasks,
    habits,
    habitsDone,
    goal,
    countdowns,
    memosToday,
    toggleTask,
    addTask,
    toggleHabit,
    saveMemo,
  }
}
