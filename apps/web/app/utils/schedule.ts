// Jadwal (PRD F1) + logika kalender (F6), mengikuti Home Desktop.dc.html `calVals`.
// Fungsi murni; tanggal ISO lokal `YYYY-MM-DD`, jam `HH:MM`.

import { addDays, daysBetween, fromIsoDate, isIsoDate, toIsoDate } from './time'

/** Palet jadwal design: [solid, tint, teks]. Index disimpan di `Schedule.color`. */
export const SCHEDULE_COLORS = [
  ['#9B4FC9', '#EEE6FA', '#6B3FA0'],
  ['#FF6A13', '#FFE3D2', '#B4400C'],
  ['#1DA20F', '#E0F2DA', '#2E6A26'],
  ['#0A55E6', '#DDE7FB', '#0A3FA8'],
  ['#F03FBF', '#FCE0F2', '#9A2F82'],
  ['#E6A800', '#FFF0C8', '#8A5A00'],
  ['#E2445C', '#FFE1DA', '#B0283E'],
] as const

export type Recurrence =
  | { type: 'once' }
  | { type: 'daily'; n: number }
  /** `days`: 0 = Minggu … 6 = Sabtu; `interval`: tiap 1 atau 2 minggu. */
  | { type: 'weekly'; days: number[]; interval: number }
  | { type: 'monthly' }

export type RecurrenceType = Recurrence['type']

export interface Schedule {
  id: string
  title: string
  color: number
  /** Tanggal kejadian pertama. */
  start: string
  time: string
  /** Durasi menit. */
  dur: number
  allDay: boolean
  rec: Recurrence
  /** Kejadian terakhir yang masih berlaku (hasil "ini & berikutnya"). */
  until: string | null
  /** Tanggal yang dilewati (hasil edit/hapus "kejadian ini"). */
  exceptions: string[]
  /** Goal tertaut (PRD F13 "Untuk goal"), opsional. */
  goalId: string | null
}

export const SCHEDULE_TITLE_MAX = 120
export const DAILY_N_OPTIONS = [1, 2, 3, 4, 5, 6] as const
/** Urutan hari di UI: Senin dulu. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

// ---- Waktu ---------------------------------------------------------------------------

const pad = (value: number): string => String(value).padStart(2, '0')

export function toMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function formatMinutes(total: number): string {
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
export const isTime = (value: string): boolean => TIME.test(value)

/** Senin di minggu yang sama. */
export function mondayOf(iso: string): string {
  return addDays(iso, -((fromIsoDate(iso).getDay() + 6) % 7))
}

// ---- Kejadian ------------------------------------------------------------------------

export function occursOn(schedule: Schedule, day: string): boolean {
  if (day < schedule.start) return false
  if (schedule.until && day > schedule.until) return false
  if (schedule.exceptions.includes(day)) return false
  const { rec } = schedule
  const diff = daysBetween(schedule.start, day)
  switch (rec.type) {
    case 'once':
      return diff === 0
    case 'daily':
      return diff % Math.max(1, rec.n) === 0
    case 'weekly': {
      const weeks = daysBetween(mondayOf(schedule.start), mondayOf(day)) / 7
      return rec.days.includes(fromIsoDate(day).getDay()) && weeks % Math.max(1, rec.interval) === 0
    }
    case 'monthly':
      return fromIsoDate(day).getDate() === fromIsoDate(schedule.start).getDate()
  }
}

export interface Occurrence {
  schedule: Schedule
  day: string
  /** Kunci kehadiran: `<id>@<tanggal>`. */
  key: string
  start: number
  end: number
}

export function occurrencesOn(schedules: readonly Schedule[], day: string): Occurrence[] {
  return schedules
    .filter((schedule) => occursOn(schedule, day))
    .map((schedule) => {
      const start = toMinutes(schedule.time)
      return { schedule, day, key: `${schedule.id}@${day}`, start, end: start + schedule.dur }
    })
    .sort((a, b) => a.start - b.start)
}

