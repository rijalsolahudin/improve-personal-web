// Countdown (PRD F5), mengikuti `cdTarget`/`cdText` di Home Desktop.dc.html.
// Fungsi murni; waktu di-inject, tanpa Date.now(). Tanggal ISO lokal `YYYY-MM-DD`.

import { isTime } from './schedule'
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND, isIsoDate } from './time'

/** Palet warna countdown (design `COLS`). */
export const COUNTDOWN_COLORS = [
  '#F03FBF',
  '#E2445C',
  '#FF6A13',
  '#E6A800',
  '#1DA20F',
  '#10A8D8',
  '#0A55E6',
  '#9B4FC9',
] as const

/** Stiker emoji cepat untuk form (design `cf.emojis`). */
export const COUNTDOWN_EMOJIS = [
  '🎂',
  '🎉',
  '❤️',
  '✈️',
  '🎓',
  '💼',
  '🏃',
  '🎯',
  '💍',
  '🎄',
  '⭐',
  '📅',
] as const

/** [latar tint, warna teks] per warna solid (design `SOFT`). */
const TINTS: Record<string, readonly [string, string]> = {
  '#F03FBF': ['#FCE0F2', '#9A2F82'],
  '#E2445C': ['#FFE1DA', '#B0283E'],
  '#FF6A13': ['#FFE3D2', '#B4400C'],
  '#E6A800': ['#FFF0C8', '#8A5A00'],
  '#1DA20F': ['#E0F2DA', '#2E6A26'],
  '#10A8D8': ['#DDF1F8', '#1E5D78'],
  '#0A55E6': ['#DDE7FB', '#0A3FA8'],
  '#9B4FC9': ['#EEE6FA', '#6B3FA0'],
}

export function countdownTint(color: string): readonly [string, string] {
  return TINTS[color] ?? ['#FBF3E6', '#5E5040']
}

export interface Countdown {
  id: string
  title: string
  /** Tanggal target `YYYY-MM-DD`. */
  date: string
  /** Jam target `HH:MM`; kosong = sepanjang hari. */
  time: string
  emoji: string
  /** Sticker (F14) menggantikan emoji kalau diisi. */
  sticker: string | null
  color: string
  /** Ulang tiap tahun (ulang tahun/anniversary). */
  yearly: boolean
  archived: boolean
}

const startOfDay = (ms: number): number => new Date(ms).setHours(0, 0, 0, 0)

/** Epoch ms target; kalau `yearly`, ambil kejadian berikutnya (tahun ini atau depan). */
export function countdownTarget(
  countdown: Pick<Countdown, 'date' | 'time' | 'yearly'>,
  now: number,
): number {
  const time = countdown.time || '00:00'
  if (!countdown.yearly) return new Date(`${countdown.date}T${time}:00`).getTime()
  const occurrence = new Date(`${countdown.date}T${time}:00`)
  occurrence.setFullYear(new Date(now).getFullYear())
  const reference = countdown.time ? occurrence.getTime() : occurrence.getTime() + MS_PER_DAY
  if (reference <= now) occurrence.setFullYear(new Date(now).getFullYear() + 1)
  return occurrence.getTime()
}

/** Sepanjang hari selesai di akhir harinya, jadi baru "lewat" besok. */
export function isCountdownPast(
  countdown: Pick<Countdown, 'time'>,
  target: number,
  now: number,
): boolean {
  return countdown.time ? target <= now : target + MS_PER_DAY <= now
}

export function isCountdownToday(
  countdown: Pick<Countdown, 'time'>,
  target: number,
  now: number,
): boolean {
  return !countdown.time && startOfDay(target) === startOfDay(now)
}

export type CountdownUnit = 'tahun' | 'bulan' | 'hari' | 'jam' | 'menit' | 'detik'
export interface CountdownPart {
  unit: CountdownUnit
  value: number
}
export type CountdownLeft =
  | { kind: 'justNow' }
  | { kind: 'past'; parts: [CountdownPart] }
  | { kind: 'left'; parts: CountdownPart[] }

/**
 * Sisa/lewat waktu dalam 1–2 unit terbesar: "2 bulan 10 hari", "12 menit 30 detik".
 * Lewat: "3 hari"/"2 jam" (dipakai `countdown.past`) atau `justNow`.
 */
