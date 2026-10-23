import { z } from 'zod'

/**
 * Enum domain - sumber tunggalnya `apps/web/docs/database.dbml` Bagian B.
 *
 * Semua nilai enum dipertahankan persis seperti DBML (huruf kecil, istilah Indonesia untuk yang
 * memang Indonesia: `senin`, `kantung`...), karena nilai ini ikut masuk ke berkas export/import JSON
 * yang dibaca versi app lain (PRD F10).
 *
 * Aturan yang berlaku untuk semua enum di sini:
 * - Nama dan urutan nilai SAMA dengan DBML; menambah nilai baru = perubahan schema yang boleh
 *   (additive), membuang/mengganti arti nilai = perubahan breaking.
 * - Zod schema dipakai untuk validasi import (F10) dan untuk tipe (`z.infer`), jadi tipe dan skema
 *   tidak bisa divergen.
 * - Nilai tak dikenal dari sync/import versi lain TIDAK otomatis di-default di level enum (itu akan
 *   menyembunyikan data rusak). Jalur "tak dikenal -> default tanpa error" (F16) ditangani eksplisit
 *   di `domain/user-prefs.ts`, karena hanya `user_prefs` yang menuntut perilaku itu.
 */

/** Urutan hari mengikuti ARCHITECTURE.md §11: minggu mulai SENIN. */
export const WEEKDAYS = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'] as const

export type Weekday = (typeof WEEKDAYS)[number]

export const weekdaySchema = z.enum(WEEKDAYS)

/** Nomor 1-7 dengan Senin = 1 (selaras `Date.prototype.getUTCDay` kecuali Minggu). */
export const WEEKDAY_INDEX: Readonly<Record<Weekday, number>> = {
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  sabtu: 6,
  minggu: 7,
}

export const RECURRENCE_TYPES = ['once', 'daily', 'weekly', 'monthly'] as const

export type RecurrenceType = (typeof RECURRENCE_TYPES)[number]

export const recurrenceTypeSchema = z.enum(RECURRENCE_TYPES)

export const RECURRENCE_MONTH_MODES = ['by_day_of_month', 'by_nth_weekday'] as const

export type RecurrenceMonthMode = (typeof RECURRENCE_MONTH_MODES)[number]

export const recurrenceMonthModeSchema = z.enum(RECURRENCE_MONTH_MODES)

export const RECURRENCE_END_MODES = ['never', 'until_date', 'after_count'] as const

export type RecurrenceEndMode = (typeof RECURRENCE_END_MODES)[number]

export const recurrenceEndModeSchema = z.enum(RECURRENCE_END_MODES)

/**
 * Mode exception PRD F1.
 *
 * Cuma DUA nilai, bukan tiga: pilihan "semua" tidak membuat baris `schedule_exception` - dia
 * mengubah record `schedule` induknya (`database.dbml` catatan `schedule_exception`). Karena itu
 * tidak ada `'all'` di enum ini.
 */
export const EXCEPTION_MODES = ['only_this', 'this_and_following'] as const

export type ExceptionMode = (typeof EXCEPTION_MODES)[number]

export const exceptionModeSchema = z.enum(EXCEPTION_MODES)

export const OCCURRENCE_STATUSES = ['pending', 'done', 'missed'] as const

export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number]

export const occurrenceStatusSchema = z.enum(OCCURRENCE_STATUSES)

export const TODO_PRIORITIES = ['low', 'medium', 'urgent'] as const

export type TodoPriority = (typeof TODO_PRIORITIES)[number]

export const todoPrioritySchema = z.enum(TODO_PRIORITIES)

/** Urutan kepentingan naik - dipakai sorting prioritas (F2). */
export const TODO_PRIORITY_RANK: Readonly<Record<TodoPriority, number>> = {
  low: 0,
  medium: 1,
  urgent: 2,
}

export const QUADRANTS = ['do', 'schedule', 'delegate', 'delete'] as const

export type Quadrant = (typeof QUADRANTS)[number]

