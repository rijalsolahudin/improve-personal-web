import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SecureKeyStore } from '@improve-personal/core'

import type { JsonFetch } from '~/utils/http/json-fetch'

import { AUTH_SESSION_STATE_KEYS } from './useAuthSession'
import { useAccount } from './useAccount'

/**
 * Penanda "perangkat ini" di halaman Akun.
 *
 * Regresi: `isCurrent` dulu dibandingkan dengan `deviceId` sesi data LOKAL (id HLC perangkat), yang
 * tidak pernah sama dengan id baris `devices` di server - jadi tidak ada perangkat yang bertanda
 * "perangkat ini". Id yang benar ada di sesi auth (`session.device.id`).
 */

const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const SERVER_DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d1'
const OTHER_DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d2'
const LOCAL_HLC_DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000aa'

const ensure = vi.hoisted(() => vi.fn())
vi.mock('~/composables/useLocalData', () => ({ useLocalData: () => ({ ensure }) }))

const emptyKeyStore: SecureKeyStore = {
  has: async () => false,
  put: async () => undefined,
  get: async () => null,
  remove: async () => undefined,
}

function device(id: string) {
  return {
    id,
    name: 'Chrome di Linux',
    platform: 'web',
    createdAt: '2026-10-20T00:00:00.000Z',
    lastSeenAt: '2026-10-27T00:00:00.000Z',
    lastIpCity: null,
    revokedAt: null,
  }
}

const request = vi.fn<JsonFetch>(async (path) => {
  if (path === '/v1/devices') {
    return { data: { devices: [device(OTHER_DEVICE_ID), device(SERVER_DEVICE_ID)] } }
  }
  throw new Error(`request tak terduga: ${path}`)
})

beforeEach(() => {
  ensure.mockResolvedValue({ deviceId: LOCAL_HLC_DEVICE_ID, keyStore: emptyKeyStore })
  useState(AUTH_SESSION_STATE_KEYS.session).value = {
    user: { id: USER_ID, email: 'a@contoh.id' },
    device: { id: SERVER_DEVICE_ID, name: 'Chrome di Linux' },
    expiresAt: '2026-11-27T00:00:00.000Z',
  }
})

afterEach(() => {
  useState(AUTH_SESSION_STATE_KEYS.session).value = null
  useState('accountDevices').value = []
  request.mockClear()
})

describe('useAccount: penanda perangkat ini', () => {
  it('menandai perangkat yang id-nya sama dengan perangkat di sesi auth', async () => {
    const account = useAccount({ request, keyStore: emptyKeyStore })

    await account.load()

    const marked = account.devices.value.filter((row) => row.isCurrent).map((row) => row.id)
    expect(marked).toEqual([SERVER_DEVICE_ID])
  })

  it('tanpa sesi auth, tidak ada perangkat yang ditandai', async () => {
    useState(AUTH_SESSION_STATE_KEYS.session).value = null
    const account = useAccount({ request, keyStore: emptyKeyStore })

    await account.load()

    expect(account.devices.value.some((row) => row.isCurrent)).toBe(false)
  })
})
