import { describe, expect, it } from 'vitest'

import {
  monthDays,
  occurrencesBetween,
  occurrencesOn,
  shiftAnchor,
  weekDays,
  type Schedule,
} from './schedule'
import { addDays, fromIsoDate } from './time'

/**
 * QA T9 - bukti bahwa recurring (T3) tampil benar di view hari, pekan, dan bulan.
 *
 * Yang diuji adalah perilaku yang dilihat user (tanggal mana yang punya kejadian), bukan detail
 * implementasi ekspansi. Acuan tanggalnya dihitung ulang di test (oracle) supaya test tidak ikut
 * salah kalau mesin recurrence salah.
 */

const schedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  id: 'sched-1',
  title: 'Kelas AWS',
  color: 0,
  start: '2025-09-01',
  time: '09:00',
  dur: 90,
  allDay: false,
  rec: { type: 'weekly', days: [1, 4], interval: 1 },
  ends: { type: 'never' },
  exceptions: [],
  goalId: null,
  ...overrides,
})

const WEEKLY_MON_THU = schedule()

/** Tanggal di `days` yang jatuh pada Senin (1) atau Kamis (4) - oracle independen dari engine. */
const monThuIn = (days: readonly string[]): string[] =>
  days.filter((day) => [1, 4].includes(fromIsoDate(day).getDay()))

const daysOf = (occurrences: readonly { day: string }[]): string[] =>
  [...new Set(occurrences.map((occurrence) => occurrence.day))].sort()

describe('T9 recurring di tiga view', () => {
  it('view hari: hanya tanggal yang cocok pola yang punya kejadian, jam & durasinya benar', () => {
    const kamis = occurrencesOn([WEEKLY_MON_THU], '2025-09-04')
    expect(kamis).toHaveLength(1)
    expect(kamis[0]?.start).toBe(9 * 60)
    expect(kamis[0]?.end).toBe(10 * 60 + 30)
    expect(kamis[0]?.key).toBe('sched-1@2025-09-04')

    expect(occurrencesOn([WEEKLY_MON_THU], '2025-09-03')).toEqual([])
    expect(occurrencesOn([WEEKLY_MON_THU], '2025-09-05')).toEqual([])
  })

  it('view pekan: 7 hari, kejadian muncul di kolom Senin & Kamis saja', () => {
    const days = weekDays('2025-09-10')
    expect(days).toEqual([
      '2025-09-08',
      '2025-09-09',
      '2025-09-10',
      '2025-09-11',
      '2025-09-12',
      '2025-09-13',
      '2025-09-14',
    ])

    const expanded = occurrencesBetween([WEEKLY_MON_THU], days[0] ?? '', days.at(-1) ?? '')
    expect(daysOf(expanded)).toEqual(['2025-09-08', '2025-09-11'])
  })

  it('view bulan: kejadian jatuh di semua Senin & Kamis dalam grid bulan', () => {
    const days = monthDays('2025-09-10')
    expect(days.length).toBe(35)
    expect(days[0]).toBe('2025-09-01')
    expect(days.at(-1)).toBe('2025-10-05')

    const expanded = occurrencesBetween([WEEKLY_MON_THU], days[0] ?? '', days.at(-1) ?? '')
    // Grid September 2025 ikut menampilkan 1-5 Oktober (sel "luar bulan"), jadi Kamis 2 Okt masuk.
    expect(daysOf(expanded)).toEqual([
      '2025-09-01',
      '2025-09-04',
      '2025-09-08',
      '2025-09-11',
      '2025-09-15',
      '2025-09-18',
      '2025-09-22',
      '2025-09-25',
      '2025-09-29',
      '2025-10-02',
    ])
    expect(daysOf(expanded)).toEqual(monThuIn(days))
  })

  it('hasil tiga view konsisten: hari ⊆ pekan ⊆ bulan (tidak ada kejadian yang hilang per view)', () => {
    const week = weekDays('2025-09-10')
    const month = monthDays('2025-09-10')
    const monthDaysSet = new Set(
      daysOf(occurrencesBetween([WEEKLY_MON_THU], month[0] ?? '', month.at(-1) ?? '')),
    )

    for (const day of week) {
      const dayDates = daysOf(occurrencesOn([WEEKLY_MON_THU], day))
      const weekDates = daysOf(occurrencesBetween([WEEKLY_MON_THU], day, day))
      expect(dayDates).toEqual(weekDates)
      for (const date of dayDates) expect(monthDaysSet.has(date)).toBe(true)
    }
  })

  it('tiap 2 minggu: pola dihitung dari minggu tanggal mulai, bukan dari awal rentang', () => {
    const biweekly = schedule({ rec: { type: 'weekly', days: [1, 4], interval: 2 } })
    const days = monthDays('2025-09-10')
    const expanded = occurrencesBetween([biweekly], days[0] ?? '', days.at(-1) ?? '')
    expect(daysOf(expanded)).toEqual([
      '2025-09-01',
      '2025-09-04',
      '2025-09-15',
      '2025-09-18',
      '2025-09-29',
      '2025-10-02',
    ])
  })

  it('pengecualian dan batas akhir tetap dihormati di view pekan & bulan', () => {
    const withException = schedule({ exceptions: ['2025-09-04'] })
    const until = schedule({ ends: { type: 'until', date: '2025-09-15' } })

    const week = weekDays('2025-09-10')
    expect(daysOf(occurrencesBetween([withException], week[0] ?? '', week.at(-1) ?? ''))).toEqual([
      '2025-09-08',
      '2025-09-11',
    ])

    const month = monthDays('2025-09-10')
    expect(daysOf(occurrencesBetween([until], month[0] ?? '', month.at(-1) ?? ''))).toEqual([
      '2025-09-01',
      '2025-09-04',
      '2025-09-08',
      '2025-09-11',
      '2025-09-15',
    ])
  })

  it('bulan tanpa tanggal 29-31: kejadian dilewati, bukan digeser', () => {
    const monthly31 = schedule({
      start: '2025-01-31',
      rec: { type: 'monthly' },
    })
    // Februari 2025 hanya 28 hari -> tidak ada kejadian; Maret tetap tanggal 31.
    expect(occurrencesOn([monthly31], '2025-02-28')).toEqual([])
    expect(daysOf(occurrencesOn([monthly31], '2025-03-31'))).toEqual(['2025-03-31'])
  })
})

