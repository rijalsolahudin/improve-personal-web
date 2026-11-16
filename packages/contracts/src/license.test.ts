import { describe, expect, it } from 'vitest'

import {
  LICENSE_TOKEN_MAX_LENGTH,
  licenseTokenPayloadSchema,
  licenseTokenSchema,
  splitLicenseToken,
} from './license.ts'

const PAYLOAD = {
  v: 1,
  lid: '018f2c4e-0000-7000-8000-00000000000a',
  did: '018f2c4e-0000-7000-8000-0000000000d1',
  iat: 1_700_000_000,
  ed: 'standard',
}

describe('licenseTokenPayloadSchema', () => {
  it('menerima payload sah', () => {
    expect(licenseTokenPayloadSchema.safeParse(PAYLOAD).success).toBe(true)
  })

  it('menolak field asing (tidak ada tempat untuk email/PII)', () => {
    expect(licenseTokenPayloadSchema.safeParse({ ...PAYLOAD, email: 'a@b.c' }).success).toBe(false)
  })

  it('menolak versi lain', () => {
    expect(licenseTokenPayloadSchema.safeParse({ ...PAYLOAD, v: 2 }).success).toBe(false)
  })
})

describe('splitLicenseToken', () => {
  it('memecah `<payload>.<signature>` base64url', () => {
    expect(splitLicenseToken('YWJj.ZGVm')).toEqual({ signed: 'YWJj', signature: 'ZGVm' })
  })

  it.each(['', 'tanpa-titik', 'a.b.c', 'ab+c.def', 'abc.de=', 'abc.'])('menolak %j', (token) => {
    expect(splitLicenseToken(token)).toBeNull()
  })

  it('menolak token yang melewati batas panjang', () => {
    const long = `${'a'.repeat(LICENSE_TOKEN_MAX_LENGTH)}.b`
    expect(licenseTokenSchema.safeParse(long).success).toBe(false)
  })
})
