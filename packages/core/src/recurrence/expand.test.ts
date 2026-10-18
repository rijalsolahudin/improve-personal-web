import { describe, expect, it } from 'vitest'

import type { ScheduleRecurrence } from '../domain/entities/schedule.ts'
import { expandOccurrenceTimes, type ExpansibleSchedule } from './expand.ts'
import { localDateOf } from './timezone.ts'

/**
 * AC T3: "tiap pola menghasilkan tanggal benar untuk rentang 1 tahun; tgl 31 di bulan pendek
 * dilewati; ekspansi cuma di rentang yang diminta".
 *
 * Semua test deterministik: tz eksplisit, jam lokal eksplisit, dan rentang eksplisit.
 */

const TZ = 'Asia/Jakarta' // UTC+7, tanpa DST - kasus paling umum di sini.

/** Buat jadwal yang mulai pukul 09:00 lokal pada `localDate`. */
function scheduleOn(localDate: string, timeZone = TZ, durationMs = 3_600_000): ExpansibleSchedule {
  const startAt = zonedMidnight(localDate, timeZone) + 9 * 3_600_000
  return {
    id: `sched-${localDate}`,
    startAt,
    durationMs,
    isAllDay: false,
    tz: timeZone,
  }
}

/** Awal hari lokal (UTC+7 untuk Asia/Jakarta) - helper test, sengaja aritmetika sederhana. */
function zonedMidnight(localDate: string, timeZone: string): number {
  const offsetHours = timeZone === 'Asia/Jakarta' ? 7 : 0
  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number]
  return Date.UTC(year, month - 1, day) - offsetHours * 3_600_000
}

/** Susun recurrence dengan default yang masuk akal; tiap test cuma menimpa yang relevan. */
function recurrence(
  patch: Partial<ScheduleRecurrence> & Pick<ScheduleRecurrence, 'type'>,
): ScheduleRecurrence {
  return {
    id: 'rec-1',
    scheduleId: 'sched-1',
    intervalN: 1,
    byWeekdays: null,
    monthMode: null,
    monthDay: null,
    weekOfMonth: null,
    monthWeekday: null,
    endMode: 'never',
    endDate: null,
    occurrenceCount: null,
    ...patch,
  }
}

/** Rentang satu tahun penuh mulai `fromLocalDate`, dengan jam lokal dari `TZ`. */
function oneYearRange(fromLocalDate: string, timeZone = TZ): { fromMs: number; toMs: number } {
  const [year, month, day] = fromLocalDate.split('-').map(Number) as [number, number, number]
  const offsetHours = timeZone === 'Asia/Jakarta' ? 7 : 0
  return {
    fromMs: Date.UTC(year, month - 1, day) - offsetHours * 3_600_000,
    toMs: Date.UTC(year + 1, month - 1, day) - offsetHours * 3_600_000 - 1,
  }
}

function localDates(occurrences: readonly { readonly occurrenceAt: number }[], tz = TZ): string[] {
  return occurrences.map((occurrence) => localDateOf(occurrence.occurrenceAt, tz))
}

describe('expandOccurrenceTimes - jadwal sekali', () => {
  it('menghasilkan tepat satu kejadian, dan hanya kalau dia di dalam rentang', () => {
    const schedule = scheduleOn('2025-03-10')
    const range = oneYearRange('2025-01-01')

    expect(expandOccurrenceTimes(schedule, null, range)).toHaveLength(1)

    const after = oneYearRange('2026-01-01')
    expect(expandOccurrenceTimes(schedule, null, after)).toHaveLength(0)
  })

  it('recurrence bertipe once diperlakukan sama seperti tanpa recurrence', () => {
    const schedule = scheduleOn('2025-03-10')
    const once = recurrence({ type: 'once' })
    const range = oneYearRange('2025-01-01')

    expect(localDates(expandOccurrenceTimes(schedule, once, range))).toEqual(['2025-03-10'])
  })
})

