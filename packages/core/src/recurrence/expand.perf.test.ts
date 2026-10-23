import { describe, expect, it } from 'vitest'

import type { ScheduleRecurrence } from '../domain/entities/schedule.ts'
import type { Weekday } from '../domain/enums.ts'
import { daysRange, expandOccurrenceTimes, type ExpansibleSchedule } from './expand.ts'
import { fromLocalDateTime } from './timezone.ts'

/**
 * Benchmark regresi C1 (T9): ekspansi seri LAMA harus murah.
 *
 * Kasus acuan QA: 20 seri mingguan Senin-Jumat sejak 2020-01-06, grid bulan Sep/Okt/Nov 2025
 * (masing-masing 500 kejadian). Sebelum fast-forward, satu grid butuh 205-254 ms cold karena engine
 * berjalan dari tanggal seed; anggaran PRD F6 adalah < 100 ms.
 *
 * Metode (sama dengan benchmark QA di `calendar.perf.test.ts`):
 * 1. Satu pemanasan dibuang (JIT + cache `Intl.DateTimeFormat` di `timezone.ts`).
 * 2. Diukur 3 kali dengan objek jadwal BARU tiap run (cold cache milik pemanggil), diambil nilai
 *    TERBAIK supaya mesin uji yang sibuk tidak dianggap bug.
 * 3. Yang diukur adalah satu ekspansi untuk seluruh grid - persis yang dilakukan `schedule.ts`
 *    (`expansionWindow`) saat cache jadwal dingin. Cache per-hari di web tidak diuji di sini.
 *
 * Angka acuan mesin pengembangan (best-of-3, cold): Sep 2025 = 7,4 ms; Okt = 14,2 ms; Nov = 13,5 ms.
 */

const TZ = 'Asia/Jakarta'
const SERIES_COUNT = 20
const OCCURRENCES_IN_GRID = 500
const BUDGET_MS = 100

/**
 * Jam monotonik platform. `packages/core` sengaja tanpa tipe Node/DOM (`types: []`, lib ES2023), jadi
 * `performance` diakses lewat bentuk minimal ini; `Date.now()` hanya fallback kalau platform tak punya.
 */
const CLOCK: { now(): number } = (globalThis as { performance?: { now(): number } })
  .performance ?? {
  now: () => Date.now(),
}

const WEEKDAYS: readonly Weekday[] = ['senin', 'selasa', 'rabu', 'kamis', 'jumat']

/** Satu seri mingguan Senin-Jumat sejak Senin 2020-01-06, durasi 1 jam. */
function weeklySeries(index: number): {
  readonly schedule: ExpansibleSchedule
  readonly recurrence: ScheduleRecurrence
} {
  const id = `seri-${index}`
  return {
    schedule: {
      id,
      startAt: fromLocalDateTime({ localDate: '2020-01-06', hour: 9, minute: 0, tz: TZ }),
      durationMs: 3_600_000,
      isAllDay: false,
      tz: TZ,
    },
    recurrence: {
      id: `rec-${index}`,
      scheduleId: id,
      type: 'weekly',
      intervalN: 1,
      byWeekdays: [...WEEKDAYS],
      monthMode: null,
      monthDay: null,
      weekOfMonth: null,
      monthWeekday: null,
      endMode: 'never',
      endDate: null,
      occurrenceCount: null,
    },
  }
}

/** Ekspansi cold untuk satu grid 35 hari (objek jadwal baru tiap run). */
function expandGrid(startLocalDate: string): number {
  const range = daysRange(startLocalDate, 35, TZ)
  let count = 0
  for (let index = 0; index < SERIES_COUNT; index += 1) {
    const { schedule, recurrence } = weeklySeries(index)
    count += expandOccurrenceTimes(schedule, recurrence, range).length
  }
  return count
}

function bestOfThree(startLocalDate: string): { ms: number; count: number } {
  expandGrid(startLocalDate) // pemanasan, tidak dihitung
  let best = Number.POSITIVE_INFINITY
  let count = 0
  for (let run = 0; run < 3; run += 1) {
    const started = CLOCK.now()
    count = expandGrid(startLocalDate)
    best = Math.min(best, CLOCK.now() - started)
  }
  return { ms: best, count }
}

describe('expandOccurrenceTimes - performa seri lama (C1 T9)', () => {
  it.each([
    ['September 2025', '2025-09-01'],
    ['Oktober 2025', '2025-09-29'],
    ['November 2025', '2025-10-27'],
  ])(
    '20 seri sejak 2020, grid %s: < 100 ms cold',
    (label, startLocalDate) => {
      const { ms, count } = bestOfThree(startLocalDate)

      expect(count, `${label}: jumlah kejadian dalam grid`).toBe(OCCURRENCES_IN_GRID)
      expect(ms, `${label}: ekspansi 20 seri sejak 2020 = ${ms.toFixed(1)} ms`).toBeLessThan(
        BUDGET_MS,
      )
    },
    30_000,
  )
})
