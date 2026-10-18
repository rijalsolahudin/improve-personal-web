import { describe, expect, it } from 'vitest'

import type { Countdown } from '../domain/entities/habit.ts'
import { archiveCountdown } from '../domain/entities/habit.ts'
import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_MONTH,
  MS_PER_SECOND,
  MS_PER_YEAR,
} from './duration.ts'
import { countdownUnits, sortedCountdownRows, topCountdowns } from './countdown.ts'

/**
 * AC T8: "Unit test tiap ambang F5; sort terdekat; lewat -> status 'sudah lewat'".
 */

const NOW = 1_700_000_000_000

function countdown(patch: Partial<Countdown> & Pick<Countdown, 'id' | 'targetAt'>): Countdown {
  return {
    name: patch.id,
    color: null,
    stickerId: null,
    isArchived: false,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  }
}

describe('countdownUnits - ambang F5', () => {
  it('≥ 1 tahun: "1 tahun 3 bulan lagi"', () => {
    const result = countdownUnits(NOW + MS_PER_YEAR + 3 * MS_PER_MONTH + MS_PER_DAY, NOW)
    expect(result.text).toBe('1 tahun 3 bulan lagi')
    expect(result.isPast).toBe(false)
    expect(result.largestUnit).toBe('tahun')
  })

  it('≥ 1 bulan: "2 bulan 10 hari lagi"', () => {
    const result = countdownUnits(NOW + 2 * MS_PER_MONTH + 10 * MS_PER_DAY, NOW)
    expect(result.text).toBe('2 bulan 10 hari lagi')
    expect(result.largestUnit).toBe('bulan')
  })

  it('≥ 1 hari: "4 hari 6 jam lagi"', () => {
    const result = countdownUnits(NOW + 4 * MS_PER_DAY + 6 * MS_PER_HOUR, NOW)
    expect(result.text).toBe('4 hari 6 jam lagi')
    expect(result.largestUnit).toBe('hari')
  })

  it('≥ 1 jam: "3 jam 20 menit lagi"', () => {
    const result = countdownUnits(NOW + 3 * MS_PER_HOUR + 20 * MS_PER_MINUTE, NOW)
    expect(result.text).toBe('3 jam 20 menit lagi')
    expect(result.largestUnit).toBe('jam')
  })

  it('< 1 jam: "12 menit 30 detik lagi" (detik dipakai, sesuai PRD)', () => {
    const result = countdownUnits(NOW + 12 * MS_PER_MINUTE + 30 * MS_PER_SECOND, NOW)
    expect(result.text).toBe('12 menit 30 detik lagi')
    expect(result.largestUnit).toBe('menit')
  })

  it('< 1 menit: cuma detik ("45 detik lagi")', () => {
    expect(countdownUnits(NOW + 45 * MS_PER_SECOND, NOW).text).toBe('45 detik lagi')
  })

  it('batas tepat 1 tahun / 1 bulan / 1 hari / 1 jam / 1 menit', () => {
    expect(countdownUnits(NOW + MS_PER_YEAR, NOW).text).toBe('1 tahun lagi')
    expect(countdownUnits(NOW + MS_PER_MONTH, NOW).text).toBe('1 bulan lagi')
    expect(countdownUnits(NOW + MS_PER_DAY, NOW).text).toBe('1 hari lagi')
    expect(countdownUnits(NOW + MS_PER_HOUR, NOW).text).toBe('1 jam lagi')
    expect(countdownUnits(NOW + MS_PER_MINUTE, NOW).text).toBe('1 menit lagi')
  })

  it('lewat: "Sudah lewat 3 hari" + isPast true', () => {
    const result = countdownUnits(NOW - 3 * MS_PER_DAY, NOW)
    expect(result.text).toBe('Sudah lewat 3 hari')
    expect(result.isPast).toBe(true)
    expect(result.absoluteMs).toBe(3 * MS_PER_DAY)
  })

  it('lewat 2 bulan 5 hari', () => {
    expect(countdownUnits(NOW - (2 * MS_PER_MONTH + 5 * MS_PER_DAY), NOW).text).toBe(
      'Sudah lewat 2 bulan 5 hari',
    )
  })

  it('tepat pada target belum dianggap lewat', () => {
    const result = countdownUnits(NOW, NOW)
    expect(result.isPast).toBe(false)
    expect(result.text).toBe('0 detik lagi')
  })

  it('bagian yang bernilai nol dibuang (bukan "2 bulan 0 hari lagi")', () => {
    expect(countdownUnits(NOW + 2 * MS_PER_MONTH, NOW).text).toBe('2 bulan lagi')
    expect(countdownUnits(NOW + 1 * MS_PER_YEAR, NOW).text).toBe('1 tahun lagi')
  })
})