describe('expandOccurrenceTimes - harian', () => {
  it('interval 1 menghasilkan 365 tanggal dalam setahun (tanpa lompatan)', () => {
    const schedule = scheduleOn('2025-01-01')
    const range = oneYearRange('2025-01-01')
    const occurrences = expandOccurrenceTimes(schedule, recurrence({ type: 'daily' }), range)

    expect(occurrences).toHaveLength(365)
    const dates = localDates(occurrences)
    expect(dates[0]).toBe('2025-01-01')
    expect(dates[364]).toBe('2025-12-31')
    expect(new Set(dates).size).toBe(365)
  })

  it('interval 3 menghasilkan hari ke-1, 4, 7, ...', () => {
    const schedule = scheduleOn('2025-01-01')
    const range = oneYearRange('2025-01-01')
    const dates = localDates(
      expandOccurrenceTimes(schedule, recurrence({ type: 'daily', intervalN: 3 }), range),
    )

    expect(dates.slice(0, 4)).toEqual(['2025-01-01', '2025-01-04', '2025-01-07', '2025-01-10'])
    // 365 hari dengan lompatan 3 hari: 1 + 3*121 = 364 -> 2025-12-30 masih di dalam rentang.
    expect(dates.at(-1)).toBe('2025-12-30')
    expect(dates).toHaveLength(122)
  })

  it('interval di luar batas dikoreksi ke rentang sah 1-6 (data rusak tidak bikin pola aneh)', () => {
    const schedule = scheduleOn('2025-01-01')
    const range = oneYearRange('2025-01-01')

    // 0 -> 1, dan 99 -> 6. Keduanya tetap menghasilkan pola yang bisa diprediksi.
    expect(
      localDates(
        expandOccurrenceTimes(schedule, recurrence({ type: 'daily', intervalN: 0 }), range),
      ),
    ).toHaveLength(365)
    expect(
      localDates(
        expandOccurrenceTimes(schedule, recurrence({ type: 'daily', intervalN: 99 }), range),
      ),
    ).toHaveLength(61)
  })
})

describe('expandOccurrenceTimes - mingguan', () => {
  it('multi hari: Senin & Rabu tiap minggu, minggu mulai Senin', () => {
    // 2025-01-06 adalah Senin.
    const schedule = scheduleOn('2025-01-06')
    const range = oneYearRange('2025-01-06')
    const dates = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({ type: 'weekly', byWeekdays: ['senin', 'rabu'] }),
        range,
      ),
    )

    expect(dates.slice(0, 6)).toEqual([
      '2025-01-06', // Senin
      '2025-01-08', // Rabu
      '2025-01-13',
      '2025-01-15',
      '2025-01-20',
      '2025-01-22',
    ])
    // Rentang 365 hari mulai Senin: 53 Senin & 52 Rabu = 105 kejadian; terakhir Senin 2026-01-05.
    expect(dates).toHaveLength(105)
    expect(dates.at(-1)).toBe('2026-01-05')
  })

  it('urutan hari tidak mengubah hasil (Senin-Rabu sama dengan Rabu-Senin)', () => {
    const schedule = scheduleOn('2025-01-06')
    const range = oneYearRange('2025-01-06')

    const a = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({ type: 'weekly', byWeekdays: ['senin', 'rabu'] }),
        range,
      ),
    )
    const b = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({ type: 'weekly', byWeekdays: ['rabu', 'senin'] }),
        range,
      ),
    )

    expect(a).toEqual(b)
  })

  it('interval 2 menghasilkan kejadian tiap dua minggu', () => {
    const schedule = scheduleOn('2025-01-06') // Senin
    const range = oneYearRange('2025-01-06')
    const dates = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({ type: 'weekly', intervalN: 2, byWeekdays: ['senin'] }),
        range,
      ),
    )

    expect(dates.slice(0, 4)).toEqual(['2025-01-06', '2025-01-20', '2025-02-03', '2025-02-17'])
  })

  it('minggu dihitung dari Senin, jadi hari Minggu ikut minggu sebelumnya', () => {
    // 2025-01-05 adalah Minggu. Jadwal "2 mingguan tiap Senin & Minggu" dibuat pada Minggu itu:
    // minggu pertama = Senin 2024-12-30 s/d Minggu 2025-01-05, jadi cuma Minggu-nya yang >= seed.
    // Minggu berikutnya yang dipakai = Senin 2025-01-13 s/d Minggu 2025-01-19 -> Senin & Minggu.
    const schedule = scheduleOn('2025-01-05')
    const range = oneYearRange('2025-01-05')
    const dates = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({ type: 'weekly', intervalN: 2, byWeekdays: ['senin', 'minggu'] }),
        range,
      ),
    )

    expect(dates.slice(0, 4)).toEqual(['2025-01-05', '2025-01-13', '2025-01-19', '2025-01-27'])

    // Pasangan (Senin, Minggu) selalu berjarak 6 hari: Senin awal minggu ke-3, Minggu akhirnya.
    // Di sini urutannya [hari-ke-3 (Senin 2025-01-13), Minggu 2025-01-19] pada indeks 1 & 2.
    const monday = dates[1]
    const sunday = dates[2]
    expect(monday).toBe('2025-01-13')
    expect(sunday).toBe('2025-01-19')
    expect(
      (Date.parse(`${sunday}T00:00:00Z`) - Date.parse(`${monday}T00:00:00Z`)) / 86_400_000,
    ).toBe(6)
  })

  it('anchor Senin: jadwal 2 mingguan mulai Rabu tetap berpasangan dengan Senin minggu yang sama', () => {
    // 2025-01-08 Rabu. Pilihan [rabu, senin] harus menghasilkan Senin 2025-01-06 dulu? Tidak:
    // hari sebelum seed dalam minggu pertama dilewati, jadi Rabu-nya dulu, lalu minggu ke-3 Senin.
    const schedule = scheduleOn('2025-01-08')
    const range = oneYearRange('2025-01-06')
    const dates = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({ type: 'weekly', intervalN: 2, byWeekdays: ['rabu', 'senin'] }),
        range,
      ),
    )

    expect(dates.slice(0, 4)).toEqual(['2025-01-08', '2025-01-20', '2025-01-22', '2025-02-03'])
  })

  it('by_weekdays kosong menghasilkan nol kejadian, bukan error', () => {
    const schedule = scheduleOn('2025-01-06')
    const range = oneYearRange('2025-01-06')

    expect(
      expandOccurrenceTimes(schedule, recurrence({ type: 'weekly', byWeekdays: [] }), range),
    ).toHaveLength(0)
  })
})

