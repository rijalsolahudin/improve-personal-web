import { daysInMonth, formatLocalDate, parseLocalDate } from '../domain/entities/primitives.ts'
import { WEEKDAY_INDEX, type Weekday } from '../domain/enums.ts'

/**
 * Aritmetika tanggal pada level KALENDER (tahun/bulan/hari), murni dan tanpa tz.
 *
 * Semuanya bekerja pada string `YYYY-MM-DD` dan angka biasa - tidak menyentuh `Date` maupun jam. Itu
 * penting untuk recurrence: "tiap tanggal 31" ditentukan oleh kalender, dan aturan "tanggal 29-31 di
 * bulan pendek dilewati" hanya bisa benar kalau jumlah hari per bulan diketahui persis.
 */

/** Pecah tanggal lokal `YYYY-MM-DD` (lihat `primitives.ts`); re-export supaya pemakai `recurrence/` cukup satu impor. */
export { parseLocalDate as parseLocalDateParts }

/** Nama hari JS (`Intl`/`Date` mengembalikan bahasa Inggris) -> `Weekday` kita (bahasa Indonesia). */
const WEEKDAY_BY_ENGLISH: Readonly<Record<string, Weekday>> = {
  monday: 'senin',
  tuesday: 'selasa',
  wednesday: 'rabu',
  thursday: 'kamis',
  friday: 'jumat',
  saturday: 'sabtu',
  sunday: 'minggu',
}

/** Index JS `Date.prototype.getUTCDay` (0 = Minggu) -> `Weekday` kita. */
const WEEKDAY_BY_JS_INDEX: readonly Weekday[] = [
  'minggu',
  'senin',
  'selasa',
  'rabu',
  'kamis',
  'jumat',
  'sabtu',
]

/** Ubah nama hari bahasa Inggris (dari `Intl`) jadi `Weekday`; `null` kalau tidak dikenali. */
export function weekdayFromEnglishName(name: string): Weekday | null {
  return WEEKDAY_BY_ENGLISH[name.trim().toLowerCase()] ?? null
}

/** Ubah index `getUTCDay` (0 = Minggu) jadi `Weekday`. */
export function weekdayFromJsIndex(index: number): Weekday {
  const normalized = ((index % 7) + 7) % 7
  const weekday = WEEKDAY_BY_JS_INDEX[normalized]
  // `normalized` selalu 0-6, jadi ini tidak pernah undefined; fallback dipasang demi type-safety.
  return weekday ?? 'minggu'
}

/** Index `getUTCDay` (0 = Minggu) untuk `Weekday`. */
export function jsIndexFromWeekday(weekday: Weekday): number {
  const index = WEEKDAY_BY_JS_INDEX.indexOf(weekday)
  return index === -1 ? 0 : index
}

/**
 * Nomor hari-dalam-pekan ala ISO (Senin = 1, Minggu = 7).
 *
 * Dipakai untuk aturan "minggu mulai Senin" (ARCHITECTURE.md §11) - mis. `by_nth_weekday` menghitung
 * minggu ke-N dari hari Senin, bukan dari Minggu.
 */
export function isoWeekdayNumber(weekday: Weekday): number {
  return WEEKDAY_INDEX[weekday]
}

/** Hari dalam pekan untuk tanggal lokal `YYYY-MM-DD` (murni aritmetika hari, tanpa tz). */
export function weekdayOfLocalDate(localDate: string): Weekday {
  const { year, month, day } = parseLocalDate(localDate)
  // `Date.UTC` di sini murni aritmetika kalender (bukan tz) - hasilnya deterministik di semua engine.
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekdayFromJsIndex(utcDay)
}

/**
 * Tambah bulan pada tanggal lokal, dengan aturan "tanggal tidak ada -> LEBIH BAIK DILEWATI".
 *
 * Fungsi ini mengembalikan `null` kalau tanggal tujuan tidak ada di bulan itu (`2025-01-31` + 1 bulan
 * -> `2025-02-31` tidak ada). Pemanggil yang memutuskan untuk melewatinya (perilaku Google Calendar,
 * PRD F1) - itu sebabnya fungsinya `addLocalMonthsClamped` vs `addLocalMonths` dipisah: yang pertama
 * menggeser ke hari terakhir bulan, yang kedua melaporkan ketidakadaan.
 */
