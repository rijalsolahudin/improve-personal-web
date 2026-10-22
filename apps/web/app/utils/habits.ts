// Habit (PRD F7), mengikuti Home Desktop.dc.html `habitVals`. Fungsi murni; tanggal ISO lokal.

import type { IconName } from './icons'
import { addDays, fromIsoDate, toIsoDate } from './time'

/** Palet habit design (solid → latar lembut). */
export const HABIT_COLORS = [
  ['#9B4FC9', '#EEE6FA'],
  ['#FF6A13', '#FFE3D2'],
  ['#1DA20F', '#E0F2DA'],
  ['#0A55E6', '#DDE7FB'],
  ['#F03FBF', '#FCE0F2'],
  ['#E6A800', '#FFF0C8'],
  ['#E2445C', '#FFE1DA'],
  ['#10A8D8', '#DDF1F8'],
] as const

/** Pilihan ikon habit (Hugeicons, lihat utils/icons). */
export const HABIT_ICONS = [
  'star',
  'heart',
  'book-open',
  'moon',
  'droplet',
  'music',
  'flower',
  'flash',
  'coffee',
  'check',
  'dumbbell',
  'running-shoes',
  'walking',
  'bicycle',
  'swimming',
  'yoga',
  'football',
  'apple',
  'salad',
  'medicine',
  'sleeping',
  'brain',
  'prayer-rug',
  'shower',
  'clean',
  'home',
  'plant',
  'leaf',
  'sun',
  'mountain',
  'wallet',
  'piggy-bank',
  'laptop',
  'code',
  'pencil',
  'paint-brush',
  'camera',
  'guitar',
  'headphones',
  'gamepad',
  'call',
  'mail',
  'message',
  'users',
  'gift',
  'airplane',
  'globe',
  'flag',
  'alarm-clock',
  'smile',
] as const satisfies readonly IconName[]

export type HabitIcon = (typeof HABIT_ICONS)[number]

export const HABIT_NAME_MAX = 80
export const HABIT_TARGET_MAX = 20

/**
 * Batas runut ke belakang untuk streak, sekaligus jendela riwayat check-in yang dibaca UI.
 *
 * 400 hari dipilih karena tidak ada layar yang melihat lebih jauh dari itu: streak berhenti di
 * batas ini dan grid hanya menampilkan bulan yang dipilih. Check-in di luar jendela ini boleh tidak
 * dibaca - bukan data yang hilang, hanya riwayat yang memang tidak pernah dipakai UI.
 */
export const HABIT_LOOKBACK_DAYS = 400

export interface Habit {
  id: string
  name: string
  icon: HabitIcon
  /** Sticker (F14) menggantikan ikon kalau diisi. */
  sticker: string | null
  /** Index `HABIT_COLORS`. */
  color: number
  /** Hari terjadwal 0 (Minggu) … 6 (Sabtu); `null` = tiap hari. */
  days: number[] | null
  /** Check-in per hari yang dibutuhkan. */
  target: number
  goalId: string | null
  /** Habit terarsip tetap tersimpan & bisa dibuka, tapi tidak dihitung di daftar aktif. */
  isArchived: boolean
}

/** Jumlah check-in per habit per tanggal: `{ [habitId]: { [iso]: count } }`. */
export type CheckIns = Record<string, Record<string, number>>

export function isScheduled(habit: Habit, day: string): boolean {
  return habit.days === null || habit.days.includes(fromIsoDate(day).getDay())
}

export function countOn(checkIns: CheckIns, habitId: string, day: string): number {
  return checkIns[habitId]?.[day] ?? 0
}

export function isMet(habit: Habit, checkIns: CheckIns, day: string): boolean {
  return countOn(checkIns, habit.id, day) >= habit.target
}

/**
 * Streak aktif: hari terjadwal berturut-turut yang tercapai, mundur dari hari ini.
 * Hari bukan jadwal dilewati (tidak memutus); hari ini yang belum tercapai juga belum
 * memutus streak (harinya belum selesai).
 */