describe('expandOccurrenceTimes - bulanan by_day_of_month', () => {
  it('tanggal 15 muncul tiap bulan dalam setahun', () => {
    const schedule = scheduleOn('2025-01-15')
    const range = oneYearRange('2025-01-01')
    const dates = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({ type: 'monthly', monthMode: 'by_day_of_month', monthDay: 15 }),
        range,
      ),
    )

    expect(dates).toEqual([
      '2025-01-15',
      '2025-02-15',
      '2025-03-15',
      '2025-04-15',
      '2025-05-15',
      '2025-06-15',
      '2025-07-15',
      '2025-08-15',
      '2025-09-15',
      '2025-10-15',
      '2025-11-15',
      '2025-12-15',
    ])
  })

  it('AC T3: tanggal 31 DILEWATI di bulan pendek (BUKAN digeser ke tanggal 1)', () => {
    const schedule = scheduleOn('2025-01-31')
    const range = oneYearRange('2025-01-01')
    const dates = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({ type: 'monthly', monthMode: 'by_day_of_month', monthDay: 31 }),
        range,
      ),
    )

    // Jan, Mar, Mei, Jul, Agu, Okt, Des punya 31 hari. Feb/Apr/Jun/Sep/Nov dilewati.
    expect(dates).toEqual([
      '2025-01-31',
      '2025-03-31',
      '2025-05-31',
      '2025-07-31',
      '2025-08-31',
      '2025-10-31',
      '2025-12-31',
    ])
    expect(dates).not.toContain('2025-03-01')
    expect(dates).not.toContain('2025-04-30')
  })

  it('tanggal 29 & 30: Februari tahun non-kabisat dilewati, tahun kabisat tidak', () => {
    const schedule = scheduleOn('2024-01-29')
    const range = oneYearRange('2024-01-01')
    const dates = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({ type: 'monthly', monthMode: 'by_day_of_month', monthDay: 29 }),
        range,
      ),
    )

    // 2024 kabisat -> Feb 29 ada.
    expect(dates).toContain('2024-02-29')
    expect(dates).toHaveLength(12)

    // Tahun non-kabisat: Februari 2025 hanya 28 hari, jadi tanggal 29 dilewati.
    const schedule29 = scheduleOn('2025-01-29')
    const dates2025 = localDates(
      expandOccurrenceTimes(
        schedule29,
        recurrence({ type: 'monthly', monthMode: 'by_day_of_month', monthDay: 29 }),
        oneYearRange('2025-01-01'),
      ),
    )
    expect(dates2025).not.toContain('2025-02-29')
    expect(dates2025).toHaveLength(11)

    // Tanggal 30: Februari (28/29 hari) selalu dilewati, bulan lain tidak.
    const schedule30 = scheduleOn('2025-01-30')
    const dates30 = localDates(
      expandOccurrenceTimes(
        schedule30,
        recurrence({ type: 'monthly', monthMode: 'by_day_of_month', monthDay: 30 }),
        oneYearRange('2025-01-01'),
      ),
    )
    expect(dates30).not.toContain('2025-02-30')
    expect(dates30).toContain('2025-01-30')
    expect(dates30).toContain('2025-03-30')
    expect(dates30).toHaveLength(11)
  })

  it('tanggal 31 tidak pernah menghasilkan tanggal 1 di bulan berikutnya', () => {
    const schedule = scheduleOn('2025-01-31')
    const range = oneYearRange('2025-01-01')
    const dates = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({ type: 'monthly', monthMode: 'by_day_of_month', monthDay: 31 }),
        range,
      ),
    )

    for (const date of dates) {
      expect(date.endsWith('-31')).toBe(true)
    }
  })
})

