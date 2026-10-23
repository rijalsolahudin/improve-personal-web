// Jadwal (PRD F1) + logika kalender (F6), mengikuti Home Desktop.dc.html `calVals`.
// Bentuk `Schedule` di sini adalah model PRESENTASI (tanggal lokal + jam `HH:MM`); mesin
// perulangannya milik `@improve-personal/core` supaya web & mobile memakai aturan yang sama.

import {
  endOfLocalDay,
  expandOccurrenceTimes,
  fromLocalDateTime,
  localDateOf,
  startOfLocalDay,
  weekdayFromJsIndex,
  type ExpansibleSchedule,
  type ScheduleRecurrence,
} from '@improve-personal/core'

import {
  MS_PER_MINUTE,
  addDays,
  deviceTimeZone,
  fromIsoDate,
  isIsoDate,
  mondayOf,
  toIsoDate,
} from './time'

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
  /**
   * Tanpa `nth` = tiap bulan di tanggal mulai (opsi A). Dengan `nth` = hari `weekday` minggu
   * ke-`week` (opsi B, mis. Selasa ke-2).
   */
  | { type: 'monthly'; nth?: { week: number; weekday: number } }

export type RecurrenceType = Recurrence['type']

export type EndRule =
  | { type: 'never' }
  /** Kejadian terakhir yang masih berlaku (inklusif); juga hasil "ini & berikutnya". */
  | { type: 'until'; date: string }
  /** Total kejadian seri (seperti `COUNT` RFC 5545). */
  | { type: 'count'; count: number }

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
  /** Aturan berakhir; "ini & berikutnya" memotong seri lama lewat `until`. */
  ends: EndRule
  /** Tanggal yang dilewati (hasil edit/hapus "kejadian ini"). */
  exceptions: string[]
  /** Goal tertaut (PRD F13 "Untuk goal"), opsional. */
  goalId: string | null
  /** Chapter tujuan; `null` = Sepanjang goal. */
  goalChapterId?: string | null
  /**
   * Zona waktu tempat jam jadwal dihitung. `undefined` = zona waktu perangkat saat ini (jadwal baru).
   * Disimpan supaya jam tidak bergeser kalau perangkat pindah zona waktu.
   */
  tz?: string
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

const minutesOfDay = (time: string): { hour: number; minute: number } => {
  const [hour = 0, minute = 0] = time.split(':').map(Number)
  return { hour, minute }
}

const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.trunc(value)))

// ---- Adapter ke engine core ---------------------------------------------------------

/** Instan mulai jadwal di zona waktu perangkat. */
export function scheduleStartAt(schedule: Schedule, tz: string): number {
  return fromLocalDateTime({ localDate: schedule.start, ...minutesOfDay(schedule.time), tz })
}

/** Bagian yang dibutuhkan engine core. */
export function toCoreSchedule(schedule: Schedule, tz: string): ExpansibleSchedule {
  return {
    id: schedule.id,
    startAt: scheduleStartAt(schedule, tz),
    durationMs: schedule.allDay ? 0 : schedule.dur * MS_PER_MINUTE,
    isAllDay: schedule.allDay,
    tz,
  }
}

/**
 * Model presentasi -> `ScheduleRecurrence` core. `null` = sekali (core memperlakukan `null` sebagai
 * jadwal tanpa pengulangan).
 */