describe('sortedCountdownRows - sort F5', () => {
  it('paling dekat dulu', () => {
    const items = [
      countdown({ id: 'far', targetAt: NOW + 10 * MS_PER_DAY }),
      countdown({ id: 'near', targetAt: NOW + MS_PER_DAY }),
      countdown({ id: 'mid', targetAt: NOW + 5 * MS_PER_DAY }),
    ]

    expect(sortedCountdownRows(items, NOW).map((row) => row.countdown.id)).toEqual([
      'near',
      'mid',
      'far',
    ])
  })

  it('yang diarsipkan TIDAK ikut hitungan terdekat', () => {
    const archived = archiveCountdown(countdown({ id: 'archived', targetAt: NOW + 1 }), NOW)
    const items = [archived, countdown({ id: 'active', targetAt: NOW + 100 * MS_PER_DAY })]

    const rows = sortedCountdownRows(items, NOW)
    expect(rows.map((row) => row.countdown.id)).toEqual(['active'])
  })

  it('countdown yang sudah lewat tapi belum diarsipkan tetap tampil (PRD F5)', () => {
    const items = [
      countdown({ id: 'past', targetAt: NOW - MS_PER_DAY }),
      countdown({ id: 'future', targetAt: NOW + MS_PER_DAY }),
    ]

    const rows = sortedCountdownRows(items, NOW)
    expect(rows.map((row) => row.countdown.id)).toEqual(['past', 'future'])
    expect(rows[0]?.units.isPast).toBe(true)
  })

  it('setiap baris membawa teks unitnya (dihitung sekali per render)', () => {
    const rows = sortedCountdownRows([countdown({ id: 'x', targetAt: NOW + 2 * MS_PER_HOUR })], NOW)
    expect(rows[0]?.units.text).toBe('2 jam lagi')
  })

  it('tie-break id supaya urutan deterministik', () => {
    const items = [
      countdown({ id: 'b', targetAt: NOW + MS_PER_DAY }),
      countdown({ id: 'a', targetAt: NOW + MS_PER_DAY }),
    ]

    expect(sortedCountdownRows(items, NOW).map((row) => row.countdown.id)).toEqual(['a', 'b'])
  })
})

describe('topCountdowns - widget Overview F11 "3 teratas"', () => {
  it('mengambil tiga terdekat dan mengabaikan yang diarsipkan', () => {
    const items = [
      countdown({ id: 'a', targetAt: NOW + 1 * MS_PER_DAY }),
      countdown({ id: 'b', targetAt: NOW + 2 * MS_PER_DAY }),
      countdown({ id: 'c', targetAt: NOW + 3 * MS_PER_DAY }),
      countdown({ id: 'd', targetAt: NOW + 4 * MS_PER_DAY }),
      archiveCountdown(countdown({ id: 'arch', targetAt: NOW + 100 }), NOW),
    ]

    expect(topCountdowns(items, NOW, 3).map((row) => row.countdown.id)).toEqual(['a', 'b', 'c'])
  })

  it('limit 0 atau negatif menghasilkan daftar kosong', () => {
    const items = [countdown({ id: 'a', targetAt: NOW + MS_PER_DAY })]
    expect(topCountdowns(items, NOW, 0)).toEqual([])
    expect(topCountdowns(items, NOW, -1)).toEqual([])
  })

  it('tidak mengubah array input (murni)', () => {
    const items = [
      countdown({ id: 'b', targetAt: NOW + 2 * MS_PER_DAY }),
      countdown({ id: 'a', targetAt: NOW + MS_PER_DAY }),
    ]
    const before = items.map((item) => item.id)

    sortedCountdownRows(items, NOW)
    expect(items.map((item) => item.id)).toEqual(before)
  })
})
