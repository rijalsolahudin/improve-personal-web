import {
  fromLocalDateTime,
  jsIndexFromWeekday,
  localDateOf,
  localTimeOf,
  scheduleExceptionSchema,
  scheduleOccurrenceSchema,
  schedulePayloadSchema,
  weekdayFromJsIndex,
  type GoalLink,
  type ScheduleException,
  type ScheduleOccurrence,
  type SchedulePayload,
  type ScheduleRecurrence,
} from '@improve-personal/core'

import { NO_GOAL_PLACE, placeOf, type GoalPlace } from '../goals/links'
import { createRepository } from '../storage/repository'
import type { LocalDataSession } from '../storage/session'
import {
  formatMinutes,
  scheduleStartAt,
  toCoreRecurrence,
  toMinutes,
  type EndRule,
  type Recurrence,
  type Schedule,
} from '../schedule'
import { fromIsoDate, isIsoDate } from '../time'

/**
 * Persistensi jadwal: `Schedule` (model presentasi) <-> record `schedule` +
 * `schedule_exception` + `schedule_occurrence`.
 *
 * Bentuk payload mengikuti `schedulePayloadSchema` di core (recurrence di-embed), karena record ini
 * juga dibaca fitur lain dan ikut export/import. Model presentasi menyimpan tanggal lokal + `HH:MM`
 * supaya UI sederhana; konversi ke epoch ms terjadi di `toCoreRecurrence`/`scheduleStartAt`.
 *
 * Field yang tidak dipakai UI tetap dipertahankan saat menimpa:
 * - `description` (belum ada di form) dan `createdAt` dari payload lama.
 * - `id` recurrence lama, supaya referensi lain tidak putus.
 *
 * `goalId` tidak ada di payload `schedule`: tautan goal adalah record `goal_link` sendiri (F13).
 * `toSchedule` menerima tautan hasil hydrate sebagai argumen, sedangkan pasangan
 * `toSchedulePayload`↔`toSchedule` dijaga `WeakMap` untuk pemakaian berpasangan (test/form).
 */

const MINUTE_MS = 60_000

function exceptionRepository(session: LocalDataSession) {
  return createRepository<ScheduleException>(session, 'schedule_exception')
}

function occurrenceRepository(session: LocalDataSession) {
  return createRepository<ScheduleOccurrence>(session, 'schedule_occurrence')
}

function recurrenceToUi(rec: ScheduleRecurrence | null): Recurrence {
  if (rec === null || rec.type === 'once') return { type: 'once' }

  switch (rec.type) {
    case 'daily':
      return { type: 'daily', n: rec.intervalN }
    case 'weekly':
      return {
        type: 'weekly',
        days: (rec.byWeekdays ?? []).map(jsIndexFromWeekday),
        interval: rec.intervalN,
      }
    case 'monthly':
      return rec.monthMode === 'by_nth_weekday' &&
        rec.weekOfMonth !== null &&
        rec.monthWeekday !== null
        ? {
            type: 'monthly',
            nth: { week: rec.weekOfMonth, weekday: jsIndexFromWeekday(rec.monthWeekday) },
          }
        : { type: 'monthly' }
  }
}

function endsToUi(rec: ScheduleRecurrence | null, tz: string): EndRule {
  if (rec === null) return { type: 'never' }
  if (rec.endMode === 'until_date' && rec.endDate !== null) {
    return { type: 'until', date: localDateOf(rec.endDate, tz) }
  }
  if (rec.endMode === 'after_count' && rec.occurrenceCount !== null) {
    return { type: 'count', count: rec.occurrenceCount }
  }
  return { type: 'never' }
}

function colorOf(payload: SchedulePayload): number {
  const index = Number.parseInt(payload.color ?? '', 10)
  return Number.isFinite(index) ? index : 0
}

/**
 * Tautan goal tidak punya kolom di `schedule` core (record `goal_link` terpisah). `WeakMap` menjaga
 * pasangan payload↔tautan saat mapper dipakai berpasangan (termasuk test), tanpa melonggarkan schema
 * core. Saat membaca dari penyimpanan, tautan asli diberikan sebagai argumen ketiga.
 */
const goalPlaceByPayload = new WeakMap<SchedulePayload, GoalPlace>()

/** Payload core -> model presentasi. */
export function toSchedule(
  payload: SchedulePayload,
  exceptions: readonly string[],
  tz: string,
  place: GoalPlace = goalPlaceByPayload.get(payload) ?? NO_GOAL_PLACE,
): Schedule {
  const time = localTimeOf(payload.startAt, tz)
  return {
    id: payload.id,
    title: payload.title,
    color: colorOf(payload),
    start: localDateOf(payload.startAt, tz),
    time: formatMinutes(time.hour * 60 + time.minute),
    dur: payload.isAllDay ? 24 * 60 : Math.round(payload.durationMs / MINUTE_MS),
    allDay: payload.isAllDay,
    rec: recurrenceToUi(payload.recurrence),
    ends: endsToUi(payload.recurrence, tz),
    exceptions: [...exceptions].sort(),
    goalId: place.goalId,
    ...(place.goalChapterId === null ? {} : { goalChapterId: place.goalChapterId }),
    tz: payload.tz,
  }
}