export function toCoreRecurrence(schedule: Schedule, tz: string): ScheduleRecurrence | null {
  const { rec } = schedule
  if (rec.type === 'once') return null

  const base = { id: schedule.id, scheduleId: schedule.id }
  const end =
    schedule.ends.type === 'until'
      ? {
          endMode: 'until_date' as const,
          endDate: endOfLocalDay(schedule.ends.date, tz),
          occurrenceCount: null,
        }
      : schedule.ends.type === 'count'
        ? {
            endMode: 'after_count' as const,
            endDate: null,
            occurrenceCount: schedule.ends.count,
          }
        : { endMode: 'never' as const, endDate: null, occurrenceCount: null }

  switch (rec.type) {
    case 'daily':
      return {
        ...base,
        type: 'daily',
        intervalN: clampInt(rec.n, 1, 6),
        byWeekdays: null,
        monthMode: null,
        monthDay: null,
        weekOfMonth: null,
        monthWeekday: null,
        ...end,
      }
    case 'weekly':
      return {
        ...base,
        type: 'weekly',
        intervalN: clampInt(rec.interval, 1, 2),
        byWeekdays: [...new Set(rec.days)].sort((a, b) => a - b).map(weekdayFromJsIndex),
        monthMode: null,
        monthDay: null,
        weekOfMonth: null,
        monthWeekday: null,
        ...end,
      }
    case 'monthly':
      if (rec.nth) {
        return {
          ...base,
          type: 'monthly',
          intervalN: 1,
          byWeekdays: null,
          monthMode: 'by_nth_weekday',
          monthDay: null,
          weekOfMonth: clampInt(rec.nth.week, 1, 5),
          monthWeekday: weekdayFromJsIndex(rec.nth.weekday),
          ...end,
        }
      }
      return {
        ...base,
        type: 'monthly',
        intervalN: 1,
        byWeekdays: null,
        monthMode: 'by_day_of_month',
        monthDay: fromIsoDate(schedule.start).getDate(),
        weekOfMonth: null,
        monthWeekday: null,
        ...end,
      }
  }
}

// ---- Kejadian ------------------------------------------------------------------------

export interface Occurrence {
  schedule: Schedule
  day: string
  /** Kunci kehadiran: `<id>@<tanggal>`. */
  key: string
  start: number
  end: number
  /** Instan mulai sebenarnya (epoch ms) - aman terhadap DST. */
  at: number
}

/**
 * Cache ekspansi per objek jadwal.
 *
 * Kalender membaca data per tanggal: grid bulan 35-42 sel, timeline pekan 7 kolom, panel hari,
 * overview, dan target Pomodoro. Tanpa cache, setiap panggilan mengulang seluruh daftar jadwal dan
 * mengonversi waktu lewat `Intl` di dalam engine core - biayanya O(jadwal x hari) dan view bulan
 * melampaui anggaran AC T9.
 *
 * Cache disimpan di `WeakMap` supaya tidak menahan jadwal yang sudah dihapus dari memori. Semua
 * mutasi jadwal di app ini mengganti objek (`useSchedules`), jadi identitas objek = versi data;
 * field yang memengaruhi hasil tetap dibandingkan supaya mutasi di tempat pun tidak jadi basi.
 */
interface ScheduleExpansion {
  /** Zona waktu hasil resolusi (`schedule.tz` atau zona perangkat saat cache dibuat). */
  zone: string
  start: string
  time: string
  dur: number
  allDay: boolean
  rec: Recurrence
  ends: EndRule
  core: ExpansibleSchedule
  recurrence: ScheduleRecurrence | null
  /** Tanggal lokal kejadian pertama (`null` recurrence = sekali) + jam mulai dalam menit. */
  day: string
  minute: number
  /** Hasil ekspansi terakhir: rentang, pengecualian, dan kejadian per tanggal. */
  expanded: {
    from: string
    to: string
    exceptions: readonly string[]
    byDay: Map<string, Occurrence[]>
  } | null
}

const EXPANSION_CACHE = new WeakMap<Schedule, ScheduleExpansion>()

const sameExceptions = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((day, index) => day === right[index])

function expansionOf(schedule: Schedule, zone: string): ScheduleExpansion {
  const cached = EXPANSION_CACHE.get(schedule)
  if (
    cached !== undefined &&
    cached.zone === zone &&
    cached.start === schedule.start &&
    cached.time === schedule.time &&
    cached.dur === schedule.dur &&
    cached.allDay === schedule.allDay &&
    cached.rec === schedule.rec &&
    cached.ends === schedule.ends
  ) {
    return cached
  }

  const core = toCoreSchedule(schedule, zone)
  const entry: ScheduleExpansion = {
    zone,
    start: schedule.start,
    time: schedule.time,
    dur: schedule.dur,
    allDay: schedule.allDay,
    rec: schedule.rec,
    ends: schedule.ends,
    core,
    recurrence: toCoreRecurrence(schedule, zone),
    day: localDateOf(core.startAt, zone),
    minute: toMinutes(schedule.time),
    expanded: null,
  }
  EXPANSION_CACHE.set(schedule, entry)
  return entry
}

