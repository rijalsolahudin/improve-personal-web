import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import type { LocalDataSession } from '~/utils/storage/session'

import { resetPomodoroHistoryForTest, usePomodoro } from './usePomodoro'

/**
 * Gerbang rute untuk hidrasi riwayat Pomodoro.
 *
 * `usePomodoro()` dipanggil plugin global di SEMUA rute. Kalau riwayat dihidrasi di landing publik,
 * `hydrate()` -> `localData.ensure()` membuka IndexedDB + kripto di halaman yang tidak memakainya.
 * Test ini menjaga dua sisi: di luar `/app` = tidak menyentuh penyimpanan; masuk `/app` (belakangan
 * atau sejak awal) = tetap dihidrasi.
 *
 * Mock di BATAS modul (`useLocalData` = akses penyimpanan, `persistence` = baca record), bukan di
 * dalam composable, supaya yang diuji perilakunya, bukan detail implementasi.
 */

/** Rute di-mock di batas Nuxt: me-mount halaman `/app` sungguhan ikut memasang shell + pill timer. */
const route = reactive({ path: '/' })

mockNuxtImport('useRoute', () => () => route)

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

/** Cukup untuk lolos ke `loadFocusSessions`; isi sesi sendiri tidak dibaca di jalur ini. */
const LOCAL_SESSION = {
  userId: '00000000-0000-4000-8000-000000000001',
} as unknown as LocalDataSession

/**
 * Hanya state RIWAYAT yang dibersihkan antar kasus. State timer (`pomodoro`, `pomodoro-config`) sedang
 * dibaca pengamat plugin global; mengosongkannya membuat pengamat itu membaca `undefined`.
 */
const HISTORY_STATE_KEYS = ['pomodoro-history', 'pomodoro-history-status', 'pomodoro-history-error']

function enterApp(): void {
  route.path = '/app/pomodoro'
}

beforeEach(() => {
  route.path = '/'
  localStorage.clear()
  mocks.ensure.mockReset()
  mocks.loadFocusSessions.mockReset()
  mocks.persistFocusSession.mockReset()

  mocks.ensure.mockResolvedValue(LOCAL_SESSION)
  mocks.loadFocusSessions.mockResolvedValue([])
  mocks.persistFocusSession.mockResolvedValue(undefined)

  clearNuxtState(HISTORY_STATE_KEYS)
  resetPomodoroHistoryForTest()
})

describe('usePomodoro - gerbang rute riwayat', () => {
  it('di landing: tidak membuka penyimpanan dan status riwayat tetap idle', async () => {
    const pomodoro = usePomodoro()
    await flushPromises()

    expect(mocks.ensure).not.toHaveBeenCalled()
    expect(mocks.loadFocusSessions).not.toHaveBeenCalled()
    expect(pomodoro.historyStatus.value).toBe('idle')
    expect(pomodoro.history.value).toEqual([])
  })

  it('masuk /app setelah composable dibuat: hidrasi jalan tepat sekali, status ready', async () => {
    const pomodoro = usePomodoro()
    await flushPromises()
    expect(mocks.ensure).not.toHaveBeenCalled()

    enterApp()

    await vi.waitFor(() => expect(pomodoro.historyStatus.value).toBe('ready'))
    expect(mocks.ensure).toHaveBeenCalledTimes(1)
    expect(mocks.loadFocusSessions).toHaveBeenCalledTimes(1)
  })

  it('sudah di /app sebelum composable dibuat: hidrasi langsung', async () => {
    enterApp()

    const pomodoro = usePomodoro()

    await vi.waitFor(() => expect(pomodoro.historyStatus.value).toBe('ready'))
    expect(mocks.ensure).toHaveBeenCalledTimes(1)
    expect(mocks.loadFocusSessions).toHaveBeenCalledTimes(1)
  })

  it('tanpa window (SSR): tidak menyentuh penyimpanan walau di /app', async () => {
    enterApp()
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
