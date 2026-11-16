import { describe, expect, it } from 'vitest'

import {
  YEARLY_PER_MONTH_LABEL,
  YEARLY_SAVING_PERCENT,
  formatRupiah,
  planFromQuery,
  planPriceLabel,
  purchasePathFor,
} from './price'

describe('formatRupiah', () => {
  it.each([
    [99_000, 'Rp99.000'],
    [1_000, 'Rp1.000'],
    [1_250_000, 'Rp1.250.000'],
    [500, 'Rp500'],
  ])('%d -> %s', (amount, expected) => {
    expect(formatRupiah(amount)).toBe(expected)
  })
})

describe('paket lisensi', () => {
  it('label harga per paket (ADR 16)', () => {
    expect(planPriceLabel('monthly')).toBe('Rp19.000')
    expect(planPriceLabel('yearly')).toBe('Rp99.000')
    expect(planPriceLabel('lifetime')).toBe('Rp249.000')
  })

  it('tahunan hemat 57% dibanding 12x bulanan', () => {
    expect(YEARLY_SAVING_PERCENT).toBe(57)
    expect(YEARLY_PER_MONTH_LABEL).toBe('Rp8.250')
  })

  it.each([
    ['monthly', 'monthly'],
    ['lifetime', 'lifetime'],
    [undefined, 'yearly'],
    ['weekly', 'yearly'],
    [['monthly'], 'yearly'],
  ])('planFromQuery(%j) = %s', (value, expected) => {
    expect(planFromQuery(value)).toBe(expected)
  })

  it('link beli membawa paket', () => {
    expect(purchasePathFor('lifetime')).toBe('/beli?plan=lifetime')
  })
})
