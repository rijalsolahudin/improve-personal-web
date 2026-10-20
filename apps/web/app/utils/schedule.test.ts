import { fromLocalDateTime, toLocalDateTime } from '@improve-personal/core'
import { describe, expect, it } from 'vitest'

import {
  createSchedule,
  deleteSchedules,
  draftDuration,
  draftFromSchedule,
  editSchedules,
  endsFromDraft,
  layoutLanes,
  monthDays,
  newScheduleDraft,
  nextOccurrence,
  occurrenceStartMs,
  occurrencesBetween,
  occurrencesOn,
  occursOn,
  recurrenceFromDraft,
  shiftAnchor,
  validateScheduleDraft,
  weekDays,
  type Recurrence,
  type Schedule,
} from './schedule'

// 2026-10-05 = Senin. Zona waktu tetap supaya hasilnya deterministik di mesin mana pun.
const MON = '2026-10-05'
const YEAR_END = '2027-10-04'
const TZ = 'Asia/Jakarta'

const schedule = (rec: Recurrence, overrides: Partial<Schedule> = {}): Schedule => ({
  id: 's1',
  title: 'Kelas',
  color: 0,
  start: MON,
  time: '19:00',
  dur: 90,
  allDay: false,
  rec,
  ends: { type: 'never' },
  exceptions: [],
  goalId: null,
  ...overrides,
})

const days = (item: Schedule, from: string, to: string): string[] =>
  occurrencesBetween([item], from, to, TZ).map((occurrence) => occurrence.day)

describe('occursOn', () => {
  it('sekali & sebelum mulai', () => {
    const once = schedule({ type: 'once' })
    expect(occursOn(once, MON, TZ)).toBe(true)
    expect(occursOn(once, '2026-10-06', TZ)).toBe(false)
    expect(occursOn(once, '2026-10-04', TZ)).toBe(false)
  })

  it('harian tiap n hari', () => {
    const daily = schedule({ type: 'daily', n: 3 })
    expect(occursOn(daily, '2026-10-08', TZ)).toBe(true)
    expect(occursOn(daily, '2026-10-07', TZ)).toBe(false)
  })

  it('mingguan per hari + selang 2 minggu', () => {
    const weekly = schedule({ type: 'weekly', days: [2, 4], interval: 2 })
    expect(occursOn(weekly, '2026-10-07', TZ)).toBe(false) // Rabu, bukan hari terpilih
    expect(occursOn(weekly, '2026-10-08', TZ)).toBe(true) // Kamis
    expect(occursOn(weekly, '2026-10-13', TZ)).toBe(false) // minggu berikutnya dilewati
    expect(occursOn(weekly, '2026-10-20', TZ)).toBe(true) // minggu aktif berikutnya
  })

  it('bulanan di tanggal yang sama; bulan tanpa tanggal itu dilewati', () => {
    const monthly = schedule({ type: 'monthly' }, { start: '2026-01-31' })
    expect(occursOn(monthly, '2026-03-31', TZ)).toBe(true)
    expect(occursOn(monthly, '2026-02-28', TZ)).toBe(false)
  })

  it('pengecualian & batas akhir', () => {
    const daily = schedule(
      { type: 'daily', n: 1 },
      { exceptions: ['2026-10-06'], ends: { type: 'until', date: '2026-10-08' } },
    )
    expect(occursOn(daily, '2026-10-06', TZ)).toBe(false)
    expect(occursOn(daily, '2026-10-08', TZ)).toBe(true)
    expect(occursOn(daily, '2026-10-09', TZ)).toBe(false)
  })
})

