import type { CurrentSessionResult } from '@improve-personal/contracts'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocalDataSession } from '~/utils/storage/session'

import { resetPomodoroHistoryForTest, usePomodoro } from './usePomodoro'
import { AUTH_SESSION_STATE_KEYS, useAuthSession } from './useAuthSession'

/**
 * Gerbang sesi untuk hidrasi riwayat Pomodoro (regresi landing yang memanggil `GET /v1/auth/session`).
 *
 * `usePomodoro()` dipanggil plugin global di SEMUA rute. Kalau riwayat dihidrasi tanpa sesi,
 * `hydrate()` -> `localData.ensure()` -> `auth.ensureLoaded()` meminta sesi ke server dari halaman
 * publik - dan chunk gateway auth ikut masuk JS awal landing. Test ini menjaga dua sisi:
 * belum ada sesi = tidak menyentuh penyimpanan; sesi (yang muncul belakangan) = tetap dihidrasi.
 *
 * Mock di BATAS modul (`useLocalData` = akses penyimpanan, `persistence` = baca record), bukan di
 * dalam composable, supaya yang diuji perilakunya, bukan detail implementasi.
 */
const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  loadFocusSessions: vi.fn(),
  persistFocusSession: vi.fn(),
}))

vi.mock('./useLocalData', () => ({
  useLocalData: () => ({ ensure: mocks.ensure, current: () => null }),
}))

vi.mock('~/utils/pomodoro/persistence', () => ({
  loadFocusSessions: mocks.loadFocusSessions,
  persistFocusSession: mocks.persistFocusSession,
}))

const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'

const SESSION: CurrentSessionResult = {
  user: { id: USER_ID, email: 'kamu@email.com' },
  device: { id: USER_ID, name: 'Chrome di Linux' },
  expiresAt: '2027-05-10T09:00:00.000Z',
}

/** Cukup untuk lolos ke `loadFocusSessions`; isi sesi sendiri tidak dibaca di jalur ini. */
const LOCAL_SESSION = { userId: USER_ID } as unknown as LocalDataSession

const POMODORO_STATE_KEYS = [
  'pomodoro',
  'pomodoro-config',
  'pomodoro-target',
  'pomodoro-target-kind',
  'pomodoro-history',
  'pomodoro-history-status',
  'pomodoro-history-error',
  'pomodoro-sound',
  'pomodoro-notice',
]

function signIn(): void {
  useAuthSession().setSession(SESSION)
}

beforeEach(() => {
  localStorage.clear()
  mocks.ensure.mockReset()
  mocks.loadFocusSessions.mockReset()
  mocks.persistFocusSession.mockReset()

  mocks.ensure.mockResolvedValue(LOCAL_SESSION)
  mocks.loadFocusSessions.mockResolvedValue([])
  mocks.persistFocusSession.mockResolvedValue(undefined)

  clearNuxtState([...Object.values(AUTH_SESSION_STATE_KEYS), ...POMODORO_STATE_KEYS])
  resetPomodoroHistoryForTest()
})

describe('usePomodoro - gerbang sesi riwayat', () => {
  it('tanpa sesi: tidak membuka penyimpanan dan status riwayat tetap idle', async () => {
    const pomodoro = usePomodoro()
    await flushPromises()

    expect(mocks.ensure).not.toHaveBeenCalled()
    expect(mocks.loadFocusSessions).not.toHaveBeenCalled()
    expect(pomodoro.historyStatus.value).toBe('idle')
    expect(pomodoro.history.value).toEqual([])
  })

  it('sesi muncul setelah composable dibuat: hidrasi jalan tepat sekali, status ready', async () => {
    const pomodoro = usePomodoro()
    await flushPromises()
    expect(mocks.ensure).not.toHaveBeenCalled()

    signIn()

    await vi.waitFor(() => expect(pomodoro.historyStatus.value).toBe('ready'))
    expect(mocks.ensure).toHaveBeenCalledTimes(1)
    expect(mocks.loadFocusSessions).toHaveBeenCalledTimes(1)
  })

  it('sesi sudah ada sebelum composable dibuat: hidrasi langsung seperti sebelumnya', async () => {
    signIn()

    const pomodoro = usePomodoro()

    await vi.waitFor(() => expect(pomodoro.historyStatus.value).toBe('ready'))
    expect(mocks.ensure).toHaveBeenCalledTimes(1)
    expect(mocks.loadFocusSessions).toHaveBeenCalledTimes(1)
  })

  it('tanpa window (SSR): tidak menyentuh penyimpanan walau sesi diketahui', async () => {
    signIn()
    vi.stubGlobal('window', undefined)

    try {
      const pomodoro = usePomodoro()
      await flushPromises()

      expect(mocks.ensure).not.toHaveBeenCalled()
      expect(pomodoro.historyStatus.value).toBe('idle')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
