import { describe, expect, it } from 'vitest'

import {
  KEY_ENVELOPE_MAX_KDF_PARAMS_BYTES,
  KEY_ENVELOPE_MAX_WRAPPED_KEY_BASE64_LENGTH,
  KEY_SLOTS,
  KEY_TRANSFER_TTL_SECONDS,
  kdfParamsSchema,
  keyEnvelopeDtoSchema,
  keyEnvelopeListResultSchema,
  keyEnvelopePutInputSchema,
  keySlotSchema,
  keyTransferClaimParamsSchema,
  keyTransferClaimResultSchema,
  keyTransferCreateInputSchema,
  keyTransferCreateResultSchema,
  keyTransferIdSchema,
} from './keys.ts'

const WRAPPED_KEY = 'AAAA'

describe('keySlotSchema', () => {
  it('HANYA passkey: satu-satunya envelope yang boleh ada di server', () => {
    expect([...KEY_SLOTS]).toEqual(['passkey'])
    expect(keySlotSchema.safeParse('passkey').success).toBe(true)
  })

  it('slot `otp` dan `recovery` DITOLAK (ADR 10 & 11 - keputusan, bukan cadangan)', () => {
    expect(keySlotSchema.safeParse('otp').success).toBe(false)
    expect(keySlotSchema.safeParse('recovery').success).toBe(false)
    expect(keySlotSchema.safeParse('device').success).toBe(false)
    expect(keySlotSchema.safeParse('OTP').success).toBe(false)
  })
})

describe('keyEnvelopePutInputSchema', () => {
  it('menerima envelope passkey dengan kdfParams primitif', () => {
    expect(
      keyEnvelopePutInputSchema.safeParse({
        slot: 'passkey',
        wrappedKey: WRAPPED_KEY,
        kdfParams: { alg: 'argon2id', memoryKiB: 65536, iterations: 3, withSalt: true },
      }).success,
    ).toBe(true)
  })

  it('menolak wrappedKey yang kelewat besar', () => {
    const kebesaran = 'A'.repeat(KEY_ENVELOPE_MAX_WRAPPED_KEY_BASE64_LENGTH + 4)

    expect(
      keyEnvelopePutInputSchema.safeParse({
        slot: 'passkey',
        wrappedKey: kebesaran,
        kdfParams: {},
      }).success,
    ).toBe(false)
  })

  it('menolak wrappedKey yang bukan base64 standar', () => {
    expect(
      keyEnvelopePutInputSchema.safeParse({
        slot: 'passkey',
        wrappedKey: 'AAA',
        kdfParams: {},
      }).success,
    ).toBe(false)
  })

  it('menolak field asing (mis. user_id atau wrapped key mentah)', () => {
    expect(
      keyEnvelopePutInputSchema.safeParse({
        slot: 'passkey',
        wrappedKey: WRAPPED_KEY,
        kdfParams: {},
        userId: '018fabc1-def2-7abc-8def-0123456789ab',
      }).success,
    ).toBe(false)
    expect(
      keyEnvelopePutInputSchema.safeParse({
        slot: 'passkey',
        wrappedKey: WRAPPED_KEY,
        kdfParams: {},
        masterKey: 'raw',
      }).success,
    ).toBe(false)
  })
})

describe('kdfParamsSchema', () => {
  it('menerima objek primitif, termasuk kosong (mis. passkey PRF tanpa KDF)', () => {
    expect(kdfParamsSchema.safeParse({}).success).toBe(true)
    expect(kdfParamsSchema.safeParse({ alg: 'none', ok: true, rounds: 1 }).success).toBe(true)
  })

  it('menolak nilai bersarang dan jumlah field yang berlebihan', () => {
    expect(kdfParamsSchema.safeParse({ nested: { alg: 'argon2id' } }).success).toBe(false)
    expect(kdfParamsSchema.safeParse({ list: ['a'] }).success).toBe(false)

    const banyak = Object.fromEntries(
      Array.from({ length: 17 }, (_value, index) => [`kunci${index}`, 1]),
    )
    expect(kdfParamsSchema.safeParse(banyak).success).toBe(false)
  })

  it('menolak kdfParams yang melebihi batas byte di server.dbml', () => {
    const panjang = Object.fromEntries(
      Array.from({ length: 16 }, (_value, index) => [`kunci${index}`, 'x'.repeat(256)]),
    )

    expect(JSON.stringify(panjang).length).toBeGreaterThan(KEY_ENVELOPE_MAX_KDF_PARAMS_BYTES)
    expect(kdfParamsSchema.safeParse(panjang).success).toBe(false)
  })
})

describe('keyEnvelopeDtoSchema / keyEnvelopeListResultSchema', () => {
  it('menerima envelope yang dibaca client, dan maksimum satu per slot', () => {
    const envelope = {
      slot: 'passkey',
      wrappedKey: WRAPPED_KEY,
      kdfParams: { alg: 'argon2id' },
      updatedAt: '2024-01-02T03:04:05.678Z',
    }

    expect(keyEnvelopeDtoSchema.safeParse(envelope).success).toBe(true)
    expect(keyEnvelopeListResultSchema.safeParse({ envelopes: [envelope] }).success).toBe(true)
    expect(keyEnvelopeListResultSchema.safeParse({ envelopes: [envelope, envelope] }).success).toBe(
      false,
    )
  })
})

describe('transfer kunci', () => {
  it('TTL <= 2 menit dan ditentukan server, bukan client', () => {
    expect(KEY_TRANSFER_TTL_SECONDS).toBe(120)
    expect(
      keyTransferCreateInputSchema.safeParse({
        targetDeviceId: '018fabc1-def2-7abc-8def-0123456789ab',
        blob: WRAPPED_KEY,
        ttlSeconds: 600,
      }).success,
    ).toBe(false)
  })

  it('id transfer = string opak 128-bit (base64url 22 karakter), bukan UUID berurut', () => {
    expect(keyTransferIdSchema.safeParse('qN3r8xT1mL9vB2kD4sZ7uw').success).toBe(true)
    expect(keyTransferIdSchema.safeParse('018fabc1-def2-7abc-8def-0123456789ab').success).toBe(
      false,
    )
    expect(keyTransferIdSchema.safeParse('pendek').success).toBe(false)
    expect(keyTransferIdSchema.safeParse('a'.repeat(64)).success).toBe(false)
  })

  it('create: butuh perangkat target + blob, dan hasilnya id + expiresAt ISO', () => {
    expect(
      keyTransferCreateInputSchema.safeParse({
        targetDeviceId: '018fabc1-def2-7abc-8def-0123456789ab',
        blob: WRAPPED_KEY,
      }).success,
    ).toBe(true)
    expect(
      keyTransferCreateResultSchema.safeParse({
        id: 'qN3r8xT1mL9vB2kD4sZ7uw',
        expiresAt: '2024-01-02T03:04:05.678Z',
      }).success,
    ).toBe(true)
    expect(
      keyTransferCreateResultSchema.safeParse({
        id: 'qN3r8xT1mL9vB2kD4sZ7uw',
        expiresAt: 1_700_000_000_000,
      }).success,
    ).toBe(false)
  })

  it('claim: id dari path, hasilnya cuma blob', () => {
    expect(keyTransferClaimParamsSchema.safeParse({ id: 'qN3r8xT1mL9vB2kD4sZ7uw' }).success).toBe(
      true,
    )
    expect(keyTransferClaimResultSchema.safeParse({ blob: WRAPPED_KEY }).success).toBe(true)
    expect(keyTransferClaimResultSchema.safeParse({ blob: WRAPPED_KEY, userId: 'x' }).success).toBe(
      false,
    )
  })
})
