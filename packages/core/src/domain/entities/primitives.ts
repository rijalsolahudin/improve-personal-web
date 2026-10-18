import { z } from 'zod'

/**
 * Primitif domain bersama: waktu, tz, id, dan tanggal lokal.
 *
 * Semua waktu di DB lokal = epoch ms UTC (ARCHITECTURE.md §11), `tz` disimpan terpisah untuk jadwal
 * berulang, dan tanggal kalender disimpan sebagai string `YYYY-MM-DD` lokal (dipakai jurnal, habit,
 * goal) - bukan epoch, supaya "hari ini" tidak bergeser saat tz berubah.
 */

/** Epoch ms UTC. Wajib integer non-negatif dan muat bilangan aman JS. */
export const epochMsSchema = z.int().min(0).max(Number.MAX_SAFE_INTEGER)

/** UUID kanonik (lowercase + tanda hubung) - sama bentuknya dengan `uuidSchema` di `packages/contracts`. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * UUIDv7 sebagai id record.
 *
 * Versi 7 dipakai karena urut waktu - itu yang bikin `id` bisa jadi tie-breaker yang stabil dan
 * membuat index lokal lebih ramah cache (ARCHITECTURE.md §6). Versi lain DITOLAK untuk record baru;
 * data yang sudah ada dengan versi lain tetap bisa dibaca (lihat `uuidAnySchema`).
 */
export const uuidV7Schema = z
  .string()
  .toLowerCase()
  .regex(UUID_PATTERN, 'bukan UUID kanonik')
  .refine((value) => value[14] === '7', 'id record harus UUIDv7 (urut waktu)')

/** UUID versi apa pun - untuk membaca data lama/import yang dibuat sebelum aturan v7 ditegakkan. */
export const uuidAnySchema = z.string().toLowerCase().regex(UUID_PATTERN, 'bukan UUID kanonik')

/**
 * Tanggal lokal `YYYY-MM-DD`.
 *
 * Divalidasi lebih dari sekadar regex: `2025-02-30` dan `2025-13-01` ditolak, karena tanggal seperti
 * itu tidak pernah dihasilkan oleh kode kita - artinya data rusak, dan lebih baik ketahuan saat import
 * daripada menghasilkan streak/heatmap yang salah diam-diam.
 *
 * Pengecekannya murni aritmetika (tanpa `Date`) supaya tetap deterministik dan tidak bergantung tz.
 */
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

/** Aturan murni: tahun kabisat (kalender Gregorian proleptik, sama dengan `Date`). */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Aturan murni: jumlah hari dalam bulan `month` (1-12) pada `year`. */
export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0
  const base = DAYS_IN_MONTH[month - 1] ?? 0
  return month === 2 && isLeapYear(year) ? 29 : base
}

export function isLocalDate(value: string): boolean {
  if (!LOCAL_DATE_PATTERN.test(value)) return false

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))

  if (month < 1 || month > 12) return false
  if (day < 1 || day > daysInMonth(year, month)) return false
  return true
}

export const localDateSchema = z
  .string()
  .refine(isLocalDate, 'bukan tanggal lokal YYYY-MM-DD yang sah')

/** Bagian tanggal lokal yang sudah tervalidasi. */
export type LocalDateParts = {
  readonly year: number
  readonly month: number
  readonly day: number
}

/** Pecah tanggal lokal `YYYY-MM-DD` yang sudah valid. Aman karena schema sudah menyaring bentuknya. */
export function parseLocalDate(value: string): LocalDateParts {
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  }
}

/** Susun kembali tanggal lokal dari bagiannya (tanpa `Date`, jadi tidak bisa tergeser tz). */
export function formatLocalDate(parts: LocalDateParts): string {
  const year = String(parts.year).padStart(4, '0')
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Nomor hari lokal sejak epoch (proleptic Gregorian), menghitung hari murni tanpa `Date`.
 *
 * Dipakai streak (F7) dan agregasi rentang: "hari ke-N" yang hanya bergantung angka tanggal, bukan
 * tz atau DST. Selisih dua nilai ini = jumlah hari, aman dari pergeseran jam.
 */
export function localDateToDayNumber(value: string): number {
  const { year, month, day } = parseLocalDate(value)

  // Algoritma hari-dari-epoch (Howard Hinnant): murni aritmetika jumlah hari, tanpa kalender OS.
  const shiftedYear = year - (month <= 2 ? 1 : 0)
  const era = Math.floor(shiftedYear / 400)
  const yearOfEra = shiftedYear - era * 400
  const monthShift = month + (month > 2 ? -3 : 9)
  const dayOfYear = Math.floor((153 * monthShift + 2) / 5) + day - 1
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear

  return era * 146_097 + dayOfEra
}

/** Kebalikan `localDateToDayNumber`: nomor hari -> `YYYY-MM-DD`. */
export function dayNumberToLocalDate(dayNumber: number): string {
  const era = Math.floor(dayNumber / 146_097)
  const dayOfEra = dayNumber - era * 146_097
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1_460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  )
  const year = yearOfEra + era * 400
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1
  const month = monthPrime + (monthPrime < 10 ? 3 : -9)

  return formatLocalDate({ year: year + (month <= 2 ? 1 : 0), month, day })
}

/** Geser tanggal lokal sebanyak `days` (boleh negatif) - dipakai streak dan rentang laporan. */
export function addLocalDays(value: string, days: number): string {
  return dayNumberToLocalDate(localDateToDayNumber(value) + days)
}

/** Selisih hari `later - earlier`. Positif berarti `later` lebih baru. */
export function diffLocalDays(earlier: string, later: string): number {
  return localDateToDayNumber(later) - localDateToDayNumber(earlier)
}

/**
 * Nama tz IANA.
 *
 * `Intl` divalidasi saat runtime oleh pemanggil yang memang butuh (mis. `Intl.DateTimeFormat`), tapi
 * di sini cukup bentuknya: rangkaian segmen `Area/Lokasi` tanpa spasi/karakter kontrol. Batas panjang
 * dipasang supaya string raksasa dari data rusak tidak lolos.
 */
const TZ_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/

export const tzSchema = z.string().min(1).max(64).regex(TZ_PATTERN, 'bukan nama zona waktu IANA')

/** `0`-`100` untuk persentase; dipakai progress goal (F13) dan decoration. */
export const percentSchema = z.number().min(0).max(100)

/** Boolean yang sama-sama menerima bentuk `0`/`1` dari SQLite. */
export const boolLikeSchema = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform((value) => {
    if (typeof value === 'boolean') return value
    return value === 1
  })