/**
 * Rentang ekspansi untuk satu permintaan.
 *
 * Permintaan satu hari hampir selalu datang dari pembaca per tanggal (sel grid bulan, panel hari,
 * timeline) yang tetap butuh grid bulan penuh, jadi hari tunggal diekspansi sebagai satu grid bulan
 * dan hasilnya dipakai ulang untuk semua tanggal di grid itu. Rentang lain (pekan, rentang custom)
 * diekspansi apa adanya supaya tidak menghitung hari yang tidak dilihat.
 */
function expansionWindow(from: string, to: string): { from: string; to: string } {
  if (from !== to) return { from, to }
  const grid = monthDays(from)
  return { from: grid[0] ?? from, to: grid.at(-1) ?? to }
}

function toOccurrence(
  schedule: Schedule,
  expansion: ScheduleExpansion,
  day: string,
  at: number,
): Occurrence {
  return {
    schedule,
    day,
    key: `${schedule.id}@${day}`,
    start: expansion.minute,
    end: expansion.minute + schedule.dur,
    at,
  }
}

/** Kejadian satu jadwal berulang di `[from, to]`, memakai/mengisi cache ekspansi. */
function recurringOccurrences(
  schedule: Schedule,
  expansion: ScheduleExpansion,
  recurrence: ScheduleRecurrence,
  from: string,
  to: string,
): Occurrence[] {
  const cached = expansion.expanded
  if (
    cached !== null &&
    cached.from <= from &&
    cached.to >= to &&
    sameExceptions(cached.exceptions, schedule.exceptions)
  ) {
    return pickDays(cached.byDay, from, to)
  }

  const window = expansionWindow(from, to)
  const byDay = new Map<string, Occurrence[]>()
  const times = expandOccurrenceTimes(expansion.core, recurrence, {
    fromMs: startOfLocalDay(window.from, expansion.zone),
    toMs: endOfLocalDay(window.to, expansion.zone),
  })

  for (const time of times) {
    const day = time.localDate
    if (day < window.from || day > window.to || schedule.exceptions.includes(day)) continue
    const occurrence = toOccurrence(schedule, expansion, day, time.startAt)
    const sameDay = byDay.get(day)
    if (sameDay === undefined) byDay.set(day, [occurrence])
    else sameDay.push(occurrence)
  }

  expansion.expanded = {
    from: window.from,
    to: window.to,
    exceptions: [...schedule.exceptions],
    byDay,
  }
  return pickDays(byDay, from, to)
}

function pickDays(
  byDay: ReadonlyMap<string, Occurrence[]>,
  from: string,
  to: string,
): Occurrence[] {
  const result: Occurrence[] = []
  for (const [day, occurrences] of byDay) {
    if (day >= from && day <= to) result.push(...occurrences)
  }
  return result
}

/**
 * Kejadian di `[from, to]` (inklusif), urut tanggal lalu jam. Ekspansi hanya untuk rentang ini
 * (satu hari = satu grid bulan, lihat `expansionWindow`) dan di-cache per jadwal.
 */
export function occurrencesBetween(
  schedules: readonly Schedule[],
  from: string,
  to: string,
  tz = deviceTimeZone(),
): Occurrence[] {
  if (from > to) return []

  const result: Occurrence[] = []

  for (const schedule of schedules) {
    const expansion = expansionOf(schedule, schedule.tz ?? tz)

    // Jadwal sekali: tanggal & instan mulainya sudah dihitung di cache, tidak perlu ekspansi.
    if (expansion.recurrence === null) {
      if (
        expansion.day >= from &&
        expansion.day <= to &&
        !schedule.exceptions.includes(expansion.day)
      ) {
        result.push(toOccurrence(schedule, expansion, expansion.day, expansion.core.startAt))
      }
      continue
    }

    result.push(...recurringOccurrences(schedule, expansion, expansion.recurrence, from, to))
  }

  return result.sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start)
}