export function tryAddLocalMonth(localDate: string, months: number): string | null {
  const { year, month, day } = parseLocalDate(localDate)
  const totalMonths = year * 12 + (month - 1) + months
  const nextYear = Math.floor(totalMonths / 12)
  const nextMonth = (totalMonths % 12) + 1

  if (day > daysInMonth(nextYear, nextMonth)) return null
  return formatLocalDate({ year: nextYear, month: nextMonth, day })
}

/** Tambah bulan dengan penggeseran ke hari terakhir bulan kalau tanggalnya tidak ada. */
export function addLocalMonthsClamped(localDate: string, months: number): string {
  const { year, month, day } = parseLocalDate(localDate)
  const totalMonths = year * 12 + (month - 1) + months
  const nextYear = Math.floor(totalMonths / 12)
  const nextMonth = (totalMonths % 12) + 1
  const maxDay = daysInMonth(nextYear, nextMonth)

  return formatLocalDate({ year: nextYear, month: nextMonth, day: Math.min(day, maxDay) })
}

/** Selisih bulan kalender antara dua tanggal lokal (bisa negatif). */
export function monthsBetweenLocal(earlier: string, later: string): number {
  const a = parseLocalDate(earlier)
  const b = parseLocalDate(later)
  return (b.year - a.year) * 12 + (b.month - a.month)
}

/**
 * Kejadian "minggu ke-N hari Y" dalam sebuah bulan.
 *
 * `weekOfMonth` 1-5, dengan 5 = minggu terakhir kalau bulan itu hanya punya 4 (dukungan yang sama
 * dengan Google Calendar: "hari ke-5" berarti "hari ke-5 kalau ada"). Mengembalikan tanggal lokal
 * `YYYY-MM-DD`, atau `null` kalau kombinasinya tidak ada di bulan itu.
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekOfMonth: number,
  weekday: Weekday,
): string | null {
  if (weekOfMonth < 1 || weekOfMonth > 5) return null

  const totalDays = daysInMonth(year, month)
  if (totalDays === 0) return null

  const firstDay = formatLocalDate({ year, month, day: 1 })
  const firstWeekday = isoWeekdayNumber(weekdayOfLocalDate(firstDay))
  const target = isoWeekdayNumber(weekday)

  // Berapa hari dari tanggal 1 ke hari yang dicari pertama kali (bisa 0 = tanggal 1 sudah hari itu).
  const firstMatchOffset = (target - firstWeekday + 7) % 7
  const day = 1 + firstMatchOffset + (weekOfMonth - 1) * 7

  if (day > totalDays) return null
  return formatLocalDate({ year, month, day })
}

/**
 * Jumlah minggu (ala ISO, mulai Senin) dalam sebuah bulan.
 *
 * Dipakai validasi "minggu ke-N tidak melampaui jumlah minggu bulan itu".
 */
export function weeksInMonth(year: number, month: number): number {
  const totalDays = daysInMonth(year, month)
  if (totalDays === 0) return 0

  const firstDow = isoWeekdayNumber(weekdayOfLocalDate(formatLocalDate({ year, month, day: 1 })))
  const lastDow = isoWeekdayNumber(
    weekdayOfLocalDate(formatLocalDate({ year, month, day: totalDays })),
  )

  // Minggu pertama dihitung sebagai minggu 1, lalu sisanya dibulatkan ke atas.
  const daysInFirstWeek = 8 - firstDow
  const remaining = totalDays - daysInFirstWeek
  if (remaining <= 0) return 1
  return 1 + Math.ceil(remaining / 7) - (lastDow === 0 ? 0 : 0)
}

/**
 * Bandingkan dua tanggal lokal (`YYYY-MM-DD`).
 *
 * String dengan panjang tetap dan nol terdepan aman dibandingkan langsung, tapi tetap ditulis sebagai
 * fungsi bernama supaya tidak ada `a < b` yang tersebar di kode seolah-olah membandingkan angka.
 */
export function compareLocalDate(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/** Clamp tanggal lokal ke rentang [min, max]. */
export function clampLocalDate(value: string, min: string, max: string): string {
  if (value < min) return min
  if (value > max) return max
  return value
}