export function describeCountdown(target: number, now: number): CountdownLeft {
  if (target <= now) {
    const ms = now - target
    const days = Math.floor(ms / MS_PER_DAY)
    if (days >= 1) return { kind: 'past', parts: [{ unit: 'hari', value: days }] }
    const hours = Math.floor(ms / MS_PER_HOUR)
    if (hours >= 1) return { kind: 'past', parts: [{ unit: 'jam', value: hours }] }
    return { kind: 'justNow' }
  }
  let cursor = new Date(now)
  let years = 0
  let months = 0
  for (;;) {
    const next = new Date(cursor)
    next.setFullYear(next.getFullYear() + 1)
    if (next.getTime() <= target) {
      cursor = next
      years += 1
    } else break
  }
  for (;;) {
    const next = new Date(cursor)
    next.setMonth(next.getMonth() + 1)
    if (next.getTime() <= target) {
      cursor = next
      months += 1
    } else break
  }
  let rest = target - cursor.getTime()
  const days = Math.floor(rest / MS_PER_DAY)
  rest -= days * MS_PER_DAY
  const hours = Math.floor(rest / MS_PER_HOUR)
  rest -= hours * MS_PER_HOUR
  const minutes = Math.floor(rest / MS_PER_MINUTE)
  rest -= minutes * MS_PER_MINUTE
  const seconds = Math.floor(rest / MS_PER_SECOND)

  if (years)
    return {
      kind: 'left',
      parts: months
        ? [
            { unit: 'tahun', value: years },
            { unit: 'bulan', value: months },
          ]
        : [{ unit: 'tahun', value: years }],
    }
  if (months)
    return {
      kind: 'left',
      parts: days
        ? [
            { unit: 'bulan', value: months },
            { unit: 'hari', value: days },
          ]
        : [{ unit: 'bulan', value: months }],
    }
  if (days)
    return {
      kind: 'left',
      parts: hours
        ? [
            { unit: 'hari', value: days },
            { unit: 'jam', value: hours },
          ]
        : [{ unit: 'hari', value: days }],
    }
  if (hours)
    return {
      kind: 'left',
      parts: minutes
        ? [
            { unit: 'jam', value: hours },
            { unit: 'menit', value: minutes },
          ]
        : [{ unit: 'jam', value: hours }],
    }
  return {
    kind: 'left',
    parts: [
      { unit: 'menit', value: minutes },
      { unit: 'detik', value: seconds },
    ],
  }
}

export interface CountdownView {
  countdown: Countdown
  target: number
  past: boolean
  today: boolean
}

export interface CountdownGroups {
  /** Belum lewat, terdekat dulu. */
  upcoming: CountdownView[]
  /** Sudah lewat, terbaru dulu. */
  past: CountdownView[]
  archived: CountdownView[]
}

export function toCountdownView(countdown: Countdown, now: number): CountdownView {
  const target = countdownTarget(countdown, now)
  return {
    countdown,
    target,
    past: isCountdownPast(countdown, target, now),
    today: isCountdownToday(countdown, target, now),
  }
}

export function groupCountdowns(countdowns: readonly Countdown[], now: number): CountdownGroups {
  const views = countdowns.map((countdown) => toCountdownView(countdown, now))
  const active = views.filter((view) => !view.countdown.archived)
  return {
    upcoming: active.filter((view) => !view.past).sort((a, b) => a.target - b.target),
    past: active.filter((view) => view.past).sort((a, b) => b.target - a.target),
    archived: views.filter((view) => view.countdown.archived).sort((a, b) => a.target - b.target),
  }
}

/** Umur kejadian tahunan: 0 = tahun pertama, 3 = "yang ke-3". */
export function yearlyEdition(
  countdown: Pick<Countdown, 'date' | 'yearly'>,
  target: number,
): number {
  if (!countdown.yearly) return 0
  return new Date(target).getFullYear() - Number(countdown.date.slice(0, 4))
}

/** Kotak angka di kartu momen (design `dNum`/`dLbl`): selisih hari kalender. */
export type DayBadge = { kind: 'today' } | { kind: 'tomorrow' | 'ahead' | 'ago'; days: number }

export function dayBadge(target: number, now: number, isToday: boolean): DayBadge {
  const days = Math.round((startOfDay(target) - startOfDay(now)) / MS_PER_DAY)
  if (isToday || days === 0) return { kind: 'today' }
  if (days > 0) return { kind: days === 1 ? 'tomorrow' : 'ahead', days }
  return { kind: 'ago', days: -days }
}

// ---- Form ----------------------------------------------------------------------------

export const COUNTDOWN_TITLE_MAX = 80

export interface CountdownDraft {
  title: string
  date: string
  time: string
  emoji: string
  sticker: string | null
  color: string
  yearly: boolean
}

export type CountdownDraftError = 'titleRequired' | 'titleTooLong' | 'dateRequired' | 'pastDate'

export function newCountdownDraft(today: string): CountdownDraft {
  return {
    title: '',
    date: today,
    time: '',
    emoji: '🎉',
    sticker: null,
    color: COUNTDOWN_COLORS[0],
    yearly: false,
  }
}

export function draftFromCountdown(countdown: Countdown): CountdownDraft {
  return {
    title: countdown.title,
    date: countdown.date,
    time: countdown.time,
    emoji: countdown.emoji,
    sticker: countdown.sticker,
    color: countdown.color,
    yearly: countdown.yearly,
  }
}

/** `isEdit`: momen lama boleh tetap di tanggal lampau; momen baru tidak. */
export function validateCountdownDraft(
  draft: CountdownDraft,
  now: number,
  isEdit: boolean,
): CountdownDraftError | null {
  const title = draft.title.trim()
  if (!title) return 'titleRequired'
  if (title.length > COUNTDOWN_TITLE_MAX) return 'titleTooLong'
  if (!isIsoDate(draft.date) || (draft.time !== '' && !isTime(draft.time))) return 'dateRequired'
  if (!isEdit && !draft.yearly) {
    const target = countdownTarget(draft, now)
    if (draft.time ? target <= now : target + MS_PER_DAY <= now) return 'pastDate'
  }
  return null
}

export function countdownFromDraft(draft: CountdownDraft, id: string): Countdown {
  return {
    id,
    title: draft.title.trim(),
    date: draft.date,
    time: draft.time,
    emoji: draft.emoji,
    sticker: draft.sticker,
    color: draft.color,
    yearly: draft.yearly,
    archived: false,
  }
}
