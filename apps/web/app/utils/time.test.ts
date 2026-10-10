import { describe, expect, it } from 'vitest'

import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  daysUntil,
  describeTimeLeft,
  formatClock,
  formatHourMinute,
  formatMinutesSeconds,
  greetingPeriod,
} from './time'

const NOW = new Date(2026, 9, 9, 10, 0, 0).getTime()

describe('greetingPeriod', () => {
  it.each([
    [0, 'pagi'],
    [10, 'pagi'],
    [11, 'siang'],
    [14, 'siang'],
    [15, 'sore'],
    [17, 'sore'],
    [18, 'malam'],
    [23, 'malam'],
  ] as const)('jam %i → %s', (hour, expected) => {
    expect(greetingPeriod(hour)).toBe(expected)
  })
})

describe('format jam', () => {
  it('formatClock menampilkan HH:MM:SS dan tidak pernah negatif', () => {
    expect(formatClock(14 * MS_PER_HOUR + 11 * MS_PER_MINUTE + 54_999)).toBe('14:11:54')
    expect(formatClock(-5000)).toBe('00:00:00')
  })

  it('formatMinutesSeconds membulatkan ke atas', () => {
    expect(formatMinutesSeconds(25 * MS_PER_MINUTE)).toBe('25:00')
    expect(formatMinutesSeconds(1)).toBe('00:01')
    expect(formatMinutesSeconds(0)).toBe('00:00')
  })

  it('formatHourMinute memakai titik dua', () => {
    expect(formatHourMinute(new Date(2026, 9, 9, 9, 5).getTime())).toBe('09:05')
  })
})

describe('describeTimeLeft', () => {
  it('tanpa deadline', () => {
    expect(describeTimeLeft(null, NOW)).toEqual({ kind: 'none' })
  })

  it('jam + menit untuk < 1 hari', () => {
    expect(describeTimeLeft(NOW + 3 * MS_PER_HOUR + 12 * MS_PER_MINUTE, NOW)).toEqual({
      kind: 'left',
      parts: [
        { unit: 'jam', value: 3 },
        { unit: 'menit', value: 12 },
      ],
    })
  })

  it('membuang unit kedua yang nol', () => {
    expect(describeTimeLeft(NOW + 2 * MS_PER_DAY, NOW)).toEqual({
      kind: 'left',
      parts: [{ unit: 'hari', value: 2 }],
    })
  })

  it('terlambat ditandai late', () => {
    expect(describeTimeLeft(NOW - 2 * MS_PER_HOUR, NOW)).toEqual({
      kind: 'late',
      parts: [{ unit: 'jam', value: 2 }],
    })
  })

  it('minimal 1 menit dan bulan untuk >= 30 hari', () => {
    expect(describeTimeLeft(NOW + 10_000, NOW)).toEqual({
      kind: 'left',
      parts: [{ unit: 'menit', value: 1 }],
    })
    expect(describeTimeLeft(NOW + 45 * MS_PER_DAY, NOW)).toMatchObject({
      parts: [
        { unit: 'bulan', value: 1 },
        { unit: 'hari', value: 15 },
      ],
    })
  })
})

describe('daysUntil', () => {
  it('menghitung hari kalender, bukan 24 jam', () => {
    const tomorrowMorning = new Date(2026, 9, 10, 1, 0).getTime()
    expect(daysUntil(tomorrowMorning, NOW)).toBe(1)
    expect(daysUntil(NOW - MS_PER_DAY, NOW)).toBe(0)
  })
})
