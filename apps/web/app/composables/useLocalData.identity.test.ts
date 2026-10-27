import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SecureKeyMaterial, SecureKeyStore } from '@improve-personal/core'

import {
  KEY_IDENTITY_CONFLICT_MESSAGE,
  resetLocalDataSessionForTest,
  useLocalData,
  type LocalDataState,
} from '~/composables/useLocalData'

import { TEST_USER_A, createMemoryLocalSession, signIn } from '../../tests/nuxt/local-session'
import { TEST_KID_WIRE } from '../../tests/nuxt/record-key'

// Klaim KID dijalankan SEBELUM status `ready` (sync hanya mulai dari `ready`). Yang dikunci di sini:
// klaim sukses -> ready, konflik -> error yang jelas dan sesi TIDAK dipakai, dan klaim memakai KID
// milik sesi (bukan nilai lain).

const openSession = vi.hoisted(() => vi.fn())
const identityClaim = vi.hoisted(() => ({
  bodies: [] as unknown[],
  reply: (() => undefined) as () => unknown,
}))

// Jaringan dimock di batas: `$fetch` Nuxt dipakai gateway default di `useLocalData`.
mockNuxtImport('$fetch', () => async (_path: string, init?: { body?: unknown }) => {
  identityClaim.bodies.push(init?.body)
  return identityClaim.reply()
})

vi.mock('~/utils/storage/session', () => ({
  LocalKeyMissingError: class LocalKeyMissingError extends Error {},
  openLocalDataSession: openSession,
}))

const IDLE: LocalDataState = {
  status: 'idle',
  isFreshKey: false,
  deviceId: null,
  userId: null,
  error: null,
}

const CLAIMED = {
  data: { kid: TEST_KID_WIRE, claimedAt: '2026-10-27T00:00:00.000Z', claimedByDeviceLabel: null },
}

beforeEach(() => {
  // Web Locks tidak ada di happy-dom; `removeDeviceUnlock` memakainya (lock slot device).
  vi.stubGlobal('navigator', {
    ...navigator,
    locks: { request: async (_name: string, work: () => Promise<unknown>) => work() },
  })
  clearNuxtState(['localData', 'auth-session', 'auth-session-pending', 'auth-session-error'])
  useState<LocalDataState>('localData', () => ({ ...IDLE }))
  resetLocalDataSessionForTest()
  identityClaim.bodies = []
  identityClaim.reply = () => CLAIMED
  openSession.mockReset()
  openSession.mockImplementation(async (options: { userId: string }) =>
    createMemoryLocalSession(options.userId),
  )
  signIn(TEST_USER_A)
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetLocalDataSessionForTest()
})

const CONFLICT = () => {
  throw createError({
    statusCode: 409,
    data: {
      error: {
        code: 'KEY_IDENTITY_CONFLICT',
        message: 'x',
        details: { claimedAt: '2026-10-27T00:00:00.000Z', claimedByDeviceLabel: null },
      },
    },
  })
}

/** Penyimpan kunci in-memory dengan slot `device` yang sudah terisi (kunci yang baru ditulis sesi). */
function keyStoreWithDeviceSlot(): SecureKeyStore {
  const slots = new Map<string, SecureKeyMaterial>([['device', { kind: 'device', handle: {} }]])

  return {
    has: async (slot) => slots.has(slot),
    get: async (slot) => slots.get(slot) ?? null,
    put: async (slot, material) => {
      slots.set(slot, material)
    },
    remove: async (slot) => {
      slots.delete(slot)
    },
  }
}

describe('useLocalData.ensure: klaim identitas kunci', () => {
  it('klaim sukses (KID milik sesi) lalu status ready', async () => {
    const localData = useLocalData()

    const session = await localData.ensure()

    expect(session?.userId).toBe(TEST_USER_A)
    expect(localData.state.value.status).toBe('ready')
    expect(identityClaim.bodies).toEqual([{ kid: TEST_KID_WIRE }])
  })

  it('panggilan ensure berikutnya tidak mengklaim ulang', async () => {
    const localData = useLocalData()

    await localData.ensure()
    await localData.ensure()

    expect(identityClaim.bodies).toHaveLength(1)
  })

  it('409 pada perangkat dengan kunci mapan: tetap error, slot device TIDAK dihapus', async () => {
    const keyStore = keyStoreWithDeviceSlot()
    openSession.mockImplementation(async (options: { userId: string }) => ({
      ...createMemoryLocalSession(options.userId),
      isFreshKey: false,
      keyStore,
    }))
    identityClaim.reply = CONFLICT
    const localData = useLocalData()

    const session = await localData.ensure()

    expect(session).toBeNull()
    expect(localData.state.value.status).toBe('error')
    expect(localData.state.value.error).toBe(KEY_IDENTITY_CONFLICT_MESSAGE)
    expect(localData.current()).toBeNull()
    expect(await keyStore.has('device')).toBe(true)
  })

  it('409 pada kunci yang BARU dibuat: slot device dibuang dan status locked (layar pemulihan)', async () => {
    const keyStore = keyStoreWithDeviceSlot()
    openSession.mockImplementation(async (options: { userId: string }) => ({
      ...createMemoryLocalSession(options.userId),
      isFreshKey: true,
      keyStore,
    }))
    identityClaim.reply = CONFLICT
    const localData = useLocalData()

    const session = await localData.ensure()

    expect(session).toBeNull()
    expect(await keyStore.has('device')).toBe(false)
    expect(localData.state.value.status).toBe('locked')
    expect(localData.state.value.userId).toBe(TEST_USER_A)
    expect(localData.current()).toBeNull()
  })

  it('setelah dibuang, ensure berikutnya mulai dari slot kosong (tidak memakai ulang kunci lama)', async () => {
    const keyStore = keyStoreWithDeviceSlot()
    const slotsSeenAtOpen: boolean[] = []
    openSession.mockImplementation(async (options: { userId: string }) => {
      slotsSeenAtOpen.push(await keyStore.has('device'))

      return { ...createMemoryLocalSession(options.userId), isFreshKey: true, keyStore }
    })
    identityClaim.reply = CONFLICT
    const localData = useLocalData()

    await localData.ensure()
    await localData.ensure()

    // Pembukaan kedua melihat slot KOSONG (bukan kunci salah yang sama): jalur pemulihan bisa mengisinya.
    expect(slotsSeenAtOpen).toEqual([true, false])
  })

  it('error lain (mis. 500) juga menahan ready, dan boleh dicoba lagi', async () => {
    identityClaim.reply = () => {
      throw createError({ statusCode: 500 })
    }
    const localData = useLocalData()

    expect(await localData.ensure()).toBeNull()
    expect(localData.state.value.status).toBe('error')

    identityClaim.reply = () => CLAIMED
    expect((await localData.ensure())?.userId).toBe(TEST_USER_A)
    expect(localData.state.value.status).toBe('ready')
  })
})
