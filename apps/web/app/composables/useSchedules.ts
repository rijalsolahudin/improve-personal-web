import {
  createSchedule,
  deleteSchedules,
  editSchedules,
  validateScheduleDraft,
  type EditScope,
  type Schedule,
  type ScheduleDraft,
  type ScheduleDraftError,
} from '~/utils/schedule'
import { toIsoDate } from '~/utils/time'

import { createSchedulesMock } from './schedules/mock'

/**
 * Data jadwal (PRD F1) untuk Kalender, Jadwal, dan Home. Fase 1: in-memory dari mock,
 * sama seperti Home/Goals, sampai packages/core siap.
 */
export function useSchedules() {
  const schedules = useState<Schedule[]>('schedules', () =>
    createSchedulesMock(toIsoDate(new Date())),
  )
  /** Kehadiran per kejadian, kunci `<id>@<tanggal>`. */
  const attendance = useState<Record<string, boolean>>('schedule-attendance', () => ({}))

  function findSchedule(id: string): Schedule | undefined {
    return schedules.value.find((schedule) => schedule.id === id)
  }

  /** Simpan jadwal baru atau edit kejadian `occurrence`; error validasi dikembalikan. */
  function save(
    draft: ScheduleDraft,
    edit: { id: string; occurrence: string; scope: EditScope } | null,
  ): { ok: true } | { error: ScheduleDraftError } {
    const error = validateScheduleDraft(draft)
    if (error) return { error }
    const original = edit ? findSchedule(edit.id) : undefined
    schedules.value =
      edit && original
        ? editSchedules(
            schedules.value,
            original,
            edit.occurrence,
            draft,
            edit.scope,
            crypto.randomUUID(),
          )
        : [...schedules.value, createSchedule(draft, crypto.randomUUID())]
    return { ok: true }
  }

  function remove(id: string, occurrence: string, scope: EditScope): void {
    const original = findSchedule(id)
    if (original) schedules.value = deleteSchedules(schedules.value, original, occurrence, scope)
  }

  function toggleAttendance(key: string): void {
    attendance.value = { ...attendance.value, [key]: !attendance.value[key] }
  }

  return {
    schedules: computed(() => schedules.value),
    attendance: computed(() => attendance.value),
    findSchedule,
    save,
    remove,
    toggleAttendance,
  }
}
