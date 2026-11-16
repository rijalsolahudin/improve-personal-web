import { describe, expect, it } from 'vitest'

import { buyerMobileSchema, checkoutInputSchema, checkoutResultSchema } from './purchase.ts'

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
  const valid = { name: 'Rina', email: 'Rina@Email.com ', mobile: '081234567890' }

  it('menormalkan email dan nomor', () => {
    const parsed = checkoutInputSchema.parse({ ...valid, mobile: '0812-3456-7890' })
    expect(parsed.email).toBe('rina@email.com')
    expect(parsed.mobile).toBe('081234567890')
  })

  it('menolak field asing (mis. harga dari klien)', () => {
    expect(checkoutInputSchema.safeParse({ ...valid, amount: 1 }).success).toBe(false)
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
