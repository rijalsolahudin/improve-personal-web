import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_MONTH,
  MS_PER_YEAR,
  splitDuration,
} from './duration.ts'
import type { Countdown } from '../domain/entities/habit.ts'
import { compareCountdownByTarget } from '../domain/entities/habit.ts'

/**
 * F5 "Unit Dinamis" - AC T8.
 *
 * Aturan PRD (unit terbesar relevan + satu di bawahnya):
 * - ≥ 1 tahun -> "1 tahun 3 bulan lagi"
 * - ≥ 1 bulan -> "2 bulan 10 hari lagi"
 * - ≥ 1 hari  -> "4 hari 6 jam lagi"
 * - ≥ 1 jam   -> "3 jam 20 menit lagi"
 * - < 1 jam   -> "12 menit 30 detik lagi"   (PRD Assumptions: "Countdown < 1 jam tampil menit + detik")
 * - Lewat     -> "Sudah lewat 3 hari" (merah) + opsi arsipkan
 *
 * Beda mendasar dengan `remainingTime` (F2): di sini DETIK dipakai untuk sisa < 1 jam, karena countdown
 * memang ditampilkan berdenyut dan sudah diminta eksplisit.
 */

export type CountdownUnitText = {
  readonly isPast: boolean
  /** Teks siap tampil, mis. "2 bulan 10 hari lagi" atau "Sudah lewat 3 hari". */
  readonly text: string
  readonly largestUnit: 'tahun' | 'bulan' | 'hari' | 'jam' | 'menit' | 'detik' | 'none'
  readonly absoluteMs: number
}

/**
 * Hitung teks unit dinamis untuk sebuah target terhadap `nowMs` yang di-inject.
 *
 * Murni: tidak menyentuh jam langsung, jadi daftar countdown bisa diuji tanpa menunggu.
 */
export function countdownUnits(targetAtMs: number, nowMs: number): CountdownUnitText {
  const delta = targetAtMs - nowMs
  const isPast = delta < 0
  const absoluteMs = Math.abs(delta)

  if (isPast) {
    return {
      isPast: true,
      text: `Sudah lewat ${largestTwoUnits(absoluteMs)}`,
      largestUnit: largestUnitOf(absoluteMs),
      absoluteMs,
    }
  }

  return {
    isPast: false,
    text: `${largestTwoUnits(absoluteMs)} lagi`,
    largestUnit: largestUnitOf(absoluteMs),
    absoluteMs,
  }
}

/**
 * Satuan terbesar + satu di bawahnya.
 *
 * Pengecualian yang diambil dari teks PRD:
 * - Bagian bernilai 0 dibuang ("2 bulan" kalau sisanya 0, bukan "2 bulan 0 hari").
 * - Untuk < 1 menit, yang ditampilkan cuma detik ("45 detik lagi") - menit-nya pasti 0 dan tidak
 *   informatif.
 */
function largestTwoUnits(absoluteMs: number): string {
  const parts = splitDuration(absoluteMs)

  if (absoluteMs < MS_PER_MINUTE) {
    return `${parts.seconds} detik`
  }

  if (absoluteMs < MS_PER_HOUR) {
    return joinUnits([
      [parts.minutes, 'menit'],
      [parts.seconds, 'detik'],
    ])
  }

  if (absoluteMs < MS_PER_DAY) {
    return joinUnits([
      [parts.hours, 'jam'],
      [parts.minutes, 'menit'],
    ])
  }

  if (absoluteMs < MS_PER_MONTH) {
    return joinUnits([
      [parts.days, 'hari'],
      [parts.hours, 'jam'],
    ])
  }

  if (absoluteMs < MS_PER_YEAR) {
    return joinUnits([
      [parts.months, 'bulan'],
      [parts.days, 'hari'],
    ])
  }

  return joinUnits([
    [parts.years, 'tahun'],
    [parts.months, 'bulan'],
  ])
}

function joinUnits(pairs: readonly (readonly [number, string])[]): string {
  const segments: string[] = []
  for (const [value, unit] of pairs) {
    if (value > 0) segments.push(`${value} ${unit}`)
  }
  if (segments.length > 0) return segments.join(' ')

  const first = pairs[0]
  return first === undefined ? '' : `${first[0]} ${first[1]}`
}

function largestUnitOf(absoluteMs: number): CountdownUnitText['largestUnit'] {
  if (absoluteMs < MS_PER_MINUTE) return 'detik'
  if (absoluteMs < MS_PER_HOUR) return 'menit'
  if (absoluteMs < MS_PER_DAY) return 'jam'
  if (absoluteMs < MS_PER_MONTH) return 'hari'
  if (absoluteMs < MS_PER_YEAR) return 'bulan'
  return 'tahun'
}

/** Satu baris countdown siap render: entitas + teks unitnya. */
export type CountdownRow = {
  readonly countdown: Countdown
  readonly units: CountdownUnitText
}

/**
 * F5 "Sort": default dari yang paling dekat.
 *
 * Yang DIARSIPKAN tidak ikut hitungan terdekat (catatan DBML `idx_countdown_sort`), jadi mereka
 * dibuang di sini - itulah yang membedakan "diarsipkan" dari "tetap terlihat".
 *
 * Dipakai halaman Countdown DAN widget Overview "countdown terdekat (3 teratas)" - satu fungsi, jadi
 * urutannya tidak bisa berbeda antar halaman. `compareCountdownByTarget` dipakai (bukan diurut ulang
 * di sini) supaya tie-break-nya cuma didefinisikan sekali.
 */
export function sortedCountdownRows(
  countdowns: readonly Countdown[],
  nowMs: number,
): readonly CountdownRow[] {
  return countdowns
    .filter((countdown) => !countdown.isArchived)
    .slice()
    .sort(compareCountdownByTarget)
    .map((countdown) => ({ countdown, units: countdownUnits(countdown.targetAt, nowMs) }))
}

/** Widget Overview F11: `limit` countdown terdekat. */
export function topCountdowns(
  countdowns: readonly Countdown[],
  nowMs: number,
  limit: number,
): readonly CountdownRow[] {
  if (limit <= 0) return []
  return sortedCountdownRows(countdowns, nowMs).slice(0, limit)
}