/** Kejadian bertabrakan dibagi ke lajur; `lanes` = jumlah lajur di kelompok tabrakannya. */
export function layoutLanes<T extends { start: number; end: number }>(
  events: readonly T[],
): (T & { lane: number; lanes: number })[] {
  const laneEnds: number[] = []
  const placed = events.map((event) => {
    let lane = laneEnds.findIndex((end) => end <= event.start)
    if (lane < 0) lane = laneEnds.push(0) - 1
    laneEnds[lane] = event.end
    return { ...event, lane }
  })
  return placed.map((event) => ({
    ...event,
    lanes: placed
      .filter((other) => other.start < event.end && other.end > event.start)
      .reduce((max, other) => Math.max(max, other.lane + 1), 1),
  }))
}

/** Epoch ms awal kejadian (jam lokal). */
export function occurrenceStartMs(occurrence: Occurrence): number {
  const date = fromIsoDate(occurrence.day)
  date.setMinutes(occurrence.start)
  return date.getTime()
}

const UPCOMING_HORIZON_DAYS = 7

/** Kejadian berjam (bukan sepanjang hari) berikutnya setelah `now`, maks 7 hari ke depan. */
export function nextOccurrence(schedules: readonly Schedule[], now: number): Occurrence | null {
  const today = toIsoDate(new Date(now))
  for (let offset = 0; offset <= UPCOMING_HORIZON_DAYS; offset += 1) {
    const found = occurrencesOn(schedules, addDays(today, offset)).find(
      (occurrence) => !occurrence.schedule.allDay && occurrenceStartMs(occurrence) > now,
    )
    if (found) return found
  }
  return null
}

// ---- Rentang tampilan ----------------------------------------------------------------

export type CalendarView = 'hari' | 'pekan' | 'bulan'
export const CALENDAR_VIEWS: readonly CalendarView[] = ['hari', 'pekan', 'bulan']

export function shiftAnchor(view: CalendarView, anchor: string, direction: -1 | 1): string {
  if (view === 'bulan') {
    const date = fromIsoDate(anchor)
    return toIsoDate(new Date(date.getFullYear(), date.getMonth() + direction, 1))
  }
  return addDays(anchor, direction * (view === 'pekan' ? 7 : 1))
}

