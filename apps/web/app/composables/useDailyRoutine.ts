import {
  ROUTINE_BLOCKS,
  ROUTINE_BLOCK_META,
  blockOf,
  dailyPriorities,
  sumProgress,
  todayTasks,
  type RoutineBlock,
  type WeatherKind,
} from '~/utils/dailyRoutine'
import { countOn, isScheduled } from '~/utils/habits'
import { occurrencesOn } from '~/utils/schedule'
import { toIsoDate } from '~/utils/time'

import { createRoutineMock } from './routine/mock'

interface DailyDay {
  doneSteps: readonly string[]
  /** Task yang dicentang dari Daily hari ini: tetap tampil dicoret di Prioritas sampai ganti hari. */
  checkedTaskIds: readonly string[]
  weather: WeatherKind | null
  /** Task yang ditambah lewat quick add hari ini (tampil walau tanpa deadline). */
  addedTaskIds: readonly string[]
}

const EMPTY_DAY: DailyDay = { doneSteps: [], checkedTaskIds: [], weather: null, addedTaskIds: [] }

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
    days: {} as Record<string, DailyDay>,
  }))
  const day = computed(() => store.value.days[today.value] ?? EMPTY_DAY)

  function updateDay(change: Partial<DailyDay>): void {
    store.value = {
      ...store.value,
      days: { ...store.value.days, [today.value]: { ...day.value, ...change } },
    }
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
   * Quick add: tanpa deadline (keputusan user, beda dari PRD F12 "deadline default hari ini").
   * Id-nya dicatat per hari supaya tetap muncul di grup "Tanpa deadline" hari ini.
   */
  function addTodayTask(title: string): boolean {
    const id = add(title, 'medium', null)
    if (id === null) return false
    updateDay({ addedTaskIds: [...day.value.addedTaskIds, id] })
    return true
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
