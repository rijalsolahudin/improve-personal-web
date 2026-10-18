import {
  RECURRENCE_INTERVAL_MAX_HARIAN,
  RECURRENCE_INTERVAL_MAX_MINGGUAN,
  type ScheduleRecurrence,
} from '../domain/entities/schedule.ts'
import {
  addLocalDays,
  dayNumberToLocalDate,
  daysInMonth,
  formatLocalDate,
  localDateToDayNumber,
} from '../domain/entities/primitives.ts'
import { WEEKDAY_INDEX, type Weekday } from '../domain/enums.ts'
import {
  compareLocalDate,
  nthWeekdayOfMonth,
  parseLocalDateParts,
  tryAddLocalMonth,
  weekdayOfLocalDate,
} from './calendar.ts'
import {
  endOfLocalDay,
  fromLocalDateTime,
  localDateOf,
  localTimeOf,
  startOfLocalDay,
} from './timezone.ts'

/**
 * Engine recurrence - PRD F1 / task T3.
 *
 * Prinsip yang dipegang di file ini:
 *
 * 1. **Ekspansi hanya untuk rentang yang diminta.** Tidak ada generator tak berujung; `expandOccurrences`
 *    berhenti begitu melewati `rangeEndMs` (atau `maxCount` sebagai pengaman terakhir). Ini yang
 *    menjaga AC "ekspansi cuma di rentang yang diminta" dan performa kalender (AC T9).
 * 2. **Waktu di-inject, jam LOKAL yang jadi acuan pola.** Pola "tiap Senin 09:00" adalah 09:00 waktu
 *    perangkat, jadi jam+menit diambil dari `start_at` di tz jadwal, lalu kejadian disusun kembali di
 *    tz itu. Perubahan offset (DST) tidak menggeser jam lokalnya.
 * 3. **Tanggal 29-31 di bulan pendek DILEWATI, bukan digeser** (PRD F1 + Assumptions). Karena itu
 *    `tryAddLocalMonth` mengembalikan `null` dan kejadiannya cuma tidak dihasilkan.
 * 4. **Aturan `end_mode` dihitung pada pola, lalu dibatasi rentang.** Untuk `after_count`, hitungannya
 *    merujuk ke N kejadian PERTAMA dari `start_at` - bukan N kejadian dalam rentang yang diminta,
 *    karena artinya "berakhir setelah N kali" pada kalender user.
 */

/** Kejadian hasil ekspansi, sebelum/beserta exception & status. */
export type Occurrence = {
  /** Waktu occurrence "asal" (start murni dari pola, SEBELUM override exception). */
  readonly occurrenceAt: number
  /** Waktu mulai efektif (setelah `start_at_override`). */
  readonly startAt: number
  readonly endAt: number
  /** Tanggal lokal kejadian di tz jadwal - kunci untuk kalender & Daily. */
  readonly localDate: string
}

/** Rentang ekspansi yang diminta (epoch ms, inklusif). */
export type ExpansionRange = {
  readonly fromMs: number
  readonly toMs: number
}

/** Jadwal minimum yang dibutuhkan engine: identitas + waktu + tz. */
export type ExpansibleSchedule = {
  readonly id: string
  readonly startAt: number
  readonly durationMs: number
  readonly isAllDay: boolean
  readonly tz: string
}

/**
 * Pengaman terakhir supaya satu jadwal rusak (mis. `intervalN = 1` dengan rentang 50 tahun) tidak
 * bisa membekukan UI. Batas 10.000 kejadian lebih dari cukup: rentang terpanjang yang dipakai UI
 * adalah satu bulan (AC T9), dan bahkan view tahunan hanya ~365 kejadian per jadwal.
 */
export const MAX_OCCURRENCES_PER_EXPANSION = 10_000

/**
 * Hasilkan waktu occurrence "asal" untuk sebuah jadwal dalam rentang.
 *
 * Yang dikembalikan hanya pola murni - exception (`schedule_exception`) dan status
 * (`schedule_occurrence`) diterapkan lapisan berikutnya, supaya aturan pola bisa diuji sendiri dan
 * `this_and_following` bisa dibuktikan memotong pola dengan benar.
 *
 * Rentangnya inklusif di kedua ujung. Jadwal berdurasi dipilih berdasarkan IRISAN: kejadian yang
 * mulai sebelum `fromMs` tapi masih berjalan saat `fromMs` tetap dihasilkan (kalender bulanan butuh
 * ini supaya jadwal yang melintasi batas bulan tidak hilang).
 */
