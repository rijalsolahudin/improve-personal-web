import {
  EMPTY_DAILY_DAY,
  ROUTINE_BLOCKS,
  ROUTINE_BLOCK_META,
  blockOf,
  dailyPriorities,
  parseDailyDays,
  sumProgress,
  todayTasks,
  withDailyDay,
  type DailyDay,
  type RoutineBlock,
  type WeatherKind,
} from '~/utils/dailyRoutine'
import { countOn, isScheduled } from '~/utils/habits'
import { occurrencesOn } from '~/utils/schedule'
import { END_OF_DAY, deadlineFrom } from '~/utils/tasks'
import { toIsoDate } from '~/utils/time'

import { createRoutineMock } from './routine/mock'

/** State harian (bukan data core) disimpan di localStorage; ikut terhapus saat logout. */
export const DAILY_STORAGE_KEY = 'ip-daily'

function readDays(): Record<string, DailyDay> {
  if (!import.meta.client) return {}
  try {
    return parseDailyDays(JSON.parse(localStorage.getItem(DAILY_STORAGE_KEY) ?? 'null'))
  } catch {
    // Storage rusak/diblokir: mulai kosong, jangan gagalkan halaman.
    return {}
  }
}

function writeDays(days: Record<string, DailyDay>): void {
  if (!import.meta.client) return
  try {
    localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(days))
  } catch {
    // Storage penuh/diblokir: perubahan tetap berlaku untuk sesi ini.
  }
}

/** Item blok rutinitas: jadwal hari ini di jam blok itu + langkah rutinitas. */
export interface RoutineItem {
  kind: 'schedule' | 'step'
  /** Kunci kehadiran jadwal (`<id>@<tanggal>`) atau id langkah. */
  id: string
  title: string
  isDone: boolean
}

/**
 * Data halaman Daily Routine (PRD F12): blok waktu sekarang, prioritas, to-do hari ini,
 * habit hari ini, dan progres hari. Semua dibaca dari store fitur masing-masing; yang khusus
 * halaman ini (langkah rutinitas, task yang dicentang, cuaca manual) disimpan per tanggal.
 */
export function useDailyRoutine() {
  const now = useNow()
  const today = computed(() => toIsoDate(new Date(now.value)))
  const store = useState('daily-routine', () => ({
    steps: createRoutineMock(),
    days: readDays(),
  }))
  const day = computed(() => store.value.days[today.value] ?? EMPTY_DAILY_DAY)

  function updateDay(change: Partial<DailyDay>): void {
    const days = withDailyDay(store.value.days, today.value, { ...day.value, ...change })
    store.value = { ...store.value, days }
    writeDays(days)
  }

  // ---- Jadwal & blok rutinitas ----
  const { schedules, attendance, toggleAttendance } = useSchedules()
  const timedToday = computed(() =>
    occurrencesOn(schedules.value, today.value).filter((item) => !item.schedule.allDay),
  )

  function itemsOf(block: RoutineBlock): RoutineItem[] {
    const scheduleItems = timedToday.value
      .filter((item) => blockOf(Math.floor(item.start / 60)) === block)
      .map<RoutineItem>((item) => ({
        kind: 'schedule',
        id: item.key,
        title: item.schedule.title,
        isDone: Boolean(attendance.value[item.key]),
      }))
    const stepItems = store.value.steps
      .filter((step) => step.block === block)
      .map<RoutineItem>((step) => ({
        kind: 'step',
        id: step.id,
        title: step.title,
        isDone: day.value.doneSteps.includes(step.id),
      }))
    return [...scheduleItems, ...stepItems]
  }

  const currentBlock = computed(() => {
    const block = blockOf(new Date(now.value).getHours())
    const items = itemsOf(block)
    return {
      block,
      ...ROUTINE_BLOCK_META[block],
      done: items.filter((item) => item.isDone).length,
      total: items.length,
      nextItem: items.find((item) => !item.isDone) ?? null,
    }
  })

  function toggleRoutineItem(item: RoutineItem): void {
    if (item.kind === 'schedule') return toggleAttendance(item.id)
    const done = day.value.doneSteps
    updateDay({
      doneSteps: done.includes(item.id) ? done.filter((id) => id !== item.id) : [...done, item.id],
    })
  }

  const nextSchedule = computed(() => {
    const date = new Date(now.value)
    const nowMinutes = date.getHours() * 60 + date.getMinutes()
    const next = timedToday.value
      .filter((item) => item.start > nowMinutes && !attendance.value[item.key])
      .sort((a, b) => a.start - b.start)[0]
    return next ? { occurrence: next, minutesUntil: next.start - nowMinutes } : null
  })

  // ---- Prioritas & to-do ----
  const { tasks, toggle, add } = useTasks()
  const priorities = computed(() => dailyPriorities(tasks.value, day.value.checkedTaskIds))
  const todayList = computed(() =>
    todayTasks(
      tasks.value,
      priorities.value.map(({ task }) => task.id),
      day.value.addedTaskIds,
      today.value,
      now.value,
    ),
  )

  /** Centang dari Daily dicatat per hari supaya task selesai tidak langsung hilang dari Prioritas. */
  function toggleTask(id: string): void {
    const checked = day.value.checkedTaskIds
    if (!checked.includes(id)) updateDay({ checkedTaskIds: [...checked, id] })
    toggle(id)
  }

  /**
   * Quick add (PRD F12): judul + deadline akhir hari ini + prioritas default. Deadline ini yang
   * membuat task tetap muncul di To-do setelah reload dan besok tampil sebagai terlambat.
   */
  function addTodayTask(title: string): boolean {
    return add(title, 'medium', deadlineFrom(today.value, END_OF_DAY)) !== null
  }

  // ---- Habit ----
  const habitStore = useHabits()
  const habitsToday = computed(() =>
    habitStore.habits.value
      .filter((habit) => isScheduled(habit, today.value))
      .map((habit) => ({
        habit,
        count: countOn(habitStore.checkIns.value, habit.id, today.value),
        isDone: habitStore.isMetToday(habit),
        streak: habitStore.streakOf(habit),
      })),
  )
  const habitProgress = computed(() =>
    sumProgress([
      {
        done: habitsToday.value.filter((item) => item.isDone).length,
        total: habitsToday.value.length,
      },
    ]),
  )

  // ---- Ringkasan header ----
  const { focusMinutesToday } = usePomodoro()
  const progress = computed(() => {
    const routine = ROUTINE_BLOCKS.flatMap(itemsOf)
    return sumProgress([
      { done: routine.filter((item) => item.isDone).length, total: routine.length },
      habitProgress.value,
      {
        done: priorities.value.filter(({ task }) => task.done).length,
        total: priorities.value.length,
      },
    ])
  })

  return {
    now: readonly(now),
    today,
    currentBlock,
    nextSchedule,
    scheduleCount: computed(() => timedToday.value.length),
    schedulesDone: computed(
      () => timedToday.value.filter((item) => attendance.value[item.key]).length,
    ),
    priorities,
    todayList,
    habitsToday,
    habitProgress,
    focusMinutes: focusMinutesToday,
    progress,
    weather: computed(() => day.value.weather),
    toggleRoutineItem,
    toggleTask,
    toggleHabit: (id: string) => habitStore.toggleDay(id, today.value),
    addTodayTask,
    setWeather: (weather: WeatherKind | null) => updateDay({ weather }),
  }
}