export const occurrencesOn = (
  schedules: readonly Schedule[],
  day: string,
  tz = deviceTimeZone(),
): Occurrence[] => occurrencesBetween(schedules, day, day, tz)

export function occursOn(schedule: Schedule, day: string, tz = deviceTimeZone()): boolean {
  return occurrencesOn([schedule], day, tz).length > 0
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

/** Epoch ms awal kejadian (sudah dihitung engine di zona waktu jadwal). */
export const occurrenceStartMs = (occurrence: Occurrence): number => occurrence.at

const UPCOMING_HORIZON_DAYS = 7

/** Kejadian berjam (bukan sepanjang hari) berikutnya setelah `now`, maks 7 hari ke depan. */
export function nextOccurrence(
  schedules: readonly Schedule[],
  now: number,
  tz = deviceTimeZone(),
): Occurrence | null {
  const today = toIsoDate(new Date(now))
  for (let offset = 0; offset <= UPCOMING_HORIZON_DAYS; offset += 1) {
    const found = occurrencesOn(schedules, addDays(today, offset), tz).find(
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
  /** Bulanan: `date` = tanggal mulai, `nth` = hari `monthWeekday` minggu ke-`monthWeek`. */
  monthMode: 'date' | 'nth'
  monthWeek: number
  monthWeekday: number
  ends: EndRule['type']
  untilDate: string
  count: number
  goalId: string | null
  goalChapterId: string | null
}

export type ScheduleDraftError =
  | 'titleRequired'
  | 'titleTooLong'
  | 'dateTime'
  | 'duration'
  | 'noDays'
  | 'monthPattern'
  | 'untilDate'
  | 'count'

const DEFAULT_COUNT = 10

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
  if (draft.rec === 'monthly' && draft.monthMode === 'nth' && !isValidNth(draft)) {
    return 'monthPattern'
  }
  if (draft.rec === 'once') return null
  if (draft.ends === 'until' && (!isIsoDate(draft.untilDate) || draft.untilDate < draft.date)) {
    return 'untilDate'
  }
  if (draft.ends === 'count' && !(Number.isInteger(draft.count) && isCountInRange(draft.count))) {
    return 'count'
  }
  return null
}

const isCountInRange = (count: number): boolean => count >= 1 && count <= 999

function isValidNth({ monthWeek, monthWeekday }: ScheduleDraft): boolean {
  return (
    Number.isInteger(monthWeek) &&
    monthWeek >= 1 &&
    monthWeek <= 5 &&
    Number.isInteger(monthWeekday) &&
    monthWeekday >= 0 &&
    monthWeekday <= 6
  )
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
      return draft.monthMode === 'nth'
        ? { type: 'monthly', nth: { week: draft.monthWeek, weekday: draft.monthWeekday } }
        : { type: 'monthly' }
  }
}

export function endsFromDraft(draft: ScheduleDraft): EndRule {
  if (draft.rec === 'once') return { type: 'never' }
  switch (draft.ends) {
    case 'never':
      return { type: 'never' }
    case 'until':
      return { type: 'until', date: draft.untilDate }
    case 'count':
      return { type: 'count', count: draft.count }
  }
}

/** Minggu ke berapa (1–5) `iso` di bulannya, mis. tanggal 8–14 = minggu ke-2. */
const weekOfMonth = (iso: string): number => Math.ceil(fromIsoDate(iso).getDate() / 7)

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
    monthMode: 'date',
    monthWeek: weekOfMonth(date),
    monthWeekday: fromIsoDate(date).getDay(),
    ends: 'never',
    untilDate: date,
    count: DEFAULT_COUNT,
    goalId: null,
    goalChapterId: null,
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
    monthMode: rec.type === 'monthly' && rec.nth ? 'nth' : 'date',
    monthWeek: rec.type === 'monthly' && rec.nth ? rec.nth.week : weekOfMonth(day),
    monthWeekday: rec.type === 'monthly' && rec.nth ? rec.nth.weekday : fromIsoDate(day).getDay(),
    ends: schedule.ends.type,
    untilDate: schedule.ends.type === 'until' ? schedule.ends.date : day,
    count: schedule.ends.type === 'count' ? schedule.ends.count : DEFAULT_COUNT,
    goalId: schedule.goalId,
    goalChapterId: schedule.goalChapterId ?? null,
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
    ends: endsFromDraft(draft),
    exceptions: [],
    goalId: draft.goalId,
    goalChapterId: draft.goalChapterId,
  }
}

