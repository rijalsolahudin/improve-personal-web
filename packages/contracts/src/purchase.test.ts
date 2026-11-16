import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LICENSE_PLAN,
  LICENSE_PLANS,
  LICENSE_PLAN_IDS,
  buyerMobileSchema,
  checkoutInputSchema,
  checkoutResultSchema,
} from './purchase.ts'

describe('LICENSE_PLANS', () => {
  it('harga ADR 16', () => {
    expect(LICENSE_PLANS).toEqual({
      monthly: { priceIdr: 19_000, durationDays: 30 },
      yearly: { priceIdr: 99_000, durationDays: 365 },
      lifetime: { priceIdr: 249_000, durationDays: null },
    })
  })

  it('setiap id paket punya harga, dan paket default termasuk di dalamnya', () => {
    expect(Object.keys(LICENSE_PLANS).sort()).toEqual([...LICENSE_PLAN_IDS].sort())
    expect(LICENSE_PLAN_IDS).toContain(DEFAULT_LICENSE_PLAN)
  })
})

describe('buyerMobileSchema', () => {
  it.each(['081234567890', '+6281234567890', '6281234567890', '0812-3456-7890', ' 0812 3456 789 '])(
    'menerima %j',
    (value) => {
      expect(buyerMobileSchema.safeParse(value).success).toBe(true)
    },
  )

  it.each(['', '12345', '0212345678', 'abc', '+1 555 0100'])('menolak %j', (value) => {
    expect(buyerMobileSchema.safeParse(value).success).toBe(false)
  })
})

describe('checkoutInputSchema', () => {
  const valid = { name: 'Rina', email: 'Rina@Email.com ', mobile: '081234567890', plan: 'yearly' }

  it('menormalkan email dan nomor', () => {
    const parsed = checkoutInputSchema.parse({ ...valid, mobile: '0812-3456-7890' })
    expect(parsed.email).toBe('rina@email.com')
    expect(parsed.mobile).toBe('081234567890')
  })

  it('menolak field asing (mis. harga dari klien)', () => {
    expect(checkoutInputSchema.safeParse({ ...valid, amount: 1 }).success).toBe(false)
  })

  it('paket wajib dan harus dikenal', () => {
    expect(checkoutInputSchema.safeParse({ ...valid, plan: undefined }).success).toBe(false)
    expect(checkoutInputSchema.safeParse({ ...valid, plan: 'weekly' }).success).toBe(false)
  })
})

describe('checkoutResultSchema', () => {
  it('hanya menerima link https', () => {
    expect(checkoutResultSchema.safeParse({ paymentUrl: 'https://mayar.link/x' }).success).toBe(
      true,
    )
    expect(checkoutResultSchema.safeParse({ paymentUrl: 'http://mayar.link/x' }).success).toBe(
      false,
    )
    expect(checkoutResultSchema.safeParse({ paymentUrl: 'javascript:alert(1)' }).success).toBe(
      false,
    )
  })
})