export function expandOccurrenceTimes(
  schedule: ExpansibleSchedule,
  recurrence: ScheduleRecurrence | null,
  range: ExpansionRange,
): readonly Occurrence[] {
  const durationMs = schedule.isAllDay ? 0 : schedule.durationMs
  const startTime = localTimeOf(schedule.startAt, schedule.tz)

  const rawTimes = expandRawStartTimes(schedule, recurrence, range, startTime, durationMs)

  const occurrences: Occurrence[] = []
  for (const occurrenceAt of rawTimes) {
    occurrences.push({
      occurrenceAt,
      startAt: occurrenceAt,
      endAt: occurrenceAt + durationMs,
      localDate: localDateOf(occurrenceAt, schedule.tz),
    })
  }
  return occurrences
}

/** Jam + menit lokal yang jadi acuan semua kejadian. */
type LocalStartTime = { readonly hour: number; readonly minute: number }

function expandRawStartTimes(
  schedule: ExpansibleSchedule,
  recurrence: ScheduleRecurrence | null,
  range: ExpansionRange,
  startTime: LocalStartTime,
  durationMs: number,
): readonly number[] {
  const seedLocalDate = localDateOf(schedule.startAt, schedule.tz)
  const seedStartMs = schedule.startAt

  // Jadwal sekali (atau tanpa recurrence sama sekali): satu kejadian saja.
  if (recurrence === null || recurrence.type === 'once') {
    if (!overlapsRange(seedStartMs, seedStartMs + durationMs, range)) return []
    return [seedStartMs]
  }

  const byDay = buildDayGenerator(recurrence, seedLocalDate)
  if (byDay === null) return []

  const results: number[] = []
  const producedLimit = countLimitOf(recurrence)
  let produced = 0

  // Batas atas pencarian dalam "nomor hari": dipakai supaya loop tetap terbatas walau belum ketemu
  // kejadian apa pun (mis. tanggal 31 hanya ada beberapa kali setahun).
  const rangeEndLocalDate = localDateOf(range.toMs, schedule.tz)
  const hardStopDay = localDateToDayNumber(rangeEndLocalDate) + 1

  for (const localDate of byDay) {
    const dayNumber = localDateToDayNumber(localDate)
    if (dayNumber > hardStopDay) break

    // `after_count` dihitung pada kejadian PERTAMA dari start_at, jadi kejadian setelah batas itu
    // tidak pernah dihasilkan - termasuk kalau dia ada di dalam rentang yang diminta.
    if (producedLimit !== null && produced >= producedLimit) break

    const occurrenceMs = buildInstant(localDate, startTime, schedule.tz)

    // Aturan `until_date`: batasnya inklusif sampai AKHIR hari lokal itu, jadi kejadian tepat di
    // tanggal berakhir tetap muncul (perilaku yang diharapkan user).
    if (recurrence.endMode === 'until_date' && recurrence.endDate !== null) {
      if (compareLocalDate(localDate, localDateOf(recurrence.endDate, schedule.tz)) > 0) break
    }

    produced += 1

    if (!overlapsRange(occurrenceMs, occurrenceMs + durationMs, range)) {
      // Boleh lewat kalau rentangnya sudah di belakang - tapi jangan break: pola mingguan bisa
      // menghasilkan hari yang urutannya tidak naik (mis. `by_weekdays` tidak diurut), dan
      // break di sini akan membuang kejadian yang sebenarnya masih di dalam rentang.
      continue
    }

    results.push(occurrenceMs)
    if (results.length >= MAX_OCCURRENCES_PER_EXPANSION) break
  }

  results.sort((a, b) => a - b)
  return results
}

/** Apakah kejadian [start, end] beririsan dengan rentang yang diminta. */
function overlapsRange(startMs: number, endMs: number, range: ExpansionRange): boolean {
  return endMs >= range.fromMs && startMs <= range.toMs
}

/** Batas jumlah kejadian dari `end_mode: after_count`; `null` kalau tidak dibatasi hitungan. */
function countLimitOf(recurrence: ScheduleRecurrence): number | null {
  if (recurrence.endMode !== 'after_count' || recurrence.occurrenceCount === null) return null
  return recurrence.occurrenceCount
}

/**
 * Pilih generator tanggal yang sesuai dengan tipe pola.
 *
 * `null` berarti tidak ada tanggal yang bisa dihasilkan (mis. `by_weekdays` kosong karena data rusak) -
 * pemanggil memperlakukannya sebagai "tidak ada kejadian", bukan error.
 */
