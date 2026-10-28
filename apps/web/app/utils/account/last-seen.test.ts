import { describe, expect, it } from 'vitest'

import { formatLastSeen } from './last-seen'

const NOW = Date.parse('2026-10-28T12:00:00.000Z')

describe('formatLastSeen', () => {
  it.each([
    ['2026-10-28T11:59:30.000Z', 'baru saja'],
    ['2026-10-28T12:05:00.000Z', 'baru saja'],
    ['2026-10-28T11:45:00.000Z', '15 menit yang lalu'],
    ['2026-10-28T09:00:00.000Z', '3 jam yang lalu'],
    ['2026-10-27T11:00:00.000Z', 'kemarin'],
    ['2026-10-24T12:00:00.000Z', '4 hari yang lalu'],
  ])('%s -> %s', (iso, expected) => {
    expect(formatLastSeen(iso, NOW)).toBe(expected)
  })

  it('lewat seminggu memakai tanggal, bukan hitungan hari', () => {
    expect(formatLastSeen('2026-10-01T12:00:00.000Z', NOW)).toBe('1 Okt 2026')
  })
})
