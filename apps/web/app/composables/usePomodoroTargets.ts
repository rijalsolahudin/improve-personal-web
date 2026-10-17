import {
  uniqueTargetOptions,
  type PomodoroTargetMode,
  type PomodoroTargetOption,
} from '~/utils/pomodoro'
import { HABIT_COLORS, isScheduled } from '~/utils/habits'
import { SCHEDULE_COLORS, formatMinutes, occurrencesOn } from '~/utils/schedule'
import { toIsoDate } from '~/utils/time'

type ListMode = Exclude<PomodoroTargetMode, 'free'>

/**
 * Pilihan target fokus per sumber (design `pmPicker`): task belum selesai, jadwal (berjam)
 * hari ini, dan habit hari ini yang belum tercapai. Dibaca dari store fitur masing-masing.
 */
export function usePomodoroTargets() {
  const { t } = useI18n()
  const now = useNow()
  const today = computed(() => toIsoDate(new Date(now.value)))
  const { tasks } = useTasks()
  const { schedules } = useSchedules()
  const habitStore = useHabits()

  const options = computed<Record<ListMode, PomodoroTargetOption[]>>(() => ({
    task: uniqueTargetOptions(
      tasks.value
        .filter((task) => !task.done)
        .map((task) => ({
          label: task.title,
          color: `var(--prio-${task.priority}-fg)`,
          meta: t(`priority.${task.priority}`),
        })),
    ),
    jadwal: uniqueTargetOptions(
      occurrencesOn(schedules.value, today.value)
        .filter((item) => !item.schedule.allDay)
        .map((item) => ({
          label: item.schedule.title,
          color: (SCHEDULE_COLORS[item.schedule.color] ?? SCHEDULE_COLORS[0])[0],
          meta: formatMinutes(item.start),
        })),
    ),
    habit: uniqueTargetOptions(
      habitStore.habits.value
        .filter((habit) => isScheduled(habit, today.value) && !habitStore.isMetToday(habit))
        .map((habit) => {
          const streak = habitStore.streakOf(habit)
          return {
            label: habit.name,
            color: (HABIT_COLORS[habit.color] ?? HABIT_COLORS[0])[0],
            meta: streak > 0 ? `🔥 ${streak}` : '',
          }
        }),
    ),
  }))

  return { options }
}