describe('expandOccurrenceTimes - bulanan by_nth_weekday', () => {
  it('Selasa ke-2 tiap bulan', () => {
    const schedule = scheduleOn('2025-01-14') // Selasa ke-2 Januari 2025
    const range = oneYearRange('2025-01-01')
    const dates = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({
          type: 'monthly',
          monthMode: 'by_nth_weekday',
          weekOfMonth: 2,
          monthWeekday: 'selasa',
        }),
        range,
      ),
    )

    expect(dates).toEqual([
      '2025-01-14',
      '2025-02-11',
      '2025-03-11',
      '2025-04-08',
      '2025-05-13',
      '2025-06-10',
      '2025-07-08',
      '2025-08-12',
      '2025-09-09',
      '2025-10-14',
      '2025-11-11',
      '2025-12-09',
    ])
  })

  it('minggu ke-5 hanya muncul di bulan yang punya minggu ke-5 untuk hari itu', () => {
    const schedule = scheduleOn('2025-01-29') // Rabu ke-5 Januari 2025
    const range = oneYearRange('2025-01-01')
    const dates = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({
          type: 'monthly',
          monthMode: 'by_nth_weekday',
          weekOfMonth: 5,
          monthWeekday: 'rabu',
        }),
        range,
      ),
    )

    // Hanya bulan yang punya 5 Rabu: Jan, Apr, Jul, Okt, Des 2025.
    expect(dates).toEqual(['2025-01-29', '2025-04-30', '2025-07-30', '2025-10-29', '2025-12-31'])
  })

  it('bulan yang tidak punya hari itu sama sekali dilewati tanpa menggeser hari', () => {
    const schedule = scheduleOn('2025-01-31') // Jumat ke-5
    const range = oneYearRange('2025-01-01')
    const dates = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({
          type: 'monthly',
          monthMode: 'by_nth_weekday',
          weekOfMonth: 5,
          monthWeekday: 'jumat',
        }),
        range,
      ),
    )

    expect(dates).toEqual(['2025-01-31', '2025-05-30', '2025-08-29', '2025-10-31'])

    // Semua hasilnya memang hari Jumat.
    for (const date of dates) {
      expect(new Date(`${date}T00:00:00Z`).getUTCDay()).toBe(5)
    }
  })
})

describe('expandOccurrenceTimes - end rule', () => {
  it('until_date: inklusif sampai akhir hari lokal tanggal berakhir', () => {
    const schedule = scheduleOn('2025-01-01')
    const range = oneYearRange('2025-01-01')
    // 2025-01-05 akhir hari di Jakarta = 2025-01-05T16:59:59.999Z.
    const endDate = zonedMidnight('2025-01-06', TZ) - 1

    const dates = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({ type: 'daily', endMode: 'until_date', endDate }),
        range,
      ),
    )

    expect(dates).toEqual(['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04', '2025-01-05'])
  })

  it('after_count: berhenti setelah N kejadian, dihitung dari kejadian pertama', () => {
    const schedule = scheduleOn('2025-01-01')
    const range = oneYearRange('2025-01-01')
    const dates = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({ type: 'daily', endMode: 'after_count', occurrenceCount: 3 }),
        range,
      ),
    )

    expect(dates).toEqual(['2025-01-01', '2025-01-02', '2025-01-03'])
  })

  it('after_count dihitung dari awal pola walau rentang mulai di tengah', () => {
    const schedule = scheduleOn('2025-01-01')
    // Rentang mulai 2025-03-01: 3 kejadian pertama sudah lewat, jadi hasilnya harus kosong.
    const range = oneYearRange('2025-03-01')
    const dates = localDates(
      expandOccurrenceTimes(
        schedule,
        recurrence({ type: 'daily', endMode: 'after_count', occurrenceCount: 3 }),
        range,
      ),
    )

    expect(dates).toEqual([])
  })

  it('never: berhenti di batas rentang, bukan berjalan selamanya', () => {
    const schedule = scheduleOn('2025-01-01')
    const range = oneYearRange('2025-01-01')
    const occurrences = expandOccurrenceTimes(schedule, recurrence({ type: 'daily' }), range)

    expect(occurrences).toHaveLength(365)
    expect(localDates(occurrences).at(-1)).toBe('2025-12-31')
  })
})