function buildDayGenerator(
  recurrence: ScheduleRecurrence,
  seedLocalDate: string,
): Generator<string> | null {
  switch (recurrence.type) {
    case 'daily':
      return dailyGenerator(seedLocalDate, recurrence.intervalN)
    case 'weekly':
      return weeklyGenerator(seedLocalDate, recurrence.intervalN, recurrence.byWeekdays ?? [])
    case 'monthly':
      return monthlyGenerator(seedLocalDate, recurrence)
    default:
      // `once` sudah ditangani sebelum pemanggilan; tipe tak dikenal (data versi lain) -> tanpa kejadian.
      return null
  }
}

/**
 * Harian: tiap `intervalN` hari, mulai dari tanggal seed.
 *
 * Interval 1-6 (PRD F1). Nilai di luar batas dikoreksi ke rentang sah supaya data rusak menghasilkan
 * pola yang wajar, bukan loop tak berujung.
 */
function* dailyGenerator(seedLocalDate: string, intervalN: number): Generator<string> {
  const interval = clampInt(intervalN, 1, RECURRENCE_INTERVAL_MAX_HARIAN)
  const seedDay = localDateToDayNumber(seedLocalDate)

  for (let step = 0; ; step += 1) {
    yield dayNumberToLocalDate(seedDay + step * interval)
  }
}

/**
 * Mingguan: tiap `intervalN` minggu, pada hari-hari terpilih (Senin-Minggu).
 *
 * "Minggu" selalu mulai SENIN (ARCHITECTURE.md §11), jadi minggu pertama adalah minggu yang memuat
 * `seedLocalDate`, dan langkah `intervalN` dihitung dari Senin minggu itu. Tanpa anchor Senin, jadwal
 * "2 mingguan tiap Rabu & Senin" bisa menghasilkan urutan minggu yang berbeda tergantung hari mana
 * yang dipilih user - itu bug yang sulit terlihat.
 */
function* weeklyGenerator(
  seedLocalDate: string,
  intervalN: number,
  weekdays: readonly Weekday[],
): Generator<string> {
  const interval = clampInt(intervalN, 1, RECURRENCE_INTERVAL_MAX_MINGGUAN)
  const sortedDays = normalizeWeekdays(weekdays)

  if (sortedDays.length === 0) return

  const seedIsoDay = WEEKDAY_INDEX[weekdayOfLocalDate(seedLocalDate)]
  // Geser ke Senin minggu yang memuat seed.
  const seedWeekStartDay = localDateToDayNumber(seedLocalDate) - (seedIsoDay - 1)

  for (let week = 0; ; week += 1) {
    const weekStartDay = seedWeekStartDay + week * interval * 7
    for (const weekday of sortedDays) {
      const day = weekStartDay + (WEEKDAY_INDEX[weekday] - 1)
      const localDate = dayNumberToLocalDate(day)
      // Minggu pertama bisa berisi hari sebelum seed; itu tetap valid secara pola, tapi kita mulai
      // dari seed supaya jadwal tidak "muncul sebelum dibuat".
      if (compareLocalDate(localDate, seedLocalDate) < 0) continue
      yield localDate
    }
  }
}

/**
 * Bulanan, dua mode:
 *
 * - `by_day_of_month`: tiap bulan tanggal X. Kalau bulan itu tidak punya tanggal X (29-31 di bulan
 *   pendek) -> DILEWATI, bukan digeser ke tanggal 1.
 * - `by_nth_weekday`: "minggu ke-N hari Y". Minggu ke-5 yang tidak ada di bulan itu juga dilewati.
 *
 * `intervalN` untuk bulanan diperlakukan sebagai 1 (DBML mendefinisikan interval hanya untuk harian
 * & mingguan; PRD F1 tidak menyebut "tiap N bulan"), jadi nilainya tidak dipakai di sini.
 */
