import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watch } from 'vue'

import {
  resetLocalDataSessionForTest,
  useLocalData,
  type LocalDataState,
} from '~/composables/useLocalData'

import {
  TEST_USER_A,
  TEST_USER_B,
  createMemoryLocalSession,
  signIn,
} from '../../../tests/nuxt/local-session'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
// Klaim identitas kunci (`PUT /v1/keys/identity`) berjalan sebelum `ready`; jaringan dimock di batas.
mockNuxtImport('$fetch', () => async () => ({
  data: {
    kid: 'LBaTVGaXKfW710NOCIXptA',
    claimedAt: '2026-10-27T00:00:00.000Z',
    claimedByDeviceLabel: null,
  },
}))

/**
 * Security review #77 M1, akar masalah: `ensure()` menulis `status = 'loading'` di SETIAP panggilan,
 * termasuk saat sesi akun yang sedang login sudah terbuka. Plugin `sync.client.ts` memakai status itu
 * sebagai sinyal stop/attach controller, jadi satu reload = satu `GET /v1/sync/pull` tambahan.
 *
 * Test ini mengunci jalur cepatnya: sesi terbuka -> `ensure()` mengembalikan sesi yang sama tanpa
 * menyentuh state. Satu skenario per file karena state sesi disimpan di level modul.
 */

const openSession = vi.hoisted(() => vi.fn())

vi.mock('~/utils/storage/session', () => ({
  LocalKeyMissingError: class LocalKeyMissingError extends Error {},
  openLocalDataSession: openSession,
}))

const STATUS_IDLE: LocalDataState = {
  status: 'idle',
  isFreshKey: false,
  deviceId: null,
  userId: null,
  error: null,
}

beforeEach(() => {
  clearNuxtState(['localData', 'auth-session', 'auth-session-pending', 'auth-session-error'])
  useState<LocalDataState>('localData', () => ({ ...STATUS_IDLE }))
  resetLocalDataSessionForTest()
  openSession.mockReset()
  openSession.mockImplementation(async (options: { userId: string }) =>
    createMemoryLocalSession(options.userId),
  )
  signIn(TEST_USER_A)
})

/** Watcher test sebelumnya harus dilepas: `clearNuxtState` mengosongkan ref yang masih dipantaunya. */
const stops: Array<() => void> = []

afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  resetLocalDataSessionForTest()
})

describe('useLocalData.ensure: idempoten untuk sesi yang sudah terbuka', () => {
  it('panggilan kedua tidak menulis status dan tidak membuka penyimpanan lagi', async () => {
    const localData = useLocalData()
    const opened = await localData.ensure()
    expect(opened?.userId).toBe(TEST_USER_A)
    expect(localData.state.value.status).toBe('ready')

    const openCalls = openSession.mock.calls.length
    const statuses: string[] = []
    stops.push(
      watch(
        () => localData.state.value.status,
        (next) => statuses.push(next),
        { flush: 'sync' },
      ),
    )

    const again = await localData.ensure()

    expect(again).toBe(opened)
    expect(openSession.mock.calls.length).toBe(openCalls)
    // Inti perbaikan: tidak ada `loading` -> plugin sync tidak stop/attach ulang.
    expect(statuses).toEqual([])
    expect(localData.state.value.status).toBe('ready')
  })

  it('akun berganti: sesi lama dibuang dan penyimpanan dibuka untuk akun baru', async () => {
    const localData = useLocalData()
    await localData.ensure()
    signIn(TEST_USER_B)

    const session = await localData.ensure()

    expect(session?.userId).toBe(TEST_USER_B)
    expect(localData.current()?.userId).toBe(TEST_USER_B)
    expect(openSession).toHaveBeenLastCalledWith(expect.objectContaining({ userId: TEST_USER_B }))
    expect(localData.state.value).toMatchObject({ status: 'ready', userId: TEST_USER_B })
    expect(openSession.mock.calls.length).toBe(2)
  })
})