export const quadrantSchema = z.enum(QUADRANTS)

export const POMODORO_TARGET_TYPES = ['todo', 'free_text'] as const

export type PomodoroTargetType = (typeof POMODORO_TARGET_TYPES)[number]

export const pomodoroTargetTypeSchema = z.enum(POMODORO_TARGET_TYPES)

export const POMODORO_SESSION_STATUSES = ['completed', 'skipped'] as const

export type PomodoroSessionStatus = (typeof POMODORO_SESSION_STATUSES)[number]

export const pomodoroSessionStatusSchema = z.enum(POMODORO_SESSION_STATUSES)

export const HABIT_FREQUENCY_TYPES = ['daily', 'weekly_days'] as const

export type HabitFrequencyType = (typeof HABIT_FREQUENCY_TYPES)[number]

export const habitFrequencyTypeSchema = z.enum(HABIT_FREQUENCY_TYPES)

/** 5 skala, paling negatif dulu (PRD F8 "Perasaan"). */
export const MOODS = ['sangat_sedih', 'sedih', 'netral', 'bahagia', 'sangat_bahagia'] as const

export type Mood = (typeof MOODS)[number]

export const moodSchema = z.enum(MOODS)

/** Peringkat mood 1-5; dipakai agregasi Overview (F11) - jangan asal mengubah urutannya. */
export const MOOD_SCORE: Readonly<Record<Mood, number>> = {
  sangat_sedih: 1,
  sedih: 2,
  netral: 3,
  bahagia: 4,
  sangat_bahagia: 5,
}

export const REFLECTION_KINDS = ['bersyukur', 'sedih', 'bisa_lebih_baik'] as const

export type ReflectionKind = (typeof REFLECTION_KINDS)[number]

export const reflectionKindSchema = z.enum(REFLECTION_KINDS)

export const GOAL_CATEGORIES = ['karier', 'kesehatan', 'keuangan', 'diri', 'relasi'] as const

export type GoalCategory = (typeof GOAL_CATEGORIES)[number]

export const goalCategorySchema = z.enum(GOAL_CATEGORIES)

export const GOAL_STATUSES = ['aktif', 'selesai', 'ditunda', 'dibatalkan'] as const

export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const goalStatusSchema = z.enum(GOAL_STATUSES)

/** Hanya tiga tipe item yang boleh ditaut ke goal (PRD F13 "Tautan Item"). */
export const LINKABLE_ITEM_TYPES = ['todo', 'habit', 'schedule'] as const

export type LinkableItemType = (typeof LINKABLE_ITEM_TYPES)[number]

export const linkableItemTypeSchema = z.enum(LINKABLE_ITEM_TYPES)

/**
 * Tipe target mention jurnal (PRD F8).
 *
 * `journal_mention.target_id` adalah SOFT REF - target boleh sudah dihapus, dan mention ke jadwal
 * terhapus harus tampil sebagai chip "jadwal dihapus" tanpa error.
 */
export const MENTION_TARGET_TYPES = ['schedule', 'goal', 'goal_chapter'] as const

export type MentionTargetType = (typeof MENTION_TARGET_TYPES)[number]

export const mentionTargetTypeSchema = z.enum(MENTION_TARGET_TYPES)

/** Hiasan disimpan per ukuran layar: HP <600px, tablet 600-1024px, desktop >1024px (PRD F14, F16). */
export const BREAKPOINTS = ['phone', 'tablet', 'desktop'] as const

export type Breakpoint = (typeof BREAKPOINTS)[number]

export const breakpointSchema = z.enum(BREAKPOINTS)

/** Batas lebar viewport per breakpoint, sinkron dengan catatan `database.dbml`. */
export const BREAKPOINT_MAX_WIDTH_PX: Readonly<Record<Breakpoint, number>> = {
  phone: 599,
  tablet: 1023,
  desktop: Number.POSITIVE_INFINITY,
}

export const THEME_COLORS = ['kuning', 'hijau', 'ungu'] as const