function* monthlyGenerator(
  seedLocalDate: string,
  recurrence: ScheduleRecurrence,
): Generator<string> {
  if (recurrence.monthMode === 'by_day_of_month') {
    const monthDay = recurrence.monthDay
    if (monthDay === null) return

    const seed = parseLocalDateParts(seedLocalDate)
    for (let step = 0; ; step += 1) {
      const totalMonths = seed.year * 12 + (seed.month - 1) + step
      const year = Math.floor(totalMonths / 12)
      const month = (totalMonths % 12) + 1

      // Bulan yang tidak punya tanggal itu -> DILEWATI, bukan digeser (PRD F1 + Assumptions).
      const candidate = resolveMonthDay(year, month, monthDay)
      if (candidate === null) continue
      if (compareLocalDate(candidate, seedLocalDate) < 0) continue
      yield candidate
    }
  }

  if (recurrence.monthMode === 'by_nth_weekday') {
    const weekOfMonth = recurrence.weekOfMonth
    const weekday = recurrence.monthWeekday
    if (weekOfMonth === null || weekday === null) return

    const seed = parseLocalDateParts(seedLocalDate)
    for (let step = 0; ; step += 1) {
      const totalMonths = seed.year * 12 + (seed.month - 1) + step
      const year = Math.floor(totalMonths / 12)
      const month = (totalMonths % 12) + 1

      const candidate = nthWeekdayOfMonth(year, month, weekOfMonth, weekday)
      if (candidate === null) continue
      if (compareLocalDate(candidate, seedLocalDate) < 0) continue
      yield candidate
    }
  }

  return
}

/**
 * Tanggal lokal untuk "tanggal X di bulan (year, month)".
 *
 * `null` kalau bulan itu tidak punya tanggal X - ini yang membuat `2025-01-31` + 1 bulan tidak jadi
 * `2025-02-31` dan tidak jadi `2025-03-03`, melainkan dianggap tidak ada.
 */
function resolveMonthDay(year: number, month: number, day: number): string | null {
  const maxDay = daysInMonth(year, month)
  if (day < 1 || day > maxDay) return null
  return formatLocalDate({ year, month, day })
}

/**
 * Susun instan dari tanggal lokal + jam lokal di tz jadwal.
 *
 * Lewat `fromLocalDateTime` (bukan `startOfLocalDay + jam*3600000`) supaya perubahan offset karena DST
 * tetap menghasilkan pukul 09:00 LOKAL - cara `+jam*3600000` akan membuat jam kejadian bergeser satu
 * jam setiap kali DST berubah.
 */
function buildInstant(localDate: string, time: LocalStartTime, tz: string): number {
  return fromLocalDateTime({ localDate, hour: time.hour, minute: time.minute, tz })
}

/** Urutkan + buang duplikat weekday; juga menolak hari di luar daftar. */
function normalizeWeekdays(weekdays: readonly Weekday[]): readonly Weekday[] {
  const unique = new Set<Weekday>()
  for (const weekday of weekdays) {
    if (WEEKDAY_INDEX[weekday] !== undefined) unique.add(weekday)
  }
  return [...unique].sort((a, b) => WEEKDAY_INDEX[a] - WEEKDAY_INDEX[b])
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/** Awal hari lokal pertama & terakhir dalam rentang - dipakai pemanggil untuk menyusun rentang query. */
export function expansionLocalDates(
  range: ExpansionRange,
  tz: string,
): {
  readonly fromLocalDate: string
  readonly toLocalDate: string
} {
  return {
    fromLocalDate: localDateOf(range.fromMs, tz),
    toLocalDate: localDateOf(range.toMs, tz),
  }
}

/** Rentang satu hari lokal penuh, dari tanggal lokal. */
export function dayRange(localDate: string, tz: string): ExpansionRange {
  return { fromMs: startOfLocalDay(localDate, tz), toMs: endOfLocalDay(localDate, tz) }
}

/**
 * Rentang `n` hari lokal berturut-turut mulai dari `startLocalDate` (view pekan/bulan, F6).
 */
export function daysRange(startLocalDate: string, days: number, tz: string): ExpansionRange {
  const safeDays = Math.max(1, Math.trunc(days))
  const endLocalDate = addLocalDays(startLocalDate, safeDays - 1)
  return { fromMs: startOfLocalDay(startLocalDate, tz), toMs: endOfLocalDay(endLocalDate, tz) }
}

/** Rentang satu bulan lokal (view bulan, F6). */
export function monthRange(anyDateInMonth: string, tz: string): ExpansionRange {
  const parts = parseLocalDateParts(anyDateInMonth)
  const first = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-01`
  const last = tryAddLocalMonth(first, 1)
  const endLocalDate = last === null ? first : addLocalDays(last, -1)
  return { fromMs: startOfLocalDay(first, tz), toMs: endOfLocalDay(endLocalDate, tz) }
}

/** Guard: rentang wajib urut naik, kalau tidak hasilnya kosong (bukan loop aneh). */
export function normalizeRange(range: ExpansionRange): ExpansionRange {
  if (range.toMs < range.fromMs) return { fromMs: range.toMs, toMs: range.fromMs }
  return range
}
