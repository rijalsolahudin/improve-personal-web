import {
  applyHabitDraft,
  countOn,
  currentStreak,
  isMet,
  isScheduled,
  nextCount,
  setCount,
  validateHabitDraft,
  type CheckIns,
  type Habit,
  type HabitDraft,
  type HabitDraftError,
} from '~/utils/habits'
import { toIsoDate } from '~/utils/time'

import { createHabitsMock } from './habits/mock'

/**
 * Data habit + check-in (PRD F7) untuk halaman Habit, Home, dan nanti Overview.
 * Fase 1: in-memory dari mock, sama seperti fitur lain, sampai packages/core siap.
 */
export function useHabits() {
  const now = useNow()
  const today = computed(() => toIsoDate(new Date(now.value)))
  const store = useState('habits', () => createHabitsMock(toIsoDate(new Date())))

  const habits = computed<Habit[]>(() => store.value.habits)
  const checkIns = computed<CheckIns>(() => store.value.checkIns)

  function findHabit(id: string | null | undefined): Habit | undefined {
    return id ? store.value.habits.find((habit) => habit.id === id) : undefined
  }

  /** Klik kotak tanggal `day` (hari depan & bukan jadwal diabaikan). */
  function toggleDay(id: string, day: string): void {
    const habit = findHabit(id)
    if (!habit || day > today.value || !isScheduled(habit, day)) return
    const count = nextCount(habit, countOn(store.value.checkIns, id, day), day === today.value)
    store.value = { ...store.value, checkIns: setCount(store.value.checkIns, id, day, count) }
  }

  /** "Quick habit check" Home: satu klik = tercapai / batal. */
  function toggleToday(id: string): void {
    const habit = findHabit(id)
    if (!habit) return
    const met = isMet(habit, store.value.checkIns, today.value)
    store.value = {
      ...store.value,
      checkIns: setCount(store.value.checkIns, id, today.value, met ? 0 : habit.target),
    }
  }

  function save(
    draft: HabitDraft,
    editId: string | null,
  ): { id: string } | { error: HabitDraftError } {
    const error = validateHabitDraft(draft)
    if (error) return { error }
    const saved = applyHabitDraft(draft, findHabit(editId)?.id ?? crypto.randomUUID())
    const exists = store.value.habits.some((habit) => habit.id === saved.id)
    store.value = {
      ...store.value,
      habits: exists
        ? store.value.habits.map((habit) => (habit.id === saved.id ? saved : habit))
        : [...store.value.habits, saved],
    }
    return { id: saved.id }
  }

  /** Hapus habit beserta riwayat check-in-nya (design: "Riwayat ikut hilang"). */
  function remove(id: string): void {
    const { [id]: _removed, ...checkInsLeft } = store.value.checkIns
    store.value = {
      habits: store.value.habits.filter((habit) => habit.id !== id),
      checkIns: checkInsLeft,
    }
  }

  return {
    habits,
    checkIns,
    today,
    findHabit,
    isMetToday: (habit: Habit) => isMet(habit, checkIns.value, today.value),
    streakOf: (habit: Habit) => currentStreak(habit, checkIns.value, today.value),
    toggleDay,
    toggleToday,
    save,
    remove,
  }
}