export function currentStreak(habit: Habit, checkIns: CheckIns, today: string): number {
  let streak = 0
  for (let offset = 0; offset < HABIT_LOOKBACK_DAYS; offset += 1) {
    const day = addDays(today, -offset)
    if (!isScheduled(habit, day)) continue
    if (isMet(habit, checkIns, day)) streak += 1
    else if (offset > 0) break
  }
  return streak
}

/** % hari terjadwal yang tercapai dari `from` sampai `to` (maks hari ini). */
export function completionRate(habit: Habit, checkIns: CheckIns, from: string, to: string): number {
  let scheduled = 0
  let met = 0
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (!isScheduled(habit, day)) continue
    scheduled += 1
    if (isMet(habit, checkIns, day)) met += 1
  }
  return scheduled ? Math.round((met / scheduled) * 100) : 0
}

/**
 * Klik kotak tanggal: tiap klik menambah satu check-in, dan klik saat target sudah tercapai
 * mengembalikan hari itu ke 0.
 *
 * Satu aturan untuk semua hari - hari ini maupun hari lampau - karena hint UI (`habit.hint`)
 * menjanjikan "target >1x/hari: klik berulang" untuk kotak mana pun yang diketuk. Backfill beberapa
 * hari ke belakang jadi mungkin dicicil, bukan hanya "penuh sekali klik". Hari depan tidak sampai ke
 * sini (kisi menonaktifkannya).
 */
export function nextCount(habit: Habit, count: number): number {
  return count >= habit.target ? 0 : count + 1
}

export function setCount(
  checkIns: CheckIns,
  habitId: string,
  day: string,
  count: number,
): CheckIns {
  const days = Object.fromEntries(
    Object.entries(checkIns[habitId] ?? {}).filter(([entryDay]) => entryDay !== day),
  )
  if (count > 0) days[day] = count
  return { ...checkIns, [habitId]: days }
}

// ---- Form ----------------------------------------------------------------------------

export interface HabitDraft {
  name: string
  icon: HabitIcon
  sticker: string | null
  color: number
  days: number[] | null
  target: number
  goalId: string | null
}

export type HabitDraftError = 'nameRequired' | 'nameTooLong' | 'noDays' | 'target'

export function validateHabitDraft(draft: HabitDraft): HabitDraftError | null {
  const name = draft.name.trim()
  if (!name) return 'nameRequired'
  if (name.length > HABIT_NAME_MAX) return 'nameTooLong'
  if (draft.days !== null && !draft.days.length) return 'noDays'
  if (!Number.isInteger(draft.target) || draft.target < 1 || draft.target > HABIT_TARGET_MAX) {
    return 'target'
  }
  return null
}

export function emptyHabitDraft(): HabitDraft {
  return { name: '', icon: 'star', sticker: null, color: 0, days: null, target: 1, goalId: null }
}

/** Arsip bukan bagian form: nilai lamanya dipertahankan pemanggil (`applyHabitDraft`). */
export function draftFromHabit(habit: Habit): HabitDraft {
  const { id: _id, isArchived: _isArchived, ...draft } = habit
  return { ...draft, days: draft.days ? [...draft.days] : null }
}

export function applyHabitDraft(draft: HabitDraft, id: string, isArchived = false): Habit {
  return {
    ...draft,
    id,
    name: draft.name.trim(),
    days: draft.days ? [...draft.days] : null,
    isArchived,
  }
}

/** Semua tanggal (ISO) di bulan yang memuat `anchor`. */
export function monthDaysOf(anchor: string): string[] {
  const date = fromIsoDate(anchor)
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const first = toIsoDate(new Date(date.getFullYear(), date.getMonth(), 1))
  return Array.from({ length: count }, (_, i) => addDays(first, i))
}
