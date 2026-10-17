import { describe, expect, it } from 'vitest'

import {
  countdownTarget,
  dayBadge,
  describeCountdown,
  groupCountdowns,
  validateCountdownDraft,
  yearlyEdition,
  type Countdown,
} from './countdown'

const at = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number =>
  new Date(year, month - 1, day, hour, minute, second).getTime()

function countdown(overrides: Partial<Countdown> = {}): Countdown {
  return {
    id: 'c1',
    title: 'Momen',
    date: '2026-05-10',
    time: '',
    emoji: '🎉',
    sticker: null,
    color: '#F03FBF',
    yearly: false,
    archived: false,
    ...overrides,
  }
}

describe('countdownTarget', () => {
  it('sekali: tanggal + jam persis', () => {
    const target = countdownTarget(
      { date: '2026-05-10', time: '19:30', yearly: false },
      at(2026, 1, 1),
    )
    expect(new Date(target).getHours()).toBe(19)
    expect(new Date(target).getMinutes()).toBe(30)
  })

  it('tahunan: ambil tahun ini kalau belum lewat', () => {
    const target = countdownTarget({ date: '2000-05-10', time: '', yearly: true }, at(2026, 1, 1))
    expect(new Date(target).getFullYear()).toBe(2026)
  })

  it('tahunan: maju ke tahun depan kalau sudah lewat', () => {
    const target = countdownTarget({ date: '2000-05-10', time: '', yearly: true }, at(2026, 12, 31))
    expect(new Date(target).getFullYear()).toBe(2027)
  })
})

describe('describeCountdown', () => {
  it('dua unit terbesar: bulan + hari', () => {
    expect(describeCountdown(at(2026, 3, 11), at(2026, 1, 1))).toEqual({
      kind: 'left',
      parts: [
        { unit: 'bulan', value: 2 },
        { unit: 'hari', value: 10 },
      ],
    })
  })

  it('jam + menit', () => {
    expect(describeCountdown(at(2026, 1, 1, 3, 20), at(2026, 1, 1))).toEqual({
      kind: 'left',
      parts: [
        { unit: 'jam', value: 3 },
        { unit: 'menit', value: 20 },
      ],
    })
  })

  it('di bawah sejam: menit + detik selalu dua-duanya', () => {
    expect(describeCountdown(at(2026, 1, 1, 0, 12, 30), at(2026, 1, 1))).toEqual({
      kind: 'left',
      parts: [
        { unit: 'menit', value: 12 },
        { unit: 'detik', value: 30 },
      ],
    })
  })

  it('unit kedua dibuang kalau nol', () => {
    expect(describeCountdown(at(2026, 1, 2), at(2026, 1, 1))).toEqual({
      kind: 'left',
      parts: [{ unit: 'hari', value: 1 }],
    })
  })

  it('lewat beberapa hari', () => {
    expect(describeCountdown(at(2026, 1, 1), at(2026, 1, 4))).toEqual({
      kind: 'past',
      parts: [{ unit: 'hari', value: 3 }],
    })
  })

  it('baru saja lewat (< 1 jam)', () => {
    expect(describeCountdown(at(2026, 1, 1, 0, 0), at(2026, 1, 1, 0, 5))).toEqual({
      kind: 'justNow',
    })
  })
})

describe('groupCountdowns', () => {
  const now = at(2026, 1, 1)
  const items = [
    countdown({ id: 'far', date: '2026-06-01' }),
    countdown({ id: 'near', date: '2026-01-20' }),
    countdown({ id: 'past', date: '2025-12-01' }),
    countdown({ id: 'arch', date: '2025-11-01', archived: true }),
  ]

  it('upcoming terdekat dulu, past terbaru dulu, arsip terpisah', () => {
    const groups = groupCountdowns(items, now)
    expect(groups.upcoming.map((view) => view.countdown.id)).toEqual(['near', 'far'])
    expect(groups.past.map((view) => view.countdown.id)).toEqual(['past'])
    expect(groups.archived.map((view) => view.countdown.id)).toEqual(['arch'])
  })
})

describe('validateCountdownDraft', () => {
  const base = {
    title: 'Liburan',
    date: '2026-06-01',
    time: '',
    emoji: '✈️',
    sticker: null,
    color: '#F03FBF',
  }

  it('judul wajib', () => {
    expect(
      validateCountdownDraft({ ...base, title: '  ', yearly: false }, at(2026, 1, 1), false),
    ).toBe('titleRequired')
  })

  it('tanggal lampau ditolak untuk momen baru', () => {
    expect(
      validateCountdownDraft({ ...base, date: '2025-01-01', yearly: false }, at(2026, 1, 1), false),
    ).toBe('pastDate')
  })

  it('tanggal lampau oke kalau ulang tiap tahun', () => {
    expect(
      validateCountdownDraft({ ...base, date: '1990-01-01', yearly: true }, at(2026, 1, 1), false),
    ).toBeNull()
  })

  it('tanggal lampau oke saat edit', () => {
    expect(
      validateCountdownDraft({ ...base, date: '2025-01-01', yearly: false }, at(2026, 1, 1), true),
    ).toBeNull()
  })
})

describe('yearlyEdition', () => {
  it('hitung umur kejadian tahunan', () => {
    const target = countdownTarget({ date: '2000-05-10', time: '', yearly: true }, at(2026, 1, 1))
    expect(yearlyEdition({ date: '2000-05-10', yearly: true }, target)).toBe(26)
    expect(yearlyEdition({ date: '2000-05-10', yearly: false }, target)).toBe(0)
  })
})

describe('dayBadge', () => {
  const now = at(2026, 10, 17, 22)

  it('selisih hari kalender, bukan 24 jam: besok pagi tetap "besok"', () => {
    expect(dayBadge(at(2026, 10, 18, 6), now, false)).toEqual({ kind: 'tomorrow', days: 1 })
    expect(dayBadge(at(2026, 10, 29), now, false)).toEqual({ kind: 'ahead', days: 12 })
  })

  it('hari ini & yang sudah lewat', () => {
    expect(dayBadge(at(2026, 10, 17, 23), now, false)).toEqual({ kind: 'today' })
    expect(dayBadge(at(2026, 10, 14), now, false)).toEqual({ kind: 'ago', days: 3 })
  })
})
