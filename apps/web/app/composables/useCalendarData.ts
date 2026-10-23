import { memosOn, plainText } from '~/utils/memo'
import { occurrencesBetween, occurrencesOn, type Occurrence } from '~/utils/schedule'
import { toIsoDate } from '~/utils/time'

export interface CalendarMarker {
  key: string
  kind: 'countdown' | 'goal' | 'chapter'
  glyph: string
  /** Warna tile penanda. */
  color: string
  title: string
  /** Nama goal untuk penanda akhir chapter. */
  goal?: string
}

const GOAL_MARKER_COLOR = 'var(--icon-goals)'
const CHAPTER_MARKER_COLOR = 'var(--cat-karier)'
const COUNTDOWN_GLYPH = '⏳'

/**
 * Isi Kalender per tanggal: kejadian jadwal, to-do ber-deadline, penanda (countdown,
 * target goal, akhir chapter), dan memo. Sumbernya store masing-masing fitur.
 */
export function useCalendarData() {
  const { schedules, attendance, toggleAttendance } = useSchedules()
  const { tasks, toggle: toggleTask } = useTasks()
  const { upcoming: countdowns } = useCountdowns()
  const { memos, moodOn } = useMemos()
  const { t } = useI18n()
  const { goals } = useGoals()

  const dayOf = (ms: number): string => toIsoDate(new Date(ms))

  function occurrences(day: string): Occurrence[] {
    return occurrencesOn(schedules.value, day)
  }

  /**
   * Kejadian per tanggal untuk daftar hari berurutan, diekspansi SATU kali untuk seluruh rentang.
   * Dipakai view bulan & timeline pekan/hari supaya tidak mengulang ekspansi untuk tiap kolom.
   */
  function occurrencesByDay(days: readonly string[]): Map<string, Occurrence[]> {
    const byDay = new Map<string, Occurrence[]>()
    const [head] = days
    if (head === undefined) return byDay

    let first = head
    let last = head
    for (const day of days) {
      byDay.set(day, [])
      if (day < first) first = day
      if (day > last) last = day
    }
    for (const occurrence of occurrencesBetween(schedules.value, first, last)) {
      byDay.get(occurrence.day)?.push(occurrence)
    }
    return byDay
  }

  function tasksOn(day: string) {
    return tasks.value.filter((task) => task.deadline !== null && dayOf(task.deadline) === day)
  }

  function markersOn(day: string): CalendarMarker[] {
    const fromCountdowns = countdowns.value
      .filter((countdown) => dayOf(countdown.at) === day)
      .map<CalendarMarker>((countdown) => ({
        key: `cd-${countdown.id}`,
        kind: 'countdown',
        glyph: COUNTDOWN_GLYPH,
        color: countdown.ink,
        title: countdown.title,
      }))
    const fromGoals = goals.value.flatMap<CalendarMarker>((goal) => [
      ...(goal.end === day
        ? [
            {
              key: `g-${goal.id}`,
              kind: 'goal' as const,
              glyph: '◎',
              color: GOAL_MARKER_COLOR,
              title: goal.title,
            },
          ]
        : []),
      ...goal.chapters.flatMap((chapter, index) =>
        chapter.end === day
          ? [
              {
                key: `c-${chapter.id}`,
                kind: 'chapter' as const,
                glyph: String(index + 1),
                color: CHAPTER_MARKER_COLOR,
                title: chapter.title,
                goal: goal.title,
              },
            ]
          : [],
      ),
    ])
    return [...fromCountdowns, ...fromGoals]
  }

  /** Memo terbaru di tanggal itu (teks polos, mention → judul jadwal) + mood hari itu. */
  function memoOn(day: string): { text: string | null; mood: number | null } | null {
    const latest = memosOn(memos.value, day)[0]
    const mood = moodOn(day)
    if (!latest && mood === null) return null
    const titleOf = (id: string): string | null =>
      schedules.value.find((schedule) => schedule.id === id)?.title ?? null
    return {
      text: latest ? plainText(latest.text, titleOf, t('memo.deletedSchedule')) : null,
      mood,
    }
  }

  return {
    attendance,
    occurrences,
    occurrencesByDay,
    tasksOn,
    markersOn,
    memoOn,
    toggleAttendance,
    toggleTask,
  }
}
