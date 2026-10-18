import { z } from 'zod'

import type { Weekday } from '../enums.ts'
import {
  exceptionModeSchema,
  occurrenceStatusSchema,
  recurrenceEndModeSchema,
  recurrenceMonthModeSchema,
  recurrenceTypeSchema,
  weekdaySchema,
} from '../enums.ts'
import { epochMsSchema, localDateSchema, tzSchema, uuidV7Schema } from './primitives.ts'

/**
 * F1 Schedule - payload domain Bagian B `database.dbml`.
 *
 * Bentuknya mengikuti DBML apa adanya (nama field, tipe, nullability), karena bentuk yang sama juga
 * dipakai untuk validasi import (F10) dan berkas export JSON.
 */

/** Batas interval. Harian 1-6 hari; mingguan 1-2 minggu (PRD F1). */
export const RECURRENCE_INTERVAL_MIN = 1
export const RECURRENCE_INTERVAL_MAX_HARIAN = 6
export const RECURRENCE_INTERVAL_MAX_MINGGUAN = 2

/** 1 = minggu pertama, 5 = minggu terakhir (kombinasi dengan `month_weekday`). */
export const WEEK_OF_MONTH_MIN = 1
export const WEEK_OF_MONTH_MAX = 5

/** `uuidV7Schema` - id record dibuat client dan WAJIB urut waktu (ARCHITECTURE §6). */
const recordId = uuidV7Schema

export const scheduleSchema = z
  .object({
    id: recordId,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4_000).nullable(),
    /** Warna/kategori, opsional. Divalidasi di UI; di sini cuma dibatasi panjangnya. */
    color: z.string().max(64).nullable(),
    /** Epoch ms UTC. Disimpan sebagai `start_at` + `duration_ms`; dua mode input cuma beda UI. */
    startAt: epochMsSchema,
    /** 0 kalau tidak berdurasi. */
    durationMs: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
    isAllDay: z.boolean(),
    /** IANA tz perangkat, dipakai ekspansi recurrence. */
    tz: tzSchema,
    createdAt: epochMsSchema,
    updatedAt: epochMsSchema,
  })
  .strict()

export type Schedule = z.infer<typeof scheduleSchema>

/**
 * Bagian recurrence dari payload `schedule` (embedded, bukan tabel terpisah di disk).
 *
 * Perilakunya mengikuti Google Calendar: tanggal 29-31 yang tidak ada di bulan pendek DILEWATI,
 * bukan digeser ke tanggal 1 (PRD F1 + Assumptions).
 *
 * Field yang wajib bergantung pada `type`/`month_mode`/`end_mode` divalidasi lewat `superRefine`
 * di `scheduleRecurrenceSchema` - jadi data dari import versi lain tidak bisa lolos dengan kombinasi
 * field yang tidak masuk akal (mis. `month_mode: by_nth_weekday` tanpa `week_of_month`).
 */
export const scheduleRecurrenceSchema = z
  .object({
    id: recordId,
    /** 1:1 dengan `schedule`. */
    scheduleId: recordId,
    type: recurrenceTypeSchema,
    /** Harian 1-6; mingguan 1-2; bulanan/sekali selalu 1. */
    intervalN: z.int().min(RECURRENCE_INTERVAL_MIN).max(RECURRENCE_INTERVAL_MAX_HARIAN),
    /** Multi-nilai untuk mingguan (multi-select Senin-Minggu). Di DBML satu kolom `weekday` multi-nilai. */
    byWeekdays: z.array(weekdaySchema).min(1).max(7).nullable(),
    monthMode: recurrenceMonthModeSchema.nullable(),
    /** Opsi A: tanggal X. Tanggal 29-31 di bulan pendek DILEWATI. */
    monthDay: z.int().min(1).max(31).nullable(),
    /** Opsi B: minggu ke-N (1-5). */
    weekOfMonth: z.int().min(WEEK_OF_MONTH_MIN).max(WEEK_OF_MONTH_MAX).nullable(),
    /** Opsi B: hari Y. */
    monthWeekday: weekdaySchema.nullable(),
    endMode: recurrenceEndModeSchema,
    /** Kalau `end_mode = until_date`. Epoch ms UTC akhir hari lokal pada `end_date`. */
    endDate: epochMsSchema.nullable(),
    /** Kalau `end_mode = after_count`. */
    occurrenceCount: z.int().min(1).max(10_000).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const fail = (path: string, message: string): void => {
      ctx.addIssue({ code: 'custom', path: [path], message })
    }

    switch (value.type) {
      case 'once':
        if (value.intervalN !== 1) fail('intervalN', 'recurrence "once" harus interval 1')
        break
      case 'daily':
        if (
          value.intervalN < RECURRENCE_INTERVAL_MIN ||
          value.intervalN > RECURRENCE_INTERVAL_MAX_HARIAN
        ) {
          fail(
            'intervalN',
            `harian interval ${RECURRENCE_INTERVAL_MIN}-${RECURRENCE_INTERVAL_MAX_HARIAN}`,
          )
        }
        break
      case 'weekly':
        if (value.intervalN > RECURRENCE_INTERVAL_MAX_MINGGUAN) {
          fail('intervalN', `mingguan interval 1-${RECURRENCE_INTERVAL_MAX_MINGGUAN}`)
        }
        if (value.byWeekdays === null || value.byWeekdays.length === 0) {
          fail('byWeekdays', 'mingguan wajib memilih minimal satu hari')
        }
        if (
          value.byWeekdays !== null &&
          new Set(value.byWeekdays).size !== value.byWeekdays.length
        ) {
          fail('byWeekdays', 'hari tidak boleh dobel')
        }
        break
      case 'monthly':
        if (value.monthMode === null) fail('monthMode', 'bulanan wajib punya month_mode')
        else if (value.monthMode === 'by_day_of_month' && value.monthDay === null) {
          fail('monthDay', 'by_day_of_month wajib mengisi month_day')
        } else if (value.monthMode === 'by_nth_weekday') {
          if (value.weekOfMonth === null)
            fail('weekOfMonth', 'by_nth_weekday wajib mengisi week_of_month')
          if (value.monthWeekday === null)
            fail('monthWeekday', 'by_nth_weekday wajib mengisi month_weekday')
        }
        break
    }

    if (value.endMode === 'until_date' && value.endDate === null) {
      fail('endDate', 'end_mode until_date wajib mengisi end_date')
    }
    if (value.endMode === 'after_count' && value.occurrenceCount === null) {
      fail('occurrenceCount', 'end_mode after_count wajib mengisi occurrence_count')
    }
  })