export function weekDays(anchor: string): string[] {
  const monday = mondayOf(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Sel bulan mulai Senin; 6 minggu, dipotong jadi 5 kalau minggu terakhir di luar bulan. */
export function monthDays(anchor: string): string[] {
  const date = fromIsoDate(anchor)
  const first = toIsoDate(new Date(date.getFullYear(), date.getMonth(), 1))
  const start = mondayOf(first)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const month = date.getMonth()
  const lastWeekOutside = days.slice(35).every((day) => fromIsoDate(day).getMonth() !== month)
  return lastWeekOutside ? days.slice(0, 35) : days
}

// ---- Form ----------------------------------------------------------------------------

export type EditScope = 'this' | 'following' | 'all'

export interface ScheduleDraft {
  title: string
  color: number
  date: string
  time: string
  /** Isi jam selesai (`end`) atau durasi (`dur`). */
  timeMode: 'end' | 'dur'
  end: string
  dur: number
  rec: RecurrenceType
  dailyN: number
  weekDays: number[]
  weekInterval: number
}

export type ScheduleDraftError =
  'titleRequired' | 'titleTooLong' | 'dateTime' | 'duration' | 'noDays'

export function draftDuration(draft: ScheduleDraft): number {
  return draft.timeMode === 'end' ? toMinutes(draft.end) - toMinutes(draft.time) : draft.dur
}

export function validateScheduleDraft(draft: ScheduleDraft): ScheduleDraftError | null {
  const title = draft.title.trim()
  if (!title) return 'titleRequired'
  if (title.length > SCHEDULE_TITLE_MAX) return 'titleTooLong'
  if (!isIsoDate(draft.date) || !isTime(draft.time)) return 'dateTime'
  if (draft.timeMode === 'end' && !isTime(draft.end)) return 'duration'
  const dur = draftDuration(draft)
  if (!Number.isInteger(dur) || dur <= 0 || dur > 24 * 60) return 'duration'
  if (draft.rec === 'weekly' && !draft.weekDays.length) return 'noDays'
  return null
}

export function recurrenceFromDraft(draft: ScheduleDraft): Recurrence {
  switch (draft.rec) {
    case 'once':
      return { type: 'once' }
    case 'daily':
      return { type: 'daily', n: draft.dailyN }
    case 'weekly':
      return { type: 'weekly', days: [...draft.weekDays], interval: draft.weekInterval }
    case 'monthly':
      return { type: 'monthly' }
  }
}

export function newScheduleDraft(date: string, time = '09:00'): ScheduleDraft {
  return {
    title: '',
    color: 0,
    date,
    time,
    timeMode: 'end',
    end: formatMinutes(Math.min(toMinutes(time) + 60, 24 * 60 - 1)),
    dur: 60,
    rec: 'once',
    dailyN: 1,
    weekDays: [fromIsoDate(date).getDay()],
    weekInterval: 1,
  }
}

/** Draft edit untuk satu kejadian (`day`) dari jadwal. */
export function draftFromSchedule(schedule: Schedule, day: string): ScheduleDraft {
  const { rec } = schedule
  return {
    title: schedule.title,
    color: schedule.color,
    date: day,
    time: schedule.time,
    timeMode: 'end',
    end: formatMinutes(toMinutes(schedule.time) + schedule.dur),
    dur: schedule.dur,
    rec: rec.type,
    dailyN: rec.type === 'daily' ? rec.n : 1,
    weekDays: rec.type === 'weekly' ? [...rec.days] : [fromIsoDate(day).getDay()],
    weekInterval: rec.type === 'weekly' ? rec.interval : 1,
  }
}

function fromDraft(draft: ScheduleDraft, id: string, start: string, allDay: boolean): Schedule {
  return {
    id,
    title: draft.title.trim(),
    color: draft.color,
    start,
    time: draft.time,
    dur: draftDuration(draft),
    allDay,
    rec: recurrenceFromDraft(draft),
    until: null,
    exceptions: [],
    goalId: null,
  }
}

export function createSchedule(draft: ScheduleDraft, id: string): Schedule {
  return fromDraft(draft, id, draft.date, false)
}

/**
 * Edit kejadian `occurrence` dari `original` (design `sForm.save`):
 * - `all`: ubah seri; tanggal mulai seri cuma ikut berubah kalau tanggalnya diganti.
 * - `this`: kejadian ini dikecualikan, lalu dibuat jadwal sekali di tanggal baru.
 * - `following`: seri lama berhenti sehari sebelumnya, seri baru mulai di tanggal baru.
 */
export function editSchedules(
  schedules: readonly Schedule[],
  original: Schedule,
  occurrence: string,
  draft: ScheduleDraft,
  scope: EditScope,
  newId: string,
): Schedule[] {
  // "Sepanjang hari" dipertahankan selama pola berulangnya tidak diganti.
  const allDay = original.allDay && draft.rec === original.rec.type
  const rest = schedules.filter((schedule) => schedule.id !== original.id)
  if (scope === 'all' || original.rec.type === 'once') {
    const start = draft.date === occurrence ? original.start : draft.date
    const updated = {
      ...fromDraft(draft, original.id, start, allDay),
      until: original.until,
      exceptions: original.exceptions,
      goalId: original.goalId,
    }
    return schedules.map((schedule) => (schedule.id === original.id ? updated : schedule))
  }
  if (scope === 'this') {
    return [
      ...rest,
      { ...original, exceptions: [...original.exceptions, occurrence] },
      {
        ...fromDraft(draft, newId, draft.date, allDay),
        rec: { type: 'once' },
        goalId: original.goalId,
      },
    ]
  }
  return [
    ...rest,
    { ...original, until: addDays(occurrence, -1) },
    { ...fromDraft(draft, newId, draft.date, allDay), goalId: original.goalId },
  ]
}

export function deleteSchedules(
  schedules: readonly Schedule[],
  original: Schedule,
  occurrence: string,
  scope: EditScope,
): Schedule[] {
  if (scope === 'all' || original.rec.type === 'once') {
    return schedules.filter((schedule) => schedule.id !== original.id)
  }
  const changed =
    scope === 'this'
      ? { ...original, exceptions: [...original.exceptions, occurrence] }
      : { ...original, until: addDays(occurrence, -1) }
  return schedules.map((schedule) => (schedule.id === original.id ? changed : schedule))
}
