import { z } from 'zod'

import { habitFrequencyTypeSchema, weekdaySchema } from '../enums.ts'
import { epochMsSchema, localDateSchema, uuidV7Schema } from './primitives.ts'

/**
 * F5 Countdown + F7 Habit & check-in.
 *
 * Dua-duanya memakai `local_date` untuk kunci harian (habit) atau `target_at` epoch ms (countdown).
 */

/**
 * `countdown`.
 *
 * `sticker_id` adalah SOFT REF ke sticker bundled: ID tak dikenal -> placeholder, BUKAN error
 * (PRD F14 dan catatan DBML). Karena itu `sticker_id` bebas string, bukan enum.
 */
export const countdownSchema = z
  .object({
    id: uuidV7Schema,
    name: z.string().trim().min(1).max(200),
    /** Epoch ms UTC. */
    targetAt: epochMsSchema,
    color: z.string().max(64).nullable(),
    stickerId: z.string().min(1).max(120).nullable(),
    /** Ulang tiap tahun (ulang tahun/anniversary); `targetAt` menyimpan tanggal aslinya. */
    isYearly: z.boolean().default(false),
    /** Target tanpa jam: baru dianggap lewat di akhir hari. */
    isAllDay: z.boolean().default(false),
    isArchived: z.boolean(),
    archivedAt: epochMsSchema.nullable(),
    createdAt: epochMsSchema,
    updatedAt: epochMsSchema,
  })
  .strict()

export type Countdown = z.infer<typeof countdownSchema>

/**
 * Aturan murni sorting F5 "paling dekat dulu".
 *
 * Yang diarsipkan TIDAK ikut hitungan terdekat (catatan DBML `idx_countdown_sort`). Karena alasan
 * yang sama, yang sudah lewat tapi tidak diarsipkan tetap ikut dengan urutan `target_at` menaik -
 * user memilih sendiri mana yang diarsipkan (PRD F5 "bisa diarsipkan atau tetap terlihat").
 */
export function compareCountdownByTarget(a: Countdown, b: Countdown): number {
  if (a.targetAt !== b.targetAt) return a.targetAt < b.targetAt ? -1 : 1
  // Tie-break by id supaya urutan deterministik di dua platform (bukan bergantung urutan DB).
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

/**
 * Aturan murni: daftar countdown aktif (belum diarsipkan) terurut paling dekat dulu.
 *
 * Ini yang dipakai halaman Countdown dan widget Overview "3 teratas" (PRD F5/F11).
 */
export function sortActiveCountdowns(countdowns: readonly Countdown[]): readonly Countdown[] {
  return countdowns.filter((countdown) => !countdown.isArchived).sort(compareCountdownByTarget)
}

/** Aturan murni: countdown dianggap "lewat" kalau target sudah sebelum `nowMs`. */
export function isCountdownPast(countdown: Pick<Countdown, 'targetAt'>, nowMs: number): boolean {
  return countdown.targetAt <= nowMs
}

/** Aturan murni: arsipkan countdown (memakai `nowMs` yang di-inject, bukan jam langsung). */
export function archiveCountdown(countdown: Countdown, nowMs: number): Countdown {
  return { ...countdown, isArchived: true, archivedAt: nowMs, updatedAt: nowMs }
}

/**
 * F7 `habit`.
 *
 * `frequency_days` = multi-nilai weekday, dipakai hanya kalau `frequency_type: 'weekly_days'`.
 *
 * Streak TIDAK disimpan (PRD F7) - dihitung `calc/streak.ts`, dan hari yang bukan jadwal habit tidak
 * memutus streak.
 */
export const habitSchema = z
  .object({
    id: uuidV7Schema,
    name: z.string().trim().min(1).max(200),
    /** Sticker bundled atau emoji; ID tak dikenal -> placeholder, bukan error. */
    iconSticker: z.string().min(1).max(120).nullable(),
    /**
     * Hex warna palet dari UI (mis. `#9B4FC9`); `null` = pakai warna default UI.
     *
     * `.default(null)` WAJIB ada untuk backward-compatibility: record `habit` lama (dibuat sebelum
     * field `color` ditambahkan) tidak punya key ini, dan record lama itu harus tetap lolos parse saat
     * hydrate maupun `validateEntityPayload` saat import. Jadi absen = `null` (pakai warna default UI),
     * BUKAN error - kalau `color` diwajibkan, user lama kehilangan datanya hanya karena upgrade.
     *
     * Ini tidak sama dengan "default diam-diam": penulis baru (web/mobile) tetap eksplisit mengirim
     * hex atau `null`, dan hasil parse SELALU punya key `color` - jadi kode pembaca tidak perlu
     * membedakan "tidak ada key" vs `null`.
     *
     * Disimpan sebagai hex, bukan index palet: urutan/nama palet di UI boleh berubah tanpa mengubah
     * arti warna habit yang sudah tersimpan. Batas panjangnya sama dengan `color` di countdown &
     * schedule (dibatasi, tapi tak divalidasi bentuknya - yang menentukan palet adalah UI).
     */
    color: z.string().max(64).nullable().default(null),
    frequencyType: habitFrequencyTypeSchema,
    /** Multi-nilai; wajib ada kalau `frequency_type = weekly_days`. */
    frequencyDays: z.array(weekdaySchema).min(1).max(7).nullable(),
    targetPerDay: z.int().min(1).max(1_000),
    isArchived: z.boolean(),
    createdAt: epochMsSchema,
    updatedAt: epochMsSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.frequencyType === 'weekly_days') {
      if (value.frequencyDays === null || value.frequencyDays.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['frequencyDays'],
          message: 'habit mingguan wajib memilih minimal satu hari',
        })
      } else if (new Set(value.frequencyDays).size !== value.frequencyDays.length) {
        ctx.addIssue({ code: 'custom', path: ['frequencyDays'], message: 'hari tidak boleh dobel' })
      }
    }
  })

export type Habit = z.infer<typeof habitSchema>

/**
 * `habit_checkin`.
 *
 * Satu hari boleh banyak baris (akumulasi ke `target_per_day`), jadi `(habit_id, local_date)` BUKAN
 * unique. `local_date` dipakai (bukan UTC) karena hari habit mengikuti zona waktu perangkat.
 */
export const habitCheckinSchema = z
  .object({
    id: uuidV7Schema,
    habitId: uuidV7Schema,
    localDate: localDateSchema,
    amount: z.int().min(1).max(1_000),
    checkinAt: epochMsSchema,
  })
  .strict()

export type HabitCheckin = z.infer<typeof habitCheckinSchema>

/** Jumlah check-in satu hari (agregasi murni; `local_date` sudah lokal, jadi tidak perlu tz). */
export function checkinAmountForDate(checkins: readonly HabitCheckin[], localDate: string): number {
  let total = 0
  for (const checkin of checkins) {
    if (checkin.localDate === localDate) total += checkin.amount
  }
  return total
}

/**
 * Aturan murni: apakah hari ini adalah hari jadwal habit.
 *
 * Dipakai streak (F7) - "hari yang bukan jadwal habit tidak memutus streak".
 */
export function isScheduledDay(
  habit: Pick<Habit, 'frequencyType' | 'frequencyDays'>,
  weekday: string,
): boolean {
  if (habit.frequencyType === 'daily') return true
  const days = habit.frequencyDays ?? []
  return days.includes(weekday as (typeof days)[number])
}

/** Aturan murni: target hari tercapai (akumulasi beberapa check-in). */
export function isDayTargetMet(habit: Pick<Habit, 'targetPerDay'>, amount: number): boolean {
  return amount >= habit.targetPerDay
}
