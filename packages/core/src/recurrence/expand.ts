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
 * 5. **Iterasi di-fast-forward ke dekat rentang, tidak berjalan dari seed.** Biaya ekspansi harus
 *    mengikuti LEBAR rentang, bukan UMUR seri: seri mingguan sejak 2020 yang dibuka di bulan ini tidak
 *    boleh membangun ribuan kejadian yang sudah lewat. Index langkah dihitung dengan aritmetika pola,
 *    dan jumlah kejadian sebelum titik mulai dihitung tanpa `Intl` supaya `after_count` tetap benar.
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

  const byDay = buildDayPlan(recurrence, seedLocalDate)
  if (byDay === null) return []

  const rangeEndLocalDate = localDateOf(range.toMs, schedule.tz)
  const hardStopDay = localDateToDayNumber(rangeEndLocalDate) + 1
  const seedDay = localDateToDayNumber(seedLocalDate)

  // Rentang berakhir sebelum pola mulai: tidak ada kejadian yang mungkin beririsan.
  if (hardStopDay < seedDay) return []

  // Batas bawah pencarian. Kejadian yang mulai sebelum `fromMs` hanya bisa beririsan kalau
  // `start + duration >= fromMs`, dan tanggal lokal monoton terhadap instan - jadi tanggal ini
  // tidak akan melewatkan kejadian apa pun, tapi memotong seluruh riwayat seri yang sudah lewat.
  const earliestStartLocalDate = localDateOf(range.fromMs - durationMs, schedule.tz)
  const searchFromLocalDate =
    compareLocalDate(earliestStartLocalDate, seedLocalDate) < 0
      ? seedLocalDate
      : earliestStartLocalDate

  // Aturan `until_date`: batasnya inklusif sampai AKHIR hari lokal itu, jadi kejadian tepat di
  // tanggal berakhir tetap muncul (perilaku yang diharapkan user).
  const untilLocalDate =
    recurrence.endMode === 'until_date' && recurrence.endDate !== null
      ? localDateOf(recurrence.endDate, schedule.tz)
      : null
  if (untilLocalDate !== null && compareLocalDate(searchFromLocalDate, untilLocalDate) > 0)
    return []

  const producedLimit = countLimitOf(recurrence)
  const cursor = byDay.seek(searchFromLocalDate)

  // Semua jatah `after_count` sudah habis sebelum rentang - pola tidak menghasilkan apa pun lagi.
  if (producedLimit !== null && cursor.producedBefore >= producedLimit) return []

  const results: number[] = []
  let produced = cursor.producedBefore

  for (const localDate of byDay.daysFrom(cursor.startIndex)) {
    const dayNumber = localDateToDayNumber(localDate)
    if (dayNumber > hardStopDay) break

    // `after_count` dihitung pada kejadian PERTAMA dari start_at, jadi kejadian setelah batas itu
    // tidak pernah dihasilkan - termasuk kalau dia ada di dalam rentang yang diminta.
    if (producedLimit !== null && produced >= producedLimit) break

    if (untilLocalDate !== null && compareLocalDate(localDate, untilLocalDate) > 0) break

    const occurrenceMs = buildInstant(localDate, startTime, schedule.tz)
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

/** Titik mulai iterasi pola setelah di-fast-forward, plus jumlah kejadian sebelumnya. */
type DayCursor = {
  /** Index langkah pola tempat generator mulai (0 = langkah seed). */
  readonly startIndex: number
  /** Jumlah kejadian pola pada index < `startIndex` - dipakai `after_count`. */
  readonly producedBefore: number
}

/**
 * Rencana iterasi satu tipe pola yang bisa melompat langsung ke dekat rentang.
 *
 * `seek` menerjemahkan tanggal lokal target jadi index langkah + jumlah kejadian sebelumnya, dan
 * `daysFrom` menghasilkan tanggal mulai index itu. Pemisahan ini yang membuat biaya ekspansi mengikuti
 * lebar rentang: untuk seri sejak 2020, `seek` melompat langsung ke minggu/bulan yang diminta alih-alih
 * menghasilkan ribuan tanggal lama yang tidak pernah dipakai.
 */
type DayPlan = {
  readonly seek: (startLocalDate: string) => DayCursor
  readonly daysFrom: (startIndex: number) => Generator<string>
}

/**
 * Pilih rencana iterasi yang sesuai dengan tipe pola.
 *
 * `null` berarti tidak ada tanggal yang bisa dihasilkan (mis. `by_weekdays` kosong karena data rusak) -
 * pemanggil memperlakukannya sebagai "tidak ada kejadian", bukan error.
 */
function buildDayPlan(recurrence: ScheduleRecurrence, seedLocalDate: string): DayPlan | null {
  switch (recurrence.type) {
    case 'daily':
      return dailyPlan(seedLocalDate, recurrence.intervalN)
    case 'weekly':
      return weeklyPlan(seedLocalDate, recurrence.intervalN, recurrence.byWeekdays ?? [])
    case 'monthly':
      return monthlyPlan(seedLocalDate, recurrence)
    default:
      // `once` sudah ditangani sebelum pemanggilan; tipe tak dikenal (data versi lain) -> tanpa kejadian.
      return null
  }
}

/**
 * Harian: tiap `intervalN` hari, mulai dari tanggal seed.
 *
 * Index langkah dihitung dengan pembagian, jadi seri harian sejak bertahun-tahun lalu tidak perlu
 * diiterasi satu per satu. Interval 1-6 (PRD F1); nilai di luar batas dikoreksi ke rentang sah supaya
 * data rusak menghasilkan pola yang wajar, bukan loop tak berujung.
 */
function dailyPlan(seedLocalDate: string, intervalN: number): DayPlan {
  const interval = clampInt(intervalN, 1, RECURRENCE_INTERVAL_MAX_HARIAN)
  const seedDay = localDateToDayNumber(seedLocalDate)

  return {
    seek(startLocalDate) {
      const offset = localDateToDayNumber(startLocalDate) - seedDay
      // `floor` (bukan `ceil`) supaya kejadian tepat di batas tidak terlewat; kandidat sebelum batas
      // di minggu/step itu tetap diproses loop dan tersaring oleh `overlapsRange`.
      const startIndex = offset <= 0 ? 0 : Math.floor(offset / interval)
      return { startIndex, producedBefore: startIndex }
    },
    *daysFrom(startIndex) {
      for (let step = startIndex; ; step += 1) {
        yield dayNumberToLocalDate(seedDay + step * interval)
      }
    },
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
function weeklyPlan(
  seedLocalDate: string,
  intervalN: number,
  weekdays: readonly Weekday[],
): DayPlan | null {
  const interval = clampInt(intervalN, 1, RECURRENCE_INTERVAL_MAX_MINGGUAN)
  const sortedDays = normalizeWeekdays(weekdays)

  if (sortedDays.length === 0) return null

  const seedDay = localDateToDayNumber(seedLocalDate)
  const seedIsoDay = WEEKDAY_INDEX[weekdayOfLocalDate(seedLocalDate)]
  // Geser ke Senin minggu yang memuat seed.
  const seedWeekStartDay = seedDay - (seedIsoDay - 1)
  const stride = interval * 7

  // Minggu pertama bisa sebagian sebelum seed (hari itu tidak pernah dihasilkan), sedangkan minggu
  // berikutnya selalu penuh. Dua angka ini cukup untuk menghitung jumlah kejadian sebelum index
  // mana pun tanpa menelusuri minggu satu per satu.
  const firstWeekCount = sortedDays.filter(
    (weekday) => seedWeekStartDay + (WEEKDAY_INDEX[weekday] - 1) >= seedDay,
  ).length
  const weekSize = sortedDays.length

  return {
    seek(startLocalDate) {
      const offset = localDateToDayNumber(startLocalDate) - seedWeekStartDay
      const startIndex = offset <= 0 ? 0 : Math.floor(offset / stride)
      const producedBefore = startIndex === 0 ? 0 : firstWeekCount + (startIndex - 1) * weekSize
      return { startIndex, producedBefore }
    },
    *daysFrom(startIndex) {
      for (let week = startIndex; ; week += 1) {
        const weekStartDay = seedWeekStartDay + week * stride
        for (const weekday of sortedDays) {
          const day = weekStartDay + (WEEKDAY_INDEX[weekday] - 1)
          const localDate = dayNumberToLocalDate(day)
          // Minggu pertama bisa berisi hari sebelum seed; itu tetap valid secara pola, tapi kita mulai
          // dari seed supaya jadwal tidak "muncul sebelum dibuat".
          if (compareLocalDate(localDate, seedLocalDate) < 0) continue
          yield localDate
        }
      }
    },
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
function monthlyPlan(seedLocalDate: string, recurrence: ScheduleRecurrence): DayPlan | null {
  if (recurrence.monthMode === 'by_day_of_month') {
    const monthDay = recurrence.monthDay
    if (monthDay === null) return null
    return monthPlan(seedLocalDate, (year, month) => resolveMonthDay(year, month, monthDay))
  }

  if (recurrence.monthMode === 'by_nth_weekday') {
    const weekOfMonth = recurrence.weekOfMonth
    const weekday = recurrence.monthWeekday
    if (weekOfMonth === null || weekday === null) return null
    return monthPlan(seedLocalDate, (year, month) =>
      nthWeekdayOfMonth(year, month, weekOfMonth, weekday),
    )
  }

  return null
}

/**
 * Rencana iterasi untuk pola "satu kandidat per bulan".
 *
 * Jumlah kejadian sebelum index dihitung dengan menelusuri BULAN, bukan kejadian: seri 6 tahun = 72
 * iterasi aritmetika tanggal tanpa `Intl`, jadi tetap murah bahkan untuk seri yang jauh lebih tua.
 * Ini yang membuat `after_count` tetap benar tanpa mengiterasi seluruh kejadian dari seed.
 */
function monthPlan(
  seedLocalDate: string,
  candidateOfMonth: (year: number, month: number) => string | null,
): DayPlan {
  const seed = parseLocalDateParts(seedLocalDate)
  const seedMonthIndex = seed.year * 12 + (seed.month - 1)

  const candidateAt = (step: number): string | null => {
    const totalMonths = seedMonthIndex + step
    return candidateOfMonth(Math.floor(totalMonths / 12), (totalMonths % 12) + 1)
  }

  const countBefore = (stepCount: number): number => {
    let count = 0
    for (let step = 0; step < stepCount; step += 1) {
      const candidate = candidateAt(step)
      // Bulan seed bisa punya tanggal sebelum tanggal seed (mis. pola tanggal 5 dibuat tanggal 20);
      // kandidat itu bukan kejadian pertama, jadi tidak dihitung.
      if (candidate !== null && compareLocalDate(candidate, seedLocalDate) >= 0) count += 1
    }
    return count
  }

  return {
    seek(startLocalDate) {
      const start = parseLocalDateParts(startLocalDate)
      const startMonthIndex = start.year * 12 + (start.month - 1)
      const startIndex = Math.max(0, startMonthIndex - seedMonthIndex)
      return { startIndex, producedBefore: countBefore(startIndex) }
    },
    *daysFrom(startIndex) {
      for (let step = startIndex; ; step += 1) {
        const candidate = candidateAt(step)
        // Bulan yang tidak punya tanggal itu -> DILEWATI, bukan digeser (PRD F1 + Assumptions).
        if (candidate === null) continue
        if (compareLocalDate(candidate, seedLocalDate) < 0) continue
        yield candidate
      }
    },
  }
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
