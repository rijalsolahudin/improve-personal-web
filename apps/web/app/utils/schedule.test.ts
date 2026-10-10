import { describe, expect, it } from 'vitest'

import {
  deleteSchedules,
  draftFromSchedule,
  editSchedules,
  layoutLanes,
  monthDays,
  newScheduleDraft,
  nextOccurrence,
  occurrenceStartMs,
  occurrencesOn,
  occursOn,
  shiftAnchor,
  validateScheduleDraft,
  weekDays,
  type Recurrence,
  type Schedule,
} from './schedule'

// 2026-10-05 = Senin.
const MON = '2026-10-05'

const schedule = (rec: Recurrence, overrides: Partial<Schedule> = {}): Schedule => ({
  id: 's1',
  title: 'Kelas',
  color: 0,
  start: MON,
  time: '19:00',
  dur: 90,
  allDay: false,
  rec,
  until: null,
  exceptions: [],
  goalId: null,
  ...overrides,
})

describe('occursOn', () => {
  it('sekali & sebelum mulai', () => {
    const once = schedule({ type: 'once' })
    expect(occursOn(once, MON)).toBe(true)
    expect(occursOn(once, '2026-10-06')).toBe(false)
    expect(occursOn(once, '2026-10-04')).toBe(false)
  })

  it('harian tiap n hari', () => {
    const daily = schedule({ type: 'daily', n: 3 })
    expect(occursOn(daily, '2026-10-08')).toBe(true)
    expect(occursOn(daily, '2026-10-07')).toBe(false)
  })

  it('mingguan per hari + selang 2 minggu', () => {
    const weekly = schedule({ type: 'weekly', days: [2, 4], interval: 2 })
    expect(occursOn(weekly, '2026-10-06')).toBe(true) // Selasa minggu ini
    expect(occursOn(weekly, '2026-10-13')).toBe(false) // minggu depan dilewati
    expect(occursOn(weekly, '2026-10-20')).toBe(true)
    expect(occursOn(weekly, '2026-10-07')).toBe(false) // Rabu
  })

  it('bulanan di tanggal yang sama; bulan tanpa tanggal itu dilewati', () => {
    const monthly = schedule({ type: 'monthly' }, { start: '2026-01-31' })
    expect(occursOn(monthly, '2026-03-31')).toBe(true)
    expect(occursOn(monthly, '2026-02-28')).toBe(false)
  })

  it('pengecualian & batas akhir', () => {
    const daily = schedule(
      { type: 'daily', n: 1 },
      { exceptions: ['2026-10-06'], until: '2026-10-08' },
    )
    expect(occursOn(daily, '2026-10-06')).toBe(false)
    expect(occursOn(daily, '2026-10-08')).toBe(true)
    expect(occursOn(daily, '2026-10-09')).toBe(false)
  })
})

describe('kalender', () => {
  it('kejadian per hari urut jam + kunci kehadiran', () => {
    const list = occurrencesOn(
      [schedule({ type: 'once' }), schedule({ type: 'once' }, { id: 's2', time: '08:00' })],
      MON,
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
  })

  const weekly = schedule({ type: 'weekly', days: [1], interval: 1 }, { goalId: 'g' })
  const occurrence = '2026-10-12'

  it('edit "semua" mengubah seri; tanggal mulai tetap kalau tanggal tidak diganti', () => {
    const draft = { ...draftFromSchedule(weekly, occurrence), title: 'Baru' }
    const [updated] = editSchedules([weekly], weekly, occurrence, draft, 'all', 'n')
    expect(updated).toMatchObject({ id: 's1', title: 'Baru', start: MON, goalId: 'g' })
  })

  it('edit "kejadian ini" = pengecualian + jadwal sekali', () => {
    const draft = { ...draftFromSchedule(weekly, occurrence), time: '20:00' }
    const list = editSchedules([weekly], weekly, occurrence, draft, 'this', 'n')
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
    const list = editSchedules([weekly], weekly, occurrence, draft, 'following', 'n')
    expect(list.find((item) => item.id === 's1')?.until).toBe('2026-10-11')
    expect(list.find((item) => item.id === 'n')?.start).toBe(occurrence)
  })

  it('hapus sesuai cakupan', () => {
    expect(deleteSchedules([weekly], weekly, occurrence, 'all')).toEqual([])
    expect(deleteSchedules([weekly], weekly, occurrence, 'this')[0]?.exceptions).toEqual([
      occurrence,
    ])
    expect(deleteSchedules([weekly], weekly, occurrence, 'following')[0]?.until).toBe('2026-10-11')
  })
})

describe('jadwal berikutnya', () => {
  it('lewati yang sudah mulai & sepanjang hari, cari sampai hari berikutnya', () => {
    const now = new Date(2026, 9, 5, 20, 0).getTime() // Senin 20:00
    const list = [
      schedule({ type: 'daily', n: 1 }),
      schedule({ type: 'daily', n: 1 }, { id: 'all', time: '00:00', allDay: true }),
    ]
    const next = nextOccurrence(list, now)
    expect(next?.key).toBe('s1@2026-10-06')
    if (!next) throw new Error('tidak ada jadwal berikutnya')
    expect(new Date(occurrenceStartMs(next)).getHours()).toBe(19)
    expect(nextOccurrence([], now)).toBeNull()
  })
})
