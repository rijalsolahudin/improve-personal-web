/** Fungsi waktu murni (waktu di-inject, tanpa Date.now()) - kandidat pindah ke packages/core/calc. */

export const MS_PER_SECOND = 1000
export const MS_PER_MINUTE = 60 * MS_PER_SECOND
export const MS_PER_HOUR = 60 * MS_PER_MINUTE
export const MS_PER_DAY = 24 * MS_PER_HOUR
const DAYS_PER_MONTH = 30

export type GreetingPeriod = 'pagi' | 'siang' | 'sore' | 'malam'

/** Batas jam sapaan sesuai design: < 11 pagi, < 15 siang, < 18 sore, sisanya malam. */
export function greetingPeriod(hour: number): GreetingPeriod {
  if (hour < 11) return 'pagi'
  if (hour < 15) return 'siang'
  if (hour < 18) return 'sore'
  return 'malam'
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

/** `HH:MM:SS`, dibulatkan ke bawah per detik; negatif dianggap 0. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MS_PER_SECOND))
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`
}

/** Jam lokal `HH:MM` (Intl id-ID memakai titik "19.00", design memakai titik dua). */
export function formatHourMinute(ms: number): string {
  const date = new Date(ms)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** `MM:SS`, dibulatkan ke atas supaya timer tidak menampilkan 00:00 sebelum benar-benar habis. */
export function formatMinutesSeconds(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / MS_PER_SECOND))
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`
}

export type TimeUnit = 'bulan' | 'hari' | 'jam' | 'menit'
export interface TimePart {
  unit: TimeUnit
  value: number
}
export type TimeLeft =
  { kind: 'none' } | { kind: 'left' | 'late'; parts: [TimePart] | [TimePart, TimePart] }

/**
 * Sisa waktu ke deadline dalam maksimal 2 unit terbesar ("3 jam 12 menit", "2 hari 4 jam").
 * Unit kedua dibuang kalau nol. Minimal 1 menit supaya tidak muncul "0 menit".
 */
export function describeTimeLeft(deadline: number | null, now: number): TimeLeft {
  if (deadline === null) return { kind: 'none' }
  const diff = deadline - now
  const kind = diff < 0 ? 'late' : 'left'
  const minutes = Math.floor(Math.abs(diff) / MS_PER_MINUTE)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const months = Math.floor(days / DAYS_PER_MONTH)

  const pair = (major: TimePart, minor: TimePart): TimeLeft =>
    minor.value > 0 ? { kind, parts: [major, minor] } : { kind, parts: [major] }

  if (months >= 1)
    return pair({ unit: 'bulan', value: months }, { unit: 'hari', value: days % DAYS_PER_MONTH })
  if (days >= 1) return pair({ unit: 'hari', value: days }, { unit: 'jam', value: hours % 24 })
  if (hours >= 1) return pair({ unit: 'jam', value: hours }, { unit: 'menit', value: minutes % 60 })
  return { kind, parts: [{ unit: 'menit', value: Math.max(minutes, 1) }] }
}

/** Jumlah hari kalender dari `now` ke `target` (lokal), minimal 0. */
export function daysUntil(target: number, now: number): number {
  const startOfDay = (ms: number): number => new Date(ms).setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((startOfDay(target) - startOfDay(now)) / MS_PER_DAY))
}

// ---- Tanggal ISO lokal (`YYYY-MM-DD`, cocok dengan <input type="date">) ----

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function fromIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

export function addDays(iso: string, days: number): string {
  const date = fromIsoDate(iso)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

export function addMonths(iso: string, months: number): string {
  const date = fromIsoDate(iso)
  date.setMonth(date.getMonth() + months)
  return toIsoDate(date)
}

/** Selisih hari kalender `to - from` (DST-safe lewat pembulatan). */
export function daysBetween(from: string, to: string): number {
  return Math.round((fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / 86_400_000)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && !Number.isNaN(fromIsoDate(value).getTime())
}