export type ThemeColor = (typeof THEME_COLORS)[number]

export const themeColorSchema = z.enum(THEME_COLORS)

/** Default pertama kali: Cute + Kuning (PRD F16). */
export const DEFAULT_THEME_COLOR: ThemeColor = 'kuning'

/**
 * Kosakata gaya (F16) - KANONIK, sama persis dengan `STYLE_NAMES` di `@improve-personal/tokens`.
 *
 * Kebab-case (`cute-pure`) karena nilai ini dipakai UI sebagai `data-style`/selector CSS dan ditulis
 * ke `user_prefs` apa adanya. Satu ejaan saja untuk data baru: JANGAN menambah nilai kanonik dengan
 * underscore - nilai seperti itu tidak akan pernah cocok dengan `data-style` di CSS.
 *
 * Ejaan lama `cute_pure` (snake_case) tetap DIBACA lewat `LEGACY_APP_STYLES`/`normalizeAppStyle` dan
 * tidak dihapus, karena record `user_prefs`, hasil sync, serta berkas export versi sebelumnya masih
 * memakainya. Tanpa alias itu Cute Pure jatuh ke Cute (QA T25 B2).
 */
export const APP_STYLES = [
  'cute',
  'cute-pure',
  'kertas',
  'simple',
  'elegan',
  'vintage',
  'tegas',
] as const

export type AppStyle = (typeof APP_STYLES)[number]

/**
 * Ejaan lama yang masih bisa muncul di data tersimpan/berkas export versi sebelumnya.
 *
 * Hanya untuk MIGRASI BACA: nilai ini dipetakan ke bentuk kanonik saat di-parse, tidak pernah
 * ditulis ulang oleh kode baru. Tambah entri di sini kalau ada ejaan lama lain - jangan menambahkannya
 * ke `APP_STYLES`, karena daftar kanonik harus identik dengan daftar gaya UI.
 */
export const LEGACY_APP_STYLES = ['cute_pure'] as const

export type LegacyAppStyle = (typeof LEGACY_APP_STYLES)[number]

/** Ejaan lama -> bentuk kanonik. Satu-satunya tempat pemetaan ini didefinisikan. */
export const LEGACY_APP_STYLE_TO_CURRENT: Readonly<Record<LegacyAppStyle, AppStyle>> = {
  cute_pure: 'cute-pure',
}

/** Aturan murni: apakah string ini ejaan lama yang masih harus diterima saat membaca data. */
export function isLegacyAppStyle(value: unknown): value is LegacyAppStyle {
  return typeof value === 'string' && (LEGACY_APP_STYLES as readonly string[]).includes(value)
}

/**
 * Kanonik-kan satu nilai gaya dari sumber mana pun (record DB, sync, import).
 *
 * Mengembalikan `null` untuk nilai yang benar-benar asing - pemanggil yang menentukan apakah itu
 * harus jadi default (F16) atau ditolak (schema tulis/import).
 */
export function normalizeAppStyle(value: unknown): AppStyle | null {
  if (typeof value !== 'string') return null
  if ((APP_STYLES as readonly string[]).includes(value)) return value as AppStyle
  if (isLegacyAppStyle(value)) return LEGACY_APP_STYLE_TO_CURRENT[value]
  return null
}

/**
 * Schema gaya yang dipakai `user_prefs` (jalur tulis/import).
 *
 * Menerima kanonik DAN ejaan lama, tetapi hasil parse SELALU kanonik. Dengan begitu berkas export
 * lama tetap lolos validasi (tidak perlu "diperbaiki" manual) dan record yang ditulis ulang otomatis
 * termigrasi ke ejaan kanonik. Nilai asing tetap ditolak - lihat catatan di `domain/user-prefs.ts`.
 */
export const appStyleSchema = z.preprocess(
  (value: unknown) => normalizeAppStyle(value) ?? value,
  z.enum(APP_STYLES),
)

export const DEFAULT_APP_STYLE: AppStyle = 'cute'
