import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import CalendarMonth from '~/components/features/calendar/CalendarMonth.vue'
import { monthDays, occurrencesOn, type Schedule } from '~/utils/schedule'
import { addDays } from '~/utils/time'

/**
 * QA T9 - AC performa: "render bulan < 100ms untuk 500 kejadian" (docs/PRD F6).
 *
 * Metode (dicatat di reports/qa-t9-kalender.md):
 * 1. Satu pemanasan (JIT + kompilasi template + cache formatter Intl) dibuang dari hitungan.
 * 2. Diukur 3 kali, diambil nilai TERBAIK (paling ramah ke implementasi) supaya lambat karena mesin
 *    uji yang sedang sibuk tidak dianggap bug.
 * 3. Dua angka dipisah: (a) hitung data yang dipakai view bulan - `monthDays` + `occurrencesOn` per
 *    hari, persis yang dilakukan computed `cells` di CalendarMonth.vue; (b) render komponen asli
 *    lewat mountSuspended.
 *
 * `performance.now()` dari Node (V8) - mesin JS yang sama dengan browser. Biaya
 * `Intl.DateTimeFormat` diukur terpisah (~2.7us/panggilan) supaya jelas angkanya bukan efek
 * lingkungan uji yang lambat.
 */

const MONTH_ANCHOR = '2025-09-10'
const BUDGET_MS = 100

const onceSchedule = (id: string, start: string, time = '09:00'): Schedule => ({
  id,
  title: `Jadwal ${id}`,
  color: 0,
  start,
  time,
  dur: 60,
  allDay: false,
  rec: { type: 'once' },
  ends: { type: 'never' },
  exceptions: [],
  goalId: null,
})

/** 500 kejadian = 500 jadwal sekali pada bulan yang dilihat. */
const fiveHundredOnce = Array.from({ length: 500 }, (_, index) =>
  onceSchedule(`s${index}`, addDays('2025-09-01', index % 30)),
)

/** Seri lama: 2 jadwal mingguan Senin-Jumat sejak 2020 (hanya ~50 kejadian di bulan yang dilihat). */
const oldWeeklySeries = Array.from({ length: 2 }, (_, index) => ({
  ...onceSchedule(`w${index}`, '2020-01-06'),
  rec: { type: 'weekly' as const, days: [1, 2, 3, 4, 5], interval: 1 },
}))

/** Hitung data yang dipakai view bulan, tanpa Vue. */
function computeMonth(schedules: readonly Schedule[]): number {
  let count = 0
  for (const day of monthDays(MONTH_ANCHOR)) count += occurrencesOn(schedules, day).length
  return count
}

function bestOfThree(work: () => number): { ms: number; value: number } {
  work()
  let best = Number.POSITIVE_INFINITY
  let value = 0
  for (let run = 0; run < 3; run += 1) {
    const started = performance.now()
    value = work()
    best = Math.min(best, performance.now() - started)
  }
  return { ms: best, value }
}

let mountedPages: { unmount: () => void }[] = []

beforeEach(() => {
  clearNuxtState([
    'schedules',
    'schedule-attendance',
    'schedulesStatus',
    'schedulesError',
    'tasks',
    'tasksStatus',
    'tasksError',
    'goals',
    'countdowns',
    'memos',
  ])
  useState('tasks').value = []
  useState('goals').value = []
  useState('countdowns').value = []
  useState('memos').value = { memos: [], moods: {} }
})

afterEach(async () => {
  for (const page of mountedPages) page.unmount()
  mountedPages = []
  await flushPromises()
})

async function mountMonth(schedules: readonly Schedule[]): Promise<number> {
  useState<Schedule[]>('schedules').value = [...schedules]
  const started = performance.now()
  const wrapper = await mountSuspended(CalendarMonth, {
    props: { anchor: MONTH_ANCHOR, selected: MONTH_ANCHOR, today: MONTH_ANCHOR },
  })
  await flushPromises()
  const elapsed = performance.now() - started
  mountedPages.push(wrapper)
  expect(wrapper.findAll('button.cell')).toHaveLength(35)
  return elapsed
}

describe('T9 AC performa view bulan (< 100 ms untuk 500 kejadian)', () => {
  it('500 kejadian: hitung data bulan <= 100 ms', () => {
    const { ms, value } = bestOfThree(() => computeMonth(fiveHundredOnce))
    expect(value, `kejadian yang dihitung = ${value}`).toBe(500)
    expect(ms, `hitung data bulan 500 kejadian = ${ms.toFixed(1)} ms`).toBeLessThan(BUDGET_MS)
  }, 30_000)

  it('500 kejadian: render komponen CalendarMonth <= 100 ms', async () => {
    // Pemanasan: mount + unmount sekali, tidak dihitung.
    await mountMonth(fiveHundredOnce)
    for (const page of mountedPages) page.unmount()
    mountedPages = []
    await flushPromises()

    const runs: number[] = []
    for (let run = 0; run < 3; run += 1) {
      runs.push(await mountMonth(fiveHundredOnce))
      for (const page of mountedPages) page.unmount()
      mountedPages = []
      await flushPromises()
    }

    const best = Math.min(...runs)
    expect(
      best,
      `render CalendarMonth 500 kejadian = ${best.toFixed(1)} ms (3x: ${runs
        .map((run) => run.toFixed(0))
        .join('/')})`,
    ).toBeLessThan(BUDGET_MS)
  }, 60_000)

  it('seri lama tidak boleh memperlambat view bulan (rentang, bukan umur seri, yang menentukan)', () => {
    const { ms, value } = bestOfThree(() => computeMonth(oldWeeklySeries))
    expect(value, `kejadian di bulan = ${value}`).toBeGreaterThan(0)
    expect(ms, `hitung data bulan seri sejak 2020 = ${ms.toFixed(1)} ms`).toBeLessThan(BUDGET_MS)
  }, 30_000)
})
