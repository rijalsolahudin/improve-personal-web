import type { z } from 'zod'

import { type EntityType, entityTypeSchema } from '../envelope.ts'
import { decorationSchema } from './decoration.ts'
import { goalChapterSchema, goalLinkSchema, goalSchema } from './goal.ts'
import { countdownSchema, habitCheckinSchema, habitSchema } from './habit.ts'
import {
  journalAffirmationSchema,
  journalEntrySchema,
  journalMentionSchema,
  journalReflectionSchema,
  journalStickerSchema,
} from './journal.ts'
import { pomodoroSessionSchema, pomodoroSettingsSchema } from './pomodoro.ts'
import {
  scheduleExceptionSchema,
  scheduleOccurrenceSchema,
  scheduleRecurrenceSchema,
  scheduleSchema,
} from './schedule.ts'
import { eisenhowerPlacementSchema, todoSchema } from './todo.ts'
import { userPrefsSchema } from './user-prefs.ts'
import { userProfileSchema } from './user-profile.ts'

/**
 * Registry tipe entitas -> schema payload.
 *
 * Satu tempat yang memetakan `entity_type` (`database.dbml` Bagian A) ke bentuk `data: T` (Bagian B).
 * Dipakai untuk:
 * - validasi penuh saat import (PRD F10 "Schema match"),
 * - memilih schema saat mengubah payload jadi entitas bertipe,
 * - menjaga agar tiap tipe di enum benar-benar punya schema (dicek lewat type + test).
 */

/**
 * Payload `schedule` = data jadwal + recurrence EMBEDDED.
 *
 * Di DBML `schedule_recurrence` punya kolom `id`/`schedule_id` sendiri karena dia juga dibaca sebagai
 * tabel logis, tapi secara fisik dia bagian dari record `schedule`. Field `id` dan `scheduleId` di
 * dalam recurrence tetap wajib diisi pemanggil (biasanya sama dengan id jadwal) supaya bentuk berkas
 * export/import bisa dipakai versi lain tanpa transformasi tambahan.
 *
 * Recurrence `null` = jadwal sekali (tidak berulang), jadi tidak ada baris recurrence sama sekali.
 */
export const schedulePayloadSchema = scheduleSchema
  .extend({ recurrence: scheduleRecurrenceSchema.nullable() })
  .strict()

export type SchedulePayload = z.infer<typeof schedulePayloadSchema>

/**
 * Schema payload per tipe entitas.
 *
 * `satisfies Record<EntityType, z.ZodTypeAny>` menjamin kelengkapannya di level TYPE: menambah nilai
 * di `ENTITY_TYPES` tanpa menambah entry di sini = error typecheck, bukan bug yang ketahuan nanti.
 */
export const ENTITY_PAYLOAD_SCHEMAS = {
  schedule: schedulePayloadSchema,
  schedule_exception: scheduleExceptionSchema,
  schedule_occurrence: scheduleOccurrenceSchema,
  todo: todoSchema,
  eisenhower_placement: eisenhowerPlacementSchema,
  pomodoro_settings: pomodoroSettingsSchema,
  pomodoro_session: pomodoroSessionSchema,
  countdown: countdownSchema,
  habit: habitSchema,
  habit_checkin: habitCheckinSchema,
  journal_entry: journalEntrySchema,
  journal_reflection: journalReflectionSchema,
  journal_affirmation: journalAffirmationSchema,
  journal_sticker: journalStickerSchema,
  journal_mention: journalMentionSchema,
  goal: goalSchema,
  goal_chapter: goalChapterSchema,
  goal_link: goalLinkSchema,
  decoration: decorationSchema,
  user_prefs: userPrefsSchema,
  user_profile: userProfileSchema,
} as const satisfies Record<EntityType, z.ZodTypeAny>

/** Hasil validasi payload: berhasil dengan data, atau gagal dengan masalah yang bisa dibaca. */
export type PayloadValidation =
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly issues: readonly string[] }

/**
 * Validasi payload satu record terhadap schema tipe-nya.
 *
 * Tidak melempar error: satu record rusak di antara ribuan saat import tidak boleh menggagalkan
 * seluruh proses tanpa jejak - pemanggil yang memutuskan apa yang harus dilakukan (tolak berkas, atau
 * laporkan record mana yang bermasalah).
 */
export function validateEntityPayload(type: string, data: unknown): PayloadValidation {
  const parsedType = entityTypeSchema.safeParse(type)
  if (!parsedType.success) return { ok: false, issues: [`tipe entitas tak dikenal: ${type}`] }

  const schema = ENTITY_PAYLOAD_SCHEMAS[parsedType.data] as z.ZodTypeAny
  const result = schema.safeParse(data)
  if (result.success) return { ok: true, data: result.data }

  return {
    ok: false,
    issues: result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
      return `${path}: ${issue.message}`
    }),
  }
}

/** Tipe payload untuk satu tipe entitas - berguna di use case yang tipenya sudah pasti. */
export type EntityPayloadOf<T extends EntityType> = z.infer<(typeof ENTITY_PAYLOAD_SCHEMAS)[T]>

export {
  countdownSchema,
  decorationSchema,
  eisenhowerPlacementSchema,
  goalChapterSchema,
  goalLinkSchema,
  goalSchema,
  habitCheckinSchema,
  habitSchema,
  journalAffirmationSchema,
  journalEntrySchema,
  journalMentionSchema,
  journalReflectionSchema,
  journalStickerSchema,
  pomodoroSessionSchema,
  pomodoroSettingsSchema,
  scheduleExceptionSchema,
  scheduleOccurrenceSchema,
  scheduleRecurrenceSchema,
  scheduleSchema,
  todoSchema,
  userPrefsSchema,
  userProfileSchema,
}
