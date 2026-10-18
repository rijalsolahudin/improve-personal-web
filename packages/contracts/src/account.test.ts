import { describe, expect, it } from 'vitest'

import { OTP_PURPOSES, deleteAccountInputSchema, otpPurposeSchema } from './account.ts'

describe('otpPurposeSchema', () => {
  it('hanya login dan delete_account (nilai enum `otp_purpose` di server.dbml)', () => {
    expect([...OTP_PURPOSES]).toEqual(['login', 'delete_account'])
    expect(otpPurposeSchema.safeParse('login').success).toBe(true)
    expect(otpPurposeSchema.safeParse('delete_account').success).toBe(true)
  })

  it('menolak tujuan lain, termasuk yang terdengar masuk akal', () => {
    for (const invalid of ['reset_password', 'signup', 'delete', 'LOGIN']) {
      expect(otpPurposeSchema.safeParse(invalid).success, `harus ditolak: ${invalid}`).toBe(false)
    }
  })
})

describe('deleteAccountInputSchema', () => {
  it('menerima email + kode OTP 6 digit, dan menormalkan emailnya', () => {
    expect(
      deleteAccountInputSchema.parse({ email: '  Bayu@Example.com ', code: '777777' }),
    ).toEqual({ email: 'bayu@example.com', code: '777777' })
  })

  it('menolak kode yang bukan 6 digit dan email tak valid', () => {
    expect(deleteAccountInputSchema.safeParse({ email: 'a@b.com', code: '12345' }).success).toBe(
      false,
    )
    expect(deleteAccountInputSchema.safeParse({ email: 'a@b.com', code: 'abcdef' }).success).toBe(
      false,
    )
    expect(
      deleteAccountInputSchema.safeParse({ email: 'bukan-email', code: '777777' }).success,
    ).toBe(false)
  })

  it('menolak body tanpa kode / tanpa email - tidak ada jalur hapus tanpa bukti kepemilikan', () => {
    expect(deleteAccountInputSchema.safeParse({ email: 'a@b.com' }).success).toBe(false)
    expect(deleteAccountInputSchema.safeParse({ code: '777777' }).success).toBe(false)
    expect(deleteAccountInputSchema.safeParse({}).success).toBe(false)
  })

  it('menolak field asing: id user maupun flag paksa dari client', () => {
    expect(
      deleteAccountInputSchema.safeParse({
        email: 'a@b.com',
        code: '777777',
        userId: '018fabc1-def2-7abc-8def-0123456789ab',
      }).success,
    ).toBe(false)
    expect(
      deleteAccountInputSchema.safeParse({ email: 'a@b.com', code: '777777', confirm: 'force' })
        .success,
    ).toBe(false)
  })
})
