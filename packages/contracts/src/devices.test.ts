import { describe, expect, it } from 'vitest'

import {
  DEVICE_LIST_MAX,
  DEVICE_NAME_MAX_LENGTH,
  DEVICE_PLATFORMS,
  MAX_ACTIVE_DEVICES_PER_USER,
  deviceDtoSchema,
  deviceListResultSchema,
  deviceRevokeParamsSchema,
} from './devices.ts'

const DEVICE_ID = '018fabc1-def2-7abc-8def-0123456789ab'

function device(overrides: Record<string, unknown> = {}) {
  return {
    id: DEVICE_ID,
    name: 'HP Bayu',
    platform: 'android',
    createdAt: '2024-01-02T03:04:05.000Z',
    lastSeenAt: '2024-01-02T04:05:06.000Z',
    lastIpCity: 'Bandung',
    revokedAt: null,
    ...overrides,
  }
}

describe('deviceDtoSchema', () => {
  it('menerima DTO lengkap, termasuk lastIpCity/revokedAt bernilai null', () => {
    expect(deviceDtoSchema.safeParse(device()).success).toBe(true)
    expect(deviceDtoSchema.safeParse(device({ lastIpCity: null, revokedAt: null })).success).toBe(
      true,
    )
    expect(
      deviceDtoSchema.safeParse(device({ revokedAt: '2024-02-02T00:00:00.000Z' })).success,
    ).toBe(true)
  })

  it('mewajibkan field nullable ada - "tidak tahu" harus eksplisit, bukan field hilang', () => {
    expect(deviceDtoSchema.safeParse(device({ lastIpCity: undefined })).success).toBe(false)

    const { lastIpCity, ...tanpaCity } = device()
    expect(lastIpCity).toBe('Bandung')
    expect(deviceDtoSchema.safeParse(tanpaCity).success).toBe(false)
  })

  it('menolak id non-uuid, platform di luar enum, dan waktu bukan ISO UTC', () => {
    expect(deviceDtoSchema.safeParse(device({ id: 'device-1' })).success).toBe(false)
    expect(deviceDtoSchema.safeParse(device({ platform: 'linux' })).success).toBe(false)
    expect(deviceDtoSchema.safeParse(device({ lastSeenAt: 1_700_000_000_000 })).success).toBe(false)
    expect(deviceDtoSchema.safeParse(device({ createdAt: '2024-01-02' })).success).toBe(false)
  })

  it('men-trim nama dan menolak nama kosong / kepanjangan / berkarakter kontrol', () => {
    expect(deviceDtoSchema.parse(device({ name: '  HP Bayu  ' })).name).toBe('HP Bayu')
    expect(deviceDtoSchema.safeParse(device({ name: '   ' })).success).toBe(false)
    expect(
      deviceDtoSchema.safeParse(device({ name: 'x'.repeat(DEVICE_NAME_MAX_LENGTH + 1) })).success,
    ).toBe(false)
    expect(deviceDtoSchema.safeParse(device({ name: 'HP\nDua Baris' })).success).toBe(false)
  })

  it('menormalkan id jadi lowercase supaya perbandingan id web & mobile konsisten', () => {
    expect(deviceDtoSchema.parse(device({ id: DEVICE_ID.toUpperCase() })).id).toBe(DEVICE_ID)
  })

  it('menolak field asing, termasuk user_id dan flag internal', () => {
    expect(deviceDtoSchema.safeParse(device({ userId: DEVICE_ID })).success).toBe(false)
    expect(deviceDtoSchema.safeParse(device({ isCurrent: true })).success).toBe(false)
    expect(deviceDtoSchema.safeParse(device({ token: 'rahasia' })).success).toBe(false)
  })
})

describe('deviceListResultSchema', () => {
  it('menerima daftar perangkat dan membatasi panjangnya', () => {
    expect(deviceListResultSchema.safeParse({ devices: [device()] }).success).toBe(true)
    expect(deviceListResultSchema.safeParse({ devices: [] }).success).toBe(true)

    const kebanyakan = Array.from({ length: DEVICE_LIST_MAX + 1 }, () => device())
    expect(deviceListResultSchema.safeParse({ devices: kebanyakan }).success).toBe(false)
  })

  it('batas 10 perangkat aktif per user adalah keputusan server, bukan tebakan client', () => {
    expect(MAX_ACTIVE_DEVICES_PER_USER).toBe(10)
    expect(DEVICE_LIST_MAX).toBeGreaterThan(MAX_ACTIVE_DEVICES_PER_USER)
    expect([...DEVICE_PLATFORMS]).toEqual(['web', 'ios', 'android'])
  })
})

describe('deviceRevokeParamsSchema', () => {
  it('menerima id uuid dan menolak yang lain', () => {
    expect(deviceRevokeParamsSchema.parse({ id: DEVICE_ID }).id).toBe(DEVICE_ID)
    expect(deviceRevokeParamsSchema.safeParse({ id: 'all' }).success).toBe(false)
    expect(deviceRevokeParamsSchema.safeParse({}).success).toBe(false)
    // Kepemilikan device dicek di service; schema tidak menerima user_id sebagai jalan pintas.
    expect(deviceRevokeParamsSchema.safeParse({ id: DEVICE_ID, userId: DEVICE_ID }).success).toBe(
      false,
    )
  })
})