export function createSchedule(draft: ScheduleDraft, id: string): Schedule {
  return fromDraft(draft, id, draft.date, false)
}

/**
 * Jumlah kejadian aturan sebelum `day` (pengecualian ikut dihitung), dihitung engine core.
 * Dipakai untuk memotong sisa jatah saat "ini & berikutnya" pada seri ber-`count`.
 */
function slotsBefore(schedule: Schedule, day: string, tz: string): number {
  const zone = schedule.tz ?? tz
  const core = toCoreSchedule(schedule, zone)
  const toMs = startOfLocalDay(day, zone) - 1
  if (toMs < core.startAt) return 0
  return expandOccurrenceTimes(core, toCoreRecurrence(schedule, zone), {
    fromMs: core.startAt,
    toMs,
  }).length
}

/** Seri dipotong sampai sehari sebelum `occurrence`; `null` kalau itu kejadian pertama. */
function truncated(original: Schedule, occurrence: string): Schedule | null {
  return occurrence <= original.start
    ? null
    : { ...original, ends: { type: 'until', date: addDays(occurrence, -1) } }
}

/**
 * Edit kejadian `occurrence` dari `original` (design `sForm.save`):
 * - `all`: ubah seri; tanggal mulai seri cuma ikut berubah kalau tanggalnya diganti.
 * - `this`: kejadian ini dikecualikan, lalu dibuat jadwal sekali di tanggal baru.
 * - `following`: seri lama berhenti sehari sebelumnya, seri baru mulai di tanggal baru.
 *   Mengedit kejadian pertama sama dengan `all`.
 */
export function editSchedules(
  schedules: readonly Schedule[],
  original: Schedule,
  occurrence: string,
  draft: ScheduleDraft,
  scope: EditScope,
  newId: string,
  tz = deviceTimeZone(),
): Schedule[] {
  // "Sepanjang hari" dipertahankan selama pola berulangnya tidak diganti.
  const allDay = original.allDay && draft.rec === original.rec.type
  const rest = schedules.filter((schedule) => schedule.id !== original.id)
  const head = scope === 'following' ? truncated(original, occurrence) : null
  if (scope === 'all' || original.rec.type === 'once' || (scope === 'following' && !head)) {
    const start = draft.date === occurrence ? original.start : draft.date
    const updated = {
      ...fromDraft(draft, original.id, start, allDay),
      exceptions: original.exceptions,
      goalId: draft.goalId,
      goalChapterId: draft.goalChapterId,
      tz: original.tz,
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
        ends: { type: 'never' },
        goalId: draft.goalId,
        goalChapterId: draft.goalChapterId,
        tz: original.tz,
      },
    ]
  }
  const next = {
    ...fromDraft(draft, newId, draft.date, allDay),
    goalId: draft.goalId,
    goalChapterId: draft.goalChapterId,
    tz: original.tz,
  }
  // Jumlah yang tak diubah user = sisa kejadian, bukan total seri lama.
  if (
    original.ends.type === 'count' &&
    next.ends.type === 'count' &&
    next.ends.count === original.ends.count
  ) {
    next.ends = {
      type: 'count',
      count: Math.max(1, next.ends.count - slotsBefore(original, occurrence, tz)),
    }
  }
  return [...rest, ...(head ? [head] : []), next]
}

export function deleteSchedules(
  schedules: readonly Schedule[],
  original: Schedule,
  occurrence: string,
  scope: EditScope,
): Schedule[] {
  const head = scope === 'following' ? truncated(original, occurrence) : null
  if (scope === 'all' || original.rec.type === 'once' || (scope === 'following' && !head)) {
    return schedules.filter((schedule) => schedule.id !== original.id)
  }
  const changed =
    scope === 'this' ? { ...original, exceptions: [...original.exceptions, occurrence] } : head
  return schedules.map((schedule) => (schedule.id === original.id && changed ? changed : schedule))
}