export type ScheduleRecurrence = z.infer<typeof scheduleRecurrenceSchema>

/** Payload `schedule` = data jadwal + recurrence embedded-nya (kalau ada). */
export type SchedulePayload = Schedule & {
  readonly recurrence: ScheduleRecurrence | null
}

/**
 * `schedule_exception` - PRD F1 "Edit/Hapus Jadwal Rutin".
 *
 * Pilihan "semua" TIDAK membuat baris di sini; dia mengubah `schedule` induknya. Karena itu
 * `mode` cuma punya dua nilai (`only_this`, `this_and_following`).
 *
 * `occurrence_at` = waktu occurrence ASAL (start efektif sebelum exception apa pun), jadi baris ini
 * tetap bisa menemukan kejadiannya walau judul/durasi di-override.
 */
export const scheduleExceptionSchema = z
  .object({
    id: recordId,
    scheduleId: recordId,
    occurrenceAt: epochMsSchema,
    mode: exceptionModeSchema,
    /** `true` = occurrence dihapus. */
    isCancelled: z.boolean(),
    titleOverride: z.string().trim().min(1).max(200).nullable(),
    startAtOverride: epochMsSchema.nullable(),
    durationOverrideMs: z.int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
    createdAt: epochMsSchema,
  })
  .strict()

export type ScheduleException = z.infer<typeof scheduleExceptionSchema>

/**
 * `schedule_occurrence` - status per kejadian (ditandai selesai/hadir), dipakai progress Goals F13.
 *
 * `occurrence_at` = kunci kejadian (start efektif SETELAH exception), jadi kalau sebuah kejadian
 * digeser lewat exception, statusnya ikut kunci baru - `unique(schedule_id, occurrence_at)` di DBML.
 */
export const scheduleOccurrenceSchema = z
  .object({
    id: recordId,
    scheduleId: recordId,
    occurrenceAt: epochMsSchema,
    status: occurrenceStatusSchema,
    markedAt: epochMsSchema.nullable(),
  })
  .strict()

export type ScheduleOccurrence = z.infer<typeof scheduleOccurrenceSchema>

/**
 * Aturan murni: apakah `day` termasuk jadwal mingguan.
 *
 * Dipakai engine recurrence; ditaruh di domain supaya dipakai juga oleh validasi habit (F7 punya
 * aturan "hari mana yang jadi jadwal" yang identik).
 */
export function weekdayMatches(days: readonly Weekday[], weekday: Weekday): boolean {
  return days.includes(weekday)
}

/** Aturan murni: durasi tidak boleh negatif, dan `all-day` mengabaikan durasi. */
export function effectiveDurationMs(schedule: {
  readonly durationMs: number
  readonly isAllDay: boolean
}): number {
  return schedule.isAllDay ? 0 : schedule.durationMs
}

/** Aturan murni: akhir jadwal = `start_at` + `duration_ms` (inklusif-titik kalau durasi 0). */
export function scheduleEndMs(schedule: {
  readonly startAt: number
  readonly durationMs: number
  readonly isAllDay: boolean
}): number {
  return schedule.startAt + effectiveDurationMs(schedule)
}

/**
 * Bentuk tanggal lokal `YYYY-MM-DD` untuk `end_date` yang datang sebagai epoch ms.
 *
 * Helper ini menerima tanggal lokal yang sudah dihitung pemanggil (via tz), bukan tz - pemisahan itu
 * yang menjaga `calc/` dan `recurrence/` tetap murni.
 */
export const localDateKeySchema = localDateSchema