describe('T9 navigasi tanggal (pekan & bulan lintas bulan/tahun)', () => {
  it('pekan yang melintasi tahun tetap 7 hari berurutan', () => {
    const days = weekDays('2025-12-31')
    expect(days).toEqual([
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ])
  })

  it('recurring mingguan tetap benar di pekan lintas tahun (29 Des & 5 Jan, bukan 4 Jan)', () => {
    const weeklyMonday = schedule({
      start: '2025-12-01',
      rec: { type: 'weekly', days: [1], interval: 1 },
    })
    const days = weekDays('2025-12-31')
    expect(daysOf(occurrencesBetween([weeklyMonday], days[0] ?? '', days.at(-1) ?? ''))).toEqual([
      '2025-12-29',
    ])

    const nextWeek = weekDays('2026-01-05')
    expect(
      daysOf(occurrencesBetween([weeklyMonday], nextWeek[0] ?? '', nextWeek.at(-1) ?? '')),
    ).toEqual(['2026-01-05'])
  })

  it('grid Januari 2026 dimulai di Desember 2025 dan mencakup awal Februari', () => {
    const days = monthDays('2026-01-15')
    expect(days[0]).toBe('2025-12-29')
    expect(days.at(-1)).toBe('2026-02-01')
    expect(days).toContain('2026-01-01')

    const weeklyMonday = schedule({
      start: '2025-12-01',
      rec: { type: 'weekly', days: [1], interval: 1 },
    })
    expect(daysOf(occurrencesBetween([weeklyMonday], days[0] ?? '', days.at(-1) ?? ''))).toEqual([
      '2025-12-29',
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26',
    ])
  })

  it('geser anchor: bulan lewat pergantian tahun, pekan 7 hari, hari 1 hari', () => {
    expect(shiftAnchor('bulan', '2025-12-15', 1)).toBe('2026-01-01')
    expect(shiftAnchor('bulan', '2026-01-15', -1)).toBe('2025-12-01')
    expect(shiftAnchor('pekan', '2025-12-31', 1)).toBe('2026-01-07')
    expect(shiftAnchor('hari', '2025-12-31', 1)).toBe('2026-01-01')
  })

  it('Februari tahun kabisat & bukan kabisat tetap 5/6 minggu penuh', () => {
    const leap = monthDays('2024-02-10')
    expect(leap[0]).toBe('2024-01-29')
    expect(leap.at(-1)).toBe('2024-03-03')

    const short = monthDays('2025-02-10')
    expect(short).toHaveLength(35)
    expect(short[0]).toBe('2025-01-27')
    expect(short.at(-1)).toBe('2025-03-02')
  })
})

