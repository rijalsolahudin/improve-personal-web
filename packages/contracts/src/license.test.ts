import { describe, expect, it } from 'vitest'

import {
  LICENSE_TOKEN_MAX_LENGTH,
  deviceSignPublicKeySchema,
  licenseRefreshInputSchema,
  licenseTokenPayloadSchema,
  licenseTokenRequestSchema,
  licenseTokenSchema,
  splitLicenseToken,
} from './license.ts'

const PAYLOAD = {
  v: 2,
  lid: '018f2c4e-0000-7000-8000-00000000000a',
  did: '018f2c4e-0000-7000-8000-0000000000d1',
  iat: 1_700_000_000,
  ed: 'standard',
  plan: 'yearly',
  exp: 1_731_536_000,
}

describe('licenseTokenPayloadSchema', () => {
  it('menerima payload sah', () => {
    expect(licenseTokenPayloadSchema.safeParse(PAYLOAD).success).toBe(true)
  })

  it('menolak field asing (tidak ada tempat untuk email/PII)', () => {
    expect(licenseTokenPayloadSchema.safeParse({ ...PAYLOAD, email: 'a@b.c' }).success).toBe(false)
  })

  it('lifetime = exp null', () => {
    const lifetime = { ...PAYLOAD, plan: 'lifetime', exp: null }
    expect(licenseTokenPayloadSchema.safeParse(lifetime).success).toBe(true)
  })

  it('menolak token v1 (sekali beli, tanpa plan/exp)', () => {
    const v1 = { v: 1, lid: PAYLOAD.lid, did: PAYLOAD.did, iat: PAYLOAD.iat, ed: PAYLOAD.ed }
    expect(licenseTokenPayloadSchema.safeParse(v1).success).toBe(false)
  })

  it('menolak paket tak dikenal', () => {
    expect(licenseTokenPayloadSchema.safeParse({ ...PAYLOAD, plan: 'weekly' }).success).toBe(false)
  })
})

describe('licenseRefreshInputSchema', () => {
  it('hanya menerima `token`', () => {
    expect(licenseRefreshInputSchema.safeParse({ token: 'YWJj.ZGVm' }).success).toBe(true)
    expect(licenseRefreshInputSchema.safeParse({ token: 'YWJj.ZGVm', lid: 'x' }).success).toBe(
      false,
    )
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

describe('licenseTokenRequestSchema', () => {
  // 32 byte nol: 43 karakter + satu `=`.
  const PUBLIC_KEY = `${'A'.repeat(43)}=`

  it('menerima public key Ed25519 32 byte', () => {
    expect(licenseTokenRequestSchema.parse({ deviceSignPk: PUBLIC_KEY })).toEqual({
      deviceSignPk: PUBLIC_KEY,
    })
  })

  it('toleran: tanpa public key (client lama) tetap sah', () => {
    expect(licenseTokenRequestSchema.safeParse({}).success).toBe(true)
  })

  it('menolak field asing', () => {
    const body = { deviceSignPk: PUBLIC_KEY, email: 'a@b.c' }
    expect(licenseTokenRequestSchema.safeParse(body).success).toBe(false)
  })

  it.each([
    ['kependekan (31 byte)', `${'A'.repeat(41)}==`],
    ['kepanjangan (33 byte)', 'A'.repeat(44)],
    ['bukan base64 standar', `${'-'.repeat(43)}=`],
    ['kosong', ''],
  ])('menolak public key %s', (_label, value) => {
    expect(deviceSignPublicKeySchema.safeParse(value).success).toBe(false)
  })
})