describe('expandOccurrenceTimes - AC T3 "ekspansi cuma di rentang yang diminta"', () => {
  it('rentang satu hari hanya menghasilkan kejadian hari itu', () => {
    const schedule = scheduleOn('2020-01-01') // jauh di masa lalu, pola harian
    const range = {
      fromMs: zonedMidnight('2025-06-10', TZ),
      toMs: zonedMidnight('2025-06-11', TZ) - 1,
    }

    const dates = localDates(expandOccurrenceTimes(schedule, recurrence({ type: 'daily' }), range))
    expect(dates).toEqual(['2025-06-10'])
  })

  it('rentang satu bulan menghasilkan tepat kejadian bulan itu', () => {
    const schedule = scheduleOn('2020-01-01')
    const range = {
      fromMs: zonedMidnight('2025-02-01', TZ),
      toMs: zonedMidnight('2025-03-01', TZ) - 1,
    }

    expect(expandOccurrenceTimes(schedule, recurrence({ type: 'daily' }), range)).toHaveLength(28)
  })

  it('jadwal berdurasi yang MELINTASI batas rentang tetap ikut tampil', () => {
    // Mulai 23:00 tanggal 9, durasi 2 jam -> berakhir 01:00 tanggal 10.
    const schedule: ExpansibleSchedule = {
      id: 'overnight',
      startAt: zonedMidnight('2025-06-09', TZ) + 23 * 3_600_000,
      durationMs: 2 * 3_600_000,
      isAllDay: false,
      tz: TZ,
    }
    const range = {
      fromMs: zonedMidnight('2025-06-10', TZ),
      toMs: zonedMidnight('2025-06-11', TZ) - 1,
    }

    const occurrences = expandOccurrenceTimes(schedule, null, range)
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]?.localDate).toBe('2025-06-09')
  })

  it('ekspansi besar dibatasi MAX_OCCURRENCES_PER_EXPANSION, bukan menggantung', () => {
    const schedule = scheduleOn('2000-01-01')
    const range = {
      fromMs: zonedMidnight('2000-01-01', TZ),
      toMs: zonedMidnight('2100-01-01', TZ) - 1,
    }

    const occurrences = expandOccurrenceTimes(schedule, recurrence({ type: 'daily' }), range)
    expect(occurrences).toHaveLength(10_000)
  })
})

describe('expandOccurrenceTimes - tz & DST', () => {
  it('jam kejadian tetap 09:00 LOKAL walau offset tz berubah (DST)', () => {
    // America/New_York: DST mulai 2025-03-09, offset berubah -5 -> -4.
    const tz = 'America/New_York'
    const startLocal = '2025-03-07'
    const [year, month, day] = startLocal.split('-').map(Number) as [number, number, number]
    const startAt = Date.UTC(year, month - 1, day, 14, 0) // 09:00 EST (UTC-5)

    const schedule: ExpansibleSchedule = {
      id: 'dst',
      startAt,
      durationMs: 3_600_000,
      isAllDay: false,
      tz,
    }

    const range = {
      fromMs: Date.UTC(2025, 2, 7, 0, 0),
      toMs: Date.UTC(2025, 2, 12, 23, 59, 59, 999),
    }

    const occurrences = expandOccurrenceTimes(schedule, recurrence({ type: 'daily' }), range)
    const dates = localDates(occurrences, tz)
    expect(dates).toEqual([
      '2025-03-07',
      '2025-03-08',
      '2025-03-09',
      '2025-03-10',
      '2025-03-11',
      '2025-03-12',
    ])

    // Sesudah DST, jam lokal tetap 09:00 tapi offsetnya sudah -4 (jam UTC-nya jadi 13:00).
    const afterDst = occurrences[3]
    expect(afterDst).toBeDefined()
    expect(new Date(afterDst?.occurrenceAt ?? 0).getUTCHours()).toBe(13)
  })

  it('tz perangkat berbeda menghasilkan tanggal lokal yang berbeda untuk instan yang sama', () => {
    const schedule = scheduleOn('2025-06-10')
    const range = oneYearRange('2025-06-10')

    const jakarta = expandOccurrenceTimes(schedule, null, range)
    const utcSchedule: ExpansibleSchedule = { ...schedule, tz: 'UTC' }
    const utc = expandOccurrenceTimes(utcSchedule, null, range)

    // Instan-nya sama (start_at tidak berubah), tapi tanggal lokalnya bisa beda per tz.
    expect(jakarta[0]?.occurrenceAt).toBe(utc[0]?.occurrenceAt)
    expect(localDateOf(jakarta[0]?.occurrenceAt ?? 0, 'Asia/Jakarta')).toBe('2025-06-10')
  })
})
