import { describe, expect, it } from 'vitest'

import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_MONTH, MS_PER_YEAR } from './duration.ts'
import { compareByDeadline, remainingTime } from './remaining-time.ts'

/**
 * AC T5: "Format sisa waktu sesuai F2 (unit test batas: 59 mnt, 1 jam, 1 hari, 1 bulan, lewat)".
 *
 * Semua test memakai `nowMs = 0` supaya batasnya bisa dibaca langsung sebagai durasi.
 */

const NOW = 1_000_000_000_000

describe('remainingTime', () => {
  it('batas 59 menit: masih menit, tanpa bagian kedua', () => {
    const result = remainingTime(NOW + 59 * MS_PER_MINUTE, NOW)
    expect(result.text).toBe('59 menit')
    expect(result.isOverdue).toBe(false)
    expect(result.largestUnit).toBe('menit')
  })

  it('batas 1 jam: naik ke jam + menit', () => {
    const result = remainingTime(NOW + MS_PER_HOUR, NOW)
    expect(result.text).toBe('1 jam')
    expect(result.largestUnit).toBe('jam')
  })

  it('1 jam 5 menit menampilkan dua satuan', () => {
    expect(remainingTime(NOW + MS_PER_HOUR + 5 * MS_PER_MINUTE, NOW).text).toBe('1 jam 5 menit')
  })

  it('batas 1 hari: naik ke hari + jam (24 jam tepat = 1 hari)', () => {
    const result = remainingTime(NOW + MS_PER_DAY, NOW)
    expect(result.text).toBe('1 hari')
    expect(result.largestUnit).toBe('hari')
  })

  it('23 jam 59 menit masih jam, belum hari', () => {
    const result = remainingTime(NOW + MS_PER_DAY - MS_PER_MINUTE, NOW)
    expect(result.text).toBe('23 jam 59 menit')
    expect(result.largestUnit).toBe('jam')
  })

  it('batas 1 bulan: naik ke bulan + hari (30 hari tepat = 1 bulan)', () => {
    const result = remainingTime(NOW + MS_PER_MONTH, NOW)
    expect(result.text).toBe('1 bulan')
    expect(result.largestUnit).toBe('bulan')
  })

  it('29 hari 23 jam masih hari, belum bulan', () => {
    const result = remainingTime(NOW + MS_PER_MONTH - MS_PER_HOUR, NOW)
    expect(result.text).toBe('29 hari 23 jam')
    expect(result.largestUnit).toBe('hari')
  })

  it('F2 contoh: "2 bulan 3 hari"', () => {
    expect(remainingTime(NOW + 2 * MS_PER_MONTH + 3 * MS_PER_DAY, NOW).text).toBe('2 bulan 3 hari')
  })

  it('F2 contoh: "5 hari 4 jam"', () => {
    expect(remainingTime(NOW + 5 * MS_PER_DAY + 4 * MS_PER_HOUR, NOW).text).toBe('5 hari 4 jam')
  })

  it('F2 contoh: "3 jam 12 menit"', () => {
    expect(remainingTime(NOW + 3 * MS_PER_HOUR + 12 * MS_PER_MINUTE, NOW).text).toBe(
      '3 jam 12 menit',
    )
  })

  it('F2 contoh: "8 menit" (tanpa detik)', () => {
    expect(remainingTime(NOW + 8 * MS_PER_MINUTE, NOW).text).toBe('8 menit')
  })

  it('batas 1 tahun: naik ke tahun + bulan', () => {
    const result = remainingTime(NOW + MS_PER_YEAR, NOW)
    expect(result.text).toBe('1 tahun')
    expect(result.largestUnit).toBe('tahun')
  })

  it('kurang dari 1 menit: "kurang dari 1 menit", bukan "0 menit"', () => {
    expect(remainingTime(NOW + 30_000, NOW).text).toBe('kurang dari 1 menit')
    expect(remainingTime(NOW, NOW).text).toBe('kurang dari 1 menit')
  })

  it('lewat: "Terlambat 2 jam" dan isOverdue true', () => {
    const result = remainingTime(NOW - 2 * MS_PER_HOUR, NOW)
    expect(result.text).toBe('Terlambat 2 jam')
    expect(result.isOverdue).toBe(true)
    expect(result.largestUnit).toBe('jam')
    expect(result.absoluteMs).toBe(2 * MS_PER_HOUR)
  })

  it('lewat 3 hari 5 jam menampilkan dua satuan', () => {
    expect(remainingTime(NOW - (3 * MS_PER_DAY + 5 * MS_PER_HOUR), NOW).text).toBe(
      'Terlambat 3 hari 5 jam',
    )
  })

  it('lewat kurang dari 1 menit tidak menghasilkan teks kosong', () => {
    expect(remainingTime(NOW - 30_000, NOW).text).toBe('Terlambat kurang dari 1 menit')
  })

  it('tepat sama dengan deadline dianggap belum lewat', () => {
    const result = remainingTime(NOW, NOW)
    expect(result.isOverdue).toBe(false)
  })

  it('deterministik: panggilan berulang menghasilkan hasil identik', () => {
    const first = remainingTime(NOW + 123_456_789, NOW)
    const second = remainingTime(NOW + 123_456_789, NOW)
    expect(first).toEqual(second)
  })
})

describe('compareByDeadline', () => {
  it('deadline terdekat dulu; yang tanpa deadline paling belakang', () => {
    const items = [
      { id: 'c', deadlineAt: null },
      { id: 'a', deadlineAt: 300 },
      { id: 'b', deadlineAt: 100 },
    ]

    expect(
      items
        .slice()
        .sort(compareByDeadline)
        .map((item) => item.id),
    ).toEqual(['b', 'a', 'c'])
  })

  it('tie-break memakai id supaya urutan sama di web & mobile', () => {
    const items = [
      { id: 'z', deadlineAt: 100 },
      { id: 'a', deadlineAt: 100 },
    ]

    expect(
      items
        .slice()
        .sort(compareByDeadline)
        .map((item) => item.id),
    ).toEqual(['a', 'z'])
  })

  it('dua task tanpa deadline diurut berdasarkan id', () => {
    const items = [
      { id: 'b', deadlineAt: null },
      { id: 'a', deadlineAt: null },
    ]

    expect(
      items
        .slice()
        .sort(compareByDeadline)
        .map((item) => item.id),
    ).toEqual(['a', 'b'])
  })
})
