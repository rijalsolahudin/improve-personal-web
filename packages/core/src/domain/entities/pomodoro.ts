import { z } from 'zod'

import { pomodoroSessionStatusSchema, pomodoroTargetTypeSchema } from '../enums.ts'
import { epochMsSchema, uuidV7Schema } from './primitives.ts'

/**
 * F4 Pomodoro - `pomodoro_settings` (singleton per akun) + `pomodoro_session` (riwayat).
 *
 * Waktu timer dihitung dari timestamp, bukan `setInterval`, supaya tetap akurat walau tab/app
 * di-background (AC T7 ±1 detik setelah background 5 menit).
 */

export const DEFAULT_FOCUS_MS = 1_500_000
export const DEFAULT_SHORT_BREAK_MS = 300_000
export const DEFAULT_LONG_BREAK_MS = 900_000
export const DEFAULT_SESSIONS_BEFORE_LONG = 4

/** Batas wajar durasi: 1 detik sampai 24 jam. Menahan setting rusak dari import. */
const MIN_DURATION_MS = 1_000
const MAX_DURATION_MS = 24 * 60 * 60 * 1_000

export const pomodoroSettingsSchema = z
  .object({
    id: uuidV7Schema,
    focusMs: z.int().min(MIN_DURATION_MS).max(MAX_DURATION_MS),
    shortBreakMs: z.int().min(MIN_DURATION_MS).max(MAX_DURATION_MS),
    longBreakMs: z.int().min(MIN_DURATION_MS).max(MAX_DURATION_MS),
    sessionsBeforeLong: z.int().min(1).max(20),
    updatedAt: epochMsSchema,
  })
  .strict()

export type PomodoroSettings = z.infer<typeof pomodoroSettingsSchema>

export const DEFAULT_POMODORO_SETTINGS: Omit<PomodoroSettings, 'id' | 'updatedAt'> = {
  focusMs: DEFAULT_FOCUS_MS,
  shortBreakMs: DEFAULT_SHORT_BREAK_MS,
  longBreakMs: DEFAULT_LONG_BREAK_MS,
  sessionsBeforeLong: DEFAULT_SESSIONS_BEFORE_LONG,
}

/**
 * `pomodoro_session`.
 *
 * `target_type: 'todo'` WAJIB punya `target_todo_id`, `'free_text'` WAJIB punya `target_text` -
 * divalidasi di `superRefine`, supaya sesi tanpa target yang bisa ditampilkan tidak lolos import.
 */
export const pomodoroSessionSchema = z
  .object({
    id: uuidV7Schema,
    startedAt: epochMsSchema,
    /** `null` kalau masih berjalan. */
    endedAt: epochMsSchema.nullable(),
    /** Durasi aktual start -> end, BUKAN durasi setting. */
    actualDurationMs: z.int().min(0).max(MAX_DURATION_MS).nullable(),
    targetType: pomodoroTargetTypeSchema,
    /** Soft ref ke todo; boleh menunjuk task yang sudah dihapus. */
    targetTodoId: uuidV7Schema.nullable(),
    targetText: z.string().trim().min(1).max(500).nullable(),
    status: pomodoroSessionStatusSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.targetType === 'todo' && value.targetTodoId === null) {
      ctx.addIssue({ code: 'custom', path: ['targetTodoId'], message: 'target todo wajib diisi' })
    }
    if (value.targetType === 'free_text' && value.targetText === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetText'],
        message: 'target teks bebas wajib diisi',
      })
    }
    if (value.endedAt !== null && value.endedAt < value.startedAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['endedAt'],
        message: 'endedAt tidak boleh sebelum startedAt',
      })
    }
    if (value.endedAt === null && value.actualDurationMs !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['actualDurationMs'],
        message: 'sesi yang masih berjalan belum punya durasi aktual',
      })
    }
  })

export type PomodoroSession = z.infer<typeof pomodoroSessionSchema>

/**
 * Aturan murni: sisa waktu timer dihitung dari timestamp, bukan dari counter yang dikurangi tiap tick.
 *
 * Satu parameter `nowMs` yang di-inject = satu-satunya alasan timer tetap tepat setelah app
 * di-background (tick yang terlewat tidak pernah "menghemat" waktu).
 */
export function pomodoroRemainingMs(input: {
  readonly startedAt: number
  readonly durationMs: number
  readonly pausedTotalMs: number
  readonly nowMs: number
}): number {
  const elapsed = input.nowMs - input.startedAt - input.pausedTotalMs
  return Math.max(0, input.durationMs - Math.max(0, elapsed))
}

/** Aturan murni: apakah sesi ke-`completedCount + 1` harus memakai jeda panjang. */
export function shouldUseLongBreak(completedCount: number, settings: PomodoroSettings): boolean {
  if (settings.sessionsBeforeLong <= 0) return false
  return (completedCount + 1) % settings.sessionsBeforeLong === 0
}

/** Aturan murni: durasi aktual sesi yang baru selesai/di-skip. */
export function actualSessionDurationMs(startedAt: number, endedAt: number): number {
  return Math.max(0, endedAt - startedAt)
}