describe('ekspansi kejadian (engine core)', () => {
  it.each([1, 2, 3, 4, 5, 6])('harian tiap %i hari selama setahun', (n) => {
    const result = days(schedule({ type: 'daily', n }), MON, YEAR_END)
    expect(result).toHaveLength(Math.ceil(365 / n))
    expect(result[0]).toBe(MON)
    const interval = n * 24 * 60 * 60 * 1000
    const startOf = (day: string): number =>
      fromLocalDateTime({ localDate: day, hour: 0, minute: 0, tz: TZ })
    result.slice(1).forEach((day, index) => {
      const previous = result[index]
      if (previous === undefined) throw new Error('hasil kosong')
      expect(startOf(day)).toBe(startOf(previous) + interval)
    })
  })

  it('rentang di tengah seri tetap sejajar dengan tanggal mulai', () => {
    expect(days(schedule({ type: 'daily', n: 3 }), '2026-11-01', '2026-11-10')).toEqual([
      '2026-11-01',
      '2026-11-04',
      '2026-11-07',
      '2026-11-10',
    ])
  })

  it('multi-hari tiap minggu: Senin & Kamis', () => {
    expect(
      days(schedule({ type: 'weekly', days: [1, 4], interval: 1 }), MON, '2026-10-18'),
    ).toEqual(['2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15'])
  })

  it('tiap 2 minggu dihitung dari minggu mulai, bukan dari awal rentang', () => {
    const biweekly = schedule({ type: 'weekly', days: [1, 4], interval: 2 })
    expect(days(biweekly, '2026-10-12', '2026-11-01')).toEqual(['2026-10-19', '2026-10-22'])
    // 26 pasang Senin+Kamis (minggu 0..50) + Senin minggu ke-52.
    expect(days(biweekly, MON, YEAR_END)).toHaveLength(53)
  })

  it('hari sebelum tanggal mulai di minggu pertama tidak ikut', () => {
    const tueThu = schedule({ type: 'weekly', days: [1, 4], interval: 1 }, { start: '2026-10-07' })
    expect(days(tueThu, '2026-10-05', '2026-10-11')).toEqual(['2026-10-08'])
  })

  it('Minggu dihitung di akhir minggu (minggu mulai Senin)', () => {
    const sunday = schedule({ type: 'weekly', days: [0], interval: 1 })
    expect(days(sunday, MON, '2026-10-12')).toEqual(['2026-10-11'])
  })

  it('tanpa hari tidak menghasilkan kejadian', () => {
    expect(days(schedule({ type: 'weekly', days: [], interval: 1 }), MON, YEAR_END)).toEqual([])
  })

  it('tanggal 31 di bulan pendek dilewati', () => {
    const monthly = schedule({ type: 'monthly' }, { start: '2026-01-31' })
    expect(days(monthly, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
      '2026-07-31',
      '2026-08-31',
      '2026-10-31',
      '2026-12-31',
    ])
  })

  it('tgl 29 dilewati di Februari non-kabisat, ada di kabisat', () => {
    const monthly = schedule({ type: 'monthly' }, { start: '2027-12-29' })
    expect(days(monthly, '2028-01-01', '2028-03-31')).toEqual([
      '2028-01-29',
      '2028-02-29',
      '2028-03-29',
    ])
    expect(days(monthly, '2029-02-01', '2029-02-28')).toEqual([])
  })

  it('minggu ke-N hari Y: Selasa ke-2', () => {
    const second = schedule(
      { type: 'monthly', nth: { week: 2, weekday: 2 } },
      { start: '2026-10-01' },
    )
    expect(days(second, '2026-10-01', '2027-01-31')).toEqual([
      '2026-10-13',
      '2026-11-10',
      '2026-12-08',
      '2027-01-12',
    ])
  })

  it('minggu ke-5 dilewati di bulan yang tidak punya', () => {
    const fifthFriday = schedule(
      { type: 'monthly', nth: { week: 5, weekday: 5 } },
      { start: '2026-10-01' },
    )
    // Jumat ke-5: Oktober 2026 (30), Januari 2027 (29); Nov/Des tidak punya.
    expect(days(fifthFriday, '2026-10-01', '2027-01-31')).toEqual(['2026-10-30', '2027-01-29'])
  })

  it('kejadian pertama tidak mundur sebelum tanggal mulai', () => {
    const second = schedule(
      { type: 'monthly', nth: { week: 1, weekday: 1 } },
      { start: '2026-10-20' },
    )
    expect(days(second, '2026-10-01', '2026-11-30')).toEqual(['2026-11-02'])
  })

  it('sampai tanggal: inklusif', () => {
    const daily = schedule({ type: 'daily', n: 1 }, { ends: { type: 'until', date: '2026-10-07' } })
    expect(days(daily, MON, YEAR_END)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07'])
  })

  it('setelah N kali: tepat N, termasuk saat rentang dimulai di tengah seri', () => {
    const counted = schedule(
      { type: 'weekly', days: [1, 4], interval: 1 },
      { ends: { type: 'count', count: 5 } },
    )
    expect(days(counted, MON, YEAR_END)).toEqual([
      '2026-10-05',
      '2026-10-08',
      '2026-10-12',
      '2026-10-15',
      '2026-10-19',
    ])
    expect(days(counted, '2026-10-12', YEAR_END)).toHaveLength(3)
  })

  it('pengecualian tetap memakai jatah hitungan', () => {
    const counted = schedule(
      { type: 'daily', n: 1 },
      { ends: { type: 'count', count: 3 }, exceptions: ['2026-10-06'] },
    )
    expect(days(counted, MON, YEAR_END)).toEqual(['2026-10-05', '2026-10-07'])
  })

  it('sekali: hanya tanggal mulai', () => {
    expect(days(schedule({ type: 'once' }), MON, YEAR_END)).toEqual([MON])
  })
})

describe('kalender', () => {
  it('kejadian per hari urut jam + kunci kehadiran', () => {
    const list = occurrencesOn(
      [schedule({ type: 'once' }), schedule({ type: 'once' }, { id: 's2', time: '08:00' })],
      MON,
      TZ,
    )
    expect(list.map((item) => item.key)).toEqual([`s2@${MON}`, `s1@${MON}`])
    expect(list[1]).toMatchObject({ start: 1140, end: 1230 })
  })

  it('lajur tabrakan', () => {
    const lanes = layoutLanes([
      { start: 60, end: 120 },
      { start: 90, end: 150 },
      { start: 200, end: 230 },
    ])
    expect(lanes.map((item) => [item.lane, item.lanes])).toEqual([
      [0, 2],
      [1, 2],
      [0, 1],
    ])
  })

  it('rentang pekan, bulan, dan geser anchor', () => {
    expect(weekDays('2026-10-09')[0]).toBe(MON)
    expect(monthDays('2026-10-15')[0]).toBe('2026-09-28')
    expect(monthDays('2026-10-15')).toHaveLength(35)
    expect(monthDays('2026-03-01')).toHaveLength(42)
    expect(shiftAnchor('bulan', '2026-10-15', 1)).toBe('2026-11-01')
    expect(shiftAnchor('pekan', MON, -1)).toBe('2026-09-28')
    expect(shiftAnchor('hari', MON, 1)).toBe('2026-10-06')
  })
})

describe('form jadwal', () => {
  it('validasi', () => {
    const draft = { ...newScheduleDraft(MON, '09:00'), title: 'Rapat' }
    expect(validateScheduleDraft(draft)).toBeNull()
    expect(validateScheduleDraft({ ...draft, title: ' ' })).toBe('titleRequired')
    expect(validateScheduleDraft({ ...draft, end: '08:00' })).toBe('duration')
    expect(validateScheduleDraft({ ...draft, timeMode: 'dur', dur: 0 })).toBe('duration')
    expect(validateScheduleDraft({ ...draft, time: '25:00' })).toBe('dateTime')
    expect(validateScheduleDraft({ ...draft, rec: 'weekly', weekDays: [] })).toBe('noDays')
    expect(
      validateScheduleDraft({ ...draft, rec: 'monthly', monthMode: 'nth', monthWeek: 0 }),
    ).toBe('monthPattern')
    expect(
      validateScheduleDraft({ ...draft, rec: 'daily', ends: 'until', untilDate: '2026-10-04' }),
    ).toBe('untilDate')
    expect(validateScheduleDraft({ ...draft, rec: 'daily', ends: 'count', count: 0 })).toBe('count')
    expect(validateScheduleDraft({ ...draft, rec: 'daily', ends: 'count', count: 1000 })).toBe(
      'count',
    )
  })

  it('dua mode waktu menghasilkan durasi yang sama', () => {
    const base = { ...newScheduleDraft(MON, '09:00'), title: 'Rapat' }
    const viaEnd = { ...base, timeMode: 'end' as const, end: '10:30' }
    const viaDur = { ...base, timeMode: 'dur' as const, dur: 90 }
    expect(draftDuration(viaEnd)).toBe(90)
    expect(draftDuration(viaDur)).toBe(90)
    expect(createSchedule(viaEnd, 'a').dur).toBe(createSchedule(viaDur, 'b').dur)
  })

  it('draft bulanan & aturan berakhir dipetakan ke model jadwal', () => {
    const draft = {
      ...newScheduleDraft('2026-10-20', '09:00'),
      rec: 'monthly' as const,
      monthMode: 'nth' as const,
      monthWeek: 2,
      monthWeekday: 2,
      ends: 'count' as const,
      count: 4,
    }
    expect(recurrenceFromDraft(draft)).toEqual({
      type: 'monthly',
      nth: { week: 2, weekday: 2 },
    })
    expect(endsFromDraft(draft)).toEqual({ type: 'count', count: 4 })
    expect(endsFromDraft({ ...draft, ends: 'until', untilDate: '2026-12-31' })).toEqual({
      type: 'until',
      date: '2026-12-31',
    })
    expect(endsFromDraft({ ...draft, ends: 'never' })).toEqual({ type: 'never' })
  })

  it('draft baru menghasilkan jadwal sekali di tanggal itu', () => {
    const draft = { ...newScheduleDraft(MON, '09:00'), title: 'Rapat' }
    expect(createSchedule(draft, 's1')).toMatchObject({
      title: 'Rapat',
      start: MON,
      time: '09:00',
      dur: 60,
      rec: { type: 'once' },
    })
  })

  const weekly = schedule({ type: 'weekly', days: [1], interval: 1 }, { goalId: 'g' })
  const occurrence = '2026-10-12'

  it('edit "semua" mengubah seri; tanggal mulai tetap kalau tanggal tidak diganti', () => {
    const draft = { ...draftFromSchedule(weekly, occurrence), title: 'Baru' }
    const [updated] = editSchedules([weekly], weekly, occurrence, draft, 'all', 'n', TZ)
    expect(updated).toMatchObject({ id: 's1', title: 'Baru', start: MON, goalId: 'g' })
  })

  it('edit "kejadian ini" = pengecualian + jadwal sekali', () => {
    const draft = { ...draftFromSchedule(weekly, occurrence), time: '20:00' }
    const list = editSchedules([weekly], weekly, occurrence, draft, 'this', 'n', TZ)
    expect(list.find((item) => item.id === 's1')?.exceptions).toEqual([occurrence])
    expect(list.find((item) => item.id === 'n')).toMatchObject({
      start: occurrence,
      time: '20:00',
      rec: { type: 'once' },
      goalId: 'g',
    })
  })

  it('edit "ini & berikutnya" memotong seri lama', () => {
    const draft = draftFromSchedule(weekly, occurrence)
    const list = editSchedules([weekly], weekly, occurrence, draft, 'following', 'n', TZ)
    expect(list.find((item) => item.id === 's1')?.ends).toEqual({
      type: 'until',
      date: '2026-10-11',
    })
    expect(list.find((item) => item.id === 'n')?.start).toBe(occurrence)
  })

  it('edit "ini & berikutnya" pada seri ber-count memakai sisa jatah', () => {
    const counted = schedule(
      { type: 'weekly', days: [1], interval: 1 },
      { ends: { type: 'count', count: 5 } },
    )
    const draft = draftFromSchedule(counted, occurrence)
    const list = editSchedules([counted], counted, occurrence, draft, 'following', 'n', TZ)
    expect(list.find((item) => item.id === 'n')?.ends).toEqual({ type: 'count', count: 4 })
  })

  it('hapus sesuai cakupan', () => {
    expect(deleteSchedules([weekly], weekly, occurrence, 'all')).toEqual([])
    expect(deleteSchedules([weekly], weekly, occurrence, 'this')[0]?.exceptions).toEqual([
      occurrence,
    ])
    expect(deleteSchedules([weekly], weekly, occurrence, 'following')[0]?.ends).toEqual({
      type: 'until',
      date: '2026-10-11',
    })
  })
})

describe('jadwal berikutnya', () => {
  it('lewati yang sudah mulai & sepanjang hari, cari sampai hari berikutnya', () => {
    const now = new Date(2026, 9, 5, 20, 0).getTime() // Senin 20:00 lokal perangkat
    const list = [
      schedule({ type: 'daily', n: 1 }),
      schedule({ type: 'daily', n: 1 }, { id: 'all', time: '00:00', allDay: true }),
    ]
    const next = nextOccurrence(list, now, TZ)
    expect(next?.key).toBe('s1@2026-10-06')
    if (!next) throw new Error('tidak ada jadwal berikutnya')
    expect(toLocalDateTime(occurrenceStartMs(next), TZ).hour).toBe(19)
    expect(nextOccurrence([], now, TZ)).toBeNull()
  })
})