describe('T9 timezone lokal', () => {
  it('zona jadwal menang atas zona perangkat: 00:30 Jakarta tetap tanggal 1 Sep', () => {
    const jakarta = schedule({ time: '00:30', dur: 30, tz: 'Asia/Jakarta', rec: { type: 'once' } })

    for (const deviceTz of ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles']) {
      const found = occurrencesBetween([jakarta], '2025-09-01', '2025-09-01', deviceTz)
      expect(occurrencesOn([jakarta], '2025-09-01', deviceTz)).toHaveLength(1)
      expect(found[0]?.day).toBe('2025-09-01')
      // 00:30 WIB = 17:30 UTC hari sebelumnya.
      expect(new Date(found[0]?.at ?? 0).toISOString()).toBe('2025-08-31T17:30:00.000Z')
    }
  })

  it('dua jadwal jam dinding sama di zona berbeda punya instan berbeda, tanggal lokal sama', () => {
    const auckland = schedule({ id: 'nz', tz: 'Pacific/Auckland', rec: { type: 'once' } })
    const losAngeles = schedule({ id: 'la', tz: 'America/Los_Angeles', rec: { type: 'once' } })

    const occurrences = occurrencesBetween(
      [auckland, losAngeles],
      '2025-09-01',
      '2025-09-01',
      'UTC',
    )
    expect(occurrences.map((occurrence) => occurrence.day)).toEqual(['2025-09-01', '2025-09-01'])

    const ms = Object.fromEntries(
      occurrences.map((occurrence) => [
        occurrence.schedule.id,
        new Date(occurrence.at).toISOString(),
      ]),
    )
    expect(ms.nz).toBe('2025-08-31T21:00:00.000Z')
    expect(ms.la).toBe('2025-09-01T16:00:00.000Z')
  })

  it('DST: jam lokal 09:00 tetap 09:00 di hari pergantian (selisih 23 jam, bukan 24)', () => {
    const newYork = schedule({
      start: '2025-03-08',
      tz: 'America/New_York',
      rec: { type: 'daily', n: 1 },
    })
    const occurrences = occurrencesBetween(
      [newYork],
      '2025-03-08',
      '2025-03-10',
      'America/New_York',
    )
    expect(occurrences.map((occurrence) => new Date(occurrence.at).toISOString())).toEqual([
      '2025-03-08T14:00:00.000Z',
      '2025-03-09T13:00:00.000Z',
      '2025-03-10T13:00:00.000Z',
    ])
    const [first, second, third] = occurrences.map((occurrence) => occurrence.at)
    expect((second ?? 0) - (first ?? 0)).toBe(23 * 60 * 60 * 1000)
    expect((third ?? 0) - (second ?? 0)).toBe(24 * 60 * 60 * 1000)
  })

  it('kejadian hanya di-expand untuk rentang yang dilihat (seri lama tidak bocor keluar grid)', () => {
    const dailySince2020 = schedule({ start: '2020-01-01', rec: { type: 'daily', n: 1 } })
    const month = monthDays('2025-09-10')
    const expanded = occurrencesBetween([dailySince2020], month[0] ?? '', month.at(-1) ?? '')
    expect(expanded).toHaveLength(month.length)
    expect(daysOf(expanded)).toEqual([...month].sort())

    const week = weekDays('2025-09-10')
    expect(occurrencesBetween([dailySince2020], week[0] ?? '', week.at(-1) ?? '')).toHaveLength(7)
  })
})

// Dipakai supaya `addDays` tidak jadi import nganggur kalau kasus di atas berubah.
describe('T9 helper tanggal', () => {
  it('addDays tetap konsisten di batas bulan', () => {
    expect(addDays('2025-08-31', 1)).toBe('2025-09-01')
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28')
  })
})