/** Model presentasi -> payload core. */
export function toSchedulePayload(
  schedule: Schedule,
  tz: string,
  nowMs: number,
  previous?: SchedulePayload,
): SchedulePayload {
  const zone = schedule.tz ?? tz
  const recurrence = withRequiredWeekdays(toCoreRecurrence(schedule, zone), schedule)
  const payload: SchedulePayload = {
    id: schedule.id,
    title: schedule.title,
    description: previous?.description ?? null,
    color: String(schedule.color),
    startAt: scheduleStartAt(schedule, zone),
    durationMs: schedule.allDay ? 0 : schedule.dur * MINUTE_MS,
    isAllDay: schedule.allDay,
    tz: zone,
    createdAt: previous?.createdAt ?? nowMs,
    updatedAt: nowMs,
    recurrence:
      recurrence === null ? null : { ...recurrence, id: previous?.recurrence?.id ?? schedule.id },
  }
  goalPlaceByPayload.set(payload, {
    goalId: schedule.goalId,
    goalChapterId: schedule.goalChapterId ?? null,
  })
  return payload
}

/** Schema core mewajibkan minimal satu hari untuk mingguan; data kosong = pakai hari tanggal mulai. */
function withRequiredWeekdays(
  recurrence: ScheduleRecurrence | null,
  schedule: Schedule,
): ScheduleRecurrence | null {
  if (recurrence === null || recurrence.type !== 'weekly') return recurrence
  if ((recurrence.byWeekdays?.length ?? 0) > 0) return recurrence

  return {
    ...recurrence,
    byWeekdays: [weekdayFromJsIndex(fromIsoDate(schedule.start).getDay())],
  }
}

export type ScheduleData = {
  readonly schedules: Schedule[]
  readonly attendance: Record<string, boolean>
}

/** Muat semua jadwal, exception, dan status kehadiran. */
export async function loadScheduleData(
  session: LocalDataSession,
  tz: string,
  /** Tautan goal yang sudah dimuat pemanggil (hindari query `goal_link` ganda). */
  goalLinks: ReadonlyMap<string, GoalLink> = new Map(),
): Promise<ScheduleData> {
  const [scheduleRecords, exceptionRecords, occurrenceRecords] = await Promise.all([
    session.repos.schedule.listAll({ includeDeleted: false }),
    exceptionRepository(session).listAll({ includeDeleted: false }),
    occurrenceRepository(session).listAll({ includeDeleted: false }),
  ])

  const payloads = scheduleRecords.map((record) => schedulePayloadSchema.parse(record.data))
  const zoneById = new Map(payloads.map((payload) => [payload.id, payload.tz]))

  const exceptionsBySchedule = new Map<string, string[]>()
  for (const record of exceptionRecords) {
    const exception = scheduleExceptionSchema.parse(record.data)
    if (!exception.isCancelled) continue
    const day = localDateOf(exception.occurrenceAt, zoneById.get(exception.scheduleId) ?? tz)
    const days = exceptionsBySchedule.get(exception.scheduleId) ?? []
    days.push(day)
    exceptionsBySchedule.set(exception.scheduleId, days)
  }

  const attendance: Record<string, boolean> = {}
  for (const record of occurrenceRecords) {
    const occurrence = scheduleOccurrenceSchema.parse(record.data)
    if (occurrence.status !== 'done') continue
    const day = localDateOf(occurrence.occurrenceAt, zoneById.get(occurrence.scheduleId) ?? tz)
    attendance[attendanceKey(occurrence.scheduleId, day)] = true
  }

  const schedules = payloads.map((payload) =>
    toSchedule(
      payload,
      exceptionsBySchedule.get(payload.id) ?? [],
      payload.tz,
      placeOf(goalLinks.get(payload.id)),
    ),
  )

  return { schedules, attendance }
}

/** Simpan satu jadwal beserta exception-nya. */
export async function persistSchedule(
  session: LocalDataSession,
  schedule: Schedule,
  tz: string,
): Promise<void> {
  const existing = await session.repos.schedule.getById(schedule.id)
  const previous = existing === null ? undefined : schedulePayloadSchema.parse(existing.data)
  const zone = schedule.tz ?? tz
  const startAt = scheduleStartAt(schedule, zone)
  const endAt = startAt + (schedule.allDay ? 0 : schedule.dur * MINUTE_MS)

  await session.writer.write({
    id: schedule.id,
    type: 'schedule',
    data: (id) => toSchedulePayload({ ...schedule, id }, zone, session.clock.nowMs(), previous),
    index: { rangeStartMs: startAt, rangeEndMs: endAt },
  })

  await syncExceptions(session, schedule, tz)
}

