import { describe, expect, it } from 'vitest'

import { LICENSE_PRICE_LABEL, formatRupiah } from './price'

describe('formatRupiah', () => {
  it.each([
    [99_000, 'Rp99.000'],
    [1_000, 'Rp1.000'],
    [1_250_000, 'Rp1.250.000'],
    [500, 'Rp500'],
  ])('%d -> %s', (amount, expected) => {
    expect(formatRupiah(amount)).toBe(expected)
  })

  it('label harga lisensi = Rp99.000', () => {
    expect(LICENSE_PRICE_LABEL).toBe('Rp99.000')
  })
})