/** Hapus jadwal beserta exception & status kehadirannya. */
export async function removeSchedule(session: LocalDataSession, scheduleId: string): Promise<void> {
  await removeExceptions(session, scheduleId)
  await removeOccurrences(session, scheduleId)
  await session.writer.remove({ id: scheduleId })
}

/** Simpan/batalkan status "hadir" untuk satu kejadian. */
export async function persistAttendance(
  session: LocalDataSession,
  schedule: Schedule,
  day: string,
  attended: boolean,
  tz: string,
): Promise<void> {
  const zone = schedule.tz ?? tz
  const existing = (await listOccurrences(session, schedule.id)).find(
    (occurrence) => localDateOf(occurrence.occurrenceAt, zone) === day,
  )

  if (!attended) {
    if (existing !== undefined) await session.writer.remove({ id: existing.id })
    return
  }

  const occurrenceAt = occurrenceInstant(schedule, day, zone)
  const id = existing?.id ?? session.newId()

  await session.writer.write({
    id,
    type: 'schedule_occurrence',
    data: () => ({
      id,
      scheduleId: schedule.id,
      occurrenceAt,
      status: 'done',
      markedAt: session.clock.nowMs(),
    }),
    index: { rangeStartMs: occurrenceAt, rangeEndMs: null },
  })
}

/**
 * Buang status kehadiran milik `scheduleId`: semua kalau `fromDay` null, tepat satu tanggal kalau
 * `exact`, atau mulai tanggal itu (inklusif).
 */
export async function removeAttendanceFrom(
  session: LocalDataSession,
  scheduleId: string,
  fromDay: string | null,
  tz: string,
  exact = false,
): Promise<void> {
  const occurrences = await listOccurrences(session, scheduleId)
  for (const occurrence of occurrences) {
    const day = localDateOf(occurrence.occurrenceAt, tz)
    if (fromDay !== null && (exact ? day !== fromDay : day < fromDay)) continue
    await session.writer.remove({ id: occurrence.id })
  }
}

export const attendanceKey = (scheduleId: string, day: string): string => `${scheduleId}@${day}`

function occurrenceInstant(schedule: Schedule, day: string, tz: string): number {
  const minutes = toMinutes(schedule.time)
  return fromLocalDateTime({
    localDate: day,
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
    tz,
  })
}

async function listExceptions(
  session: LocalDataSession,
  scheduleId: string,
): Promise<ScheduleException[]> {
  const records = await exceptionRepository(session).listAll({ includeDeleted: false })
  return records
    .map((record) => scheduleExceptionSchema.parse(record.data))
    .filter((exception) => exception.scheduleId === scheduleId)
}

async function listOccurrences(
  session: LocalDataSession,
  scheduleId: string,
): Promise<ScheduleOccurrence[]> {
  const records = await occurrenceRepository(session).listAll({ includeDeleted: false })
  return records
    .map((record) => scheduleOccurrenceSchema.parse(record.data))
    .filter((occurrence) => occurrence.scheduleId === scheduleId)
}

async function syncExceptions(
  session: LocalDataSession,
  schedule: Schedule,
  tz: string,
): Promise<void> {
  const zone = schedule.tz ?? tz
  const desired = new Map<string, number>()
  for (const day of schedule.exceptions) {
    if (isIsoDate(day)) desired.set(day, occurrenceInstant(schedule, day, zone))
  }

  const existing = new Map<string, ScheduleException>()
  for (const exception of await listExceptions(session, schedule.id)) {
    existing.set(localDateOf(exception.occurrenceAt, zone), exception)
  }

  for (const [day, occurrenceAt] of desired) {
    const current = existing.get(day)
    if (current?.occurrenceAt === occurrenceAt) continue
    // Jam seri berubah: exception lama menunjuk instan yang sudah tidak ada, jadi tulis ulang.
    if (current !== undefined) await session.writer.remove({ id: current.id })

    const id = session.newId()
    await session.writer.write({
      id,
      type: 'schedule_exception',
      data: () => ({
        id,
        scheduleId: schedule.id,
        occurrenceAt,
        mode: 'only_this',
        isCancelled: true,
        titleOverride: null,
        startAtOverride: null,
        durationOverrideMs: null,
        createdAt: session.clock.nowMs(),
      }),
      index: { rangeStartMs: occurrenceAt, rangeEndMs: null },
    })
  }

  for (const [day, exception] of existing) {
    if (desired.has(day)) continue
    await session.writer.remove({ id: exception.id })
  }
}

async function removeExceptions(session: LocalDataSession, scheduleId: string): Promise<void> {
  for (const exception of await listExceptions(session, scheduleId)) {
    await session.writer.remove({ id: exception.id })
  }
}

async function removeOccurrences(session: LocalDataSession, scheduleId: string): Promise<void> {
  for (const occurrence of await listOccurrences(session, scheduleId)) {
    await session.writer.remove({ id: occurrence.id })
  }
}
