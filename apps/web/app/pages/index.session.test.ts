import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LandingPage from './index.vue'

/**
 * Regresi landing: rute publik `/` TIDAK boleh meminta sesi ke server.
 *
 * Pengunjung landing belum tentu login, dan middleware sengaja melewati rute publik supaya tidak ada
 * `GET /v1/auth/session` di sana. Plugin Pomodoro dulu memanggil `hydrate()` tanpa syarat di SEMUA
 * rute; `hydrate()` -> `localData.ensure()` -> `auth.ensureLoaded()` membuat request itu muncul lagi
 * setelah hidrasi, sekaligus menyeret chunk gateway auth ke halaman publik.
 *
 * Jaringan dimock di batas `$fetch` (bukan composable), jadi yang diuji adalah perilaku halaman.
 */
type FetchMock = (url: unknown, init?: unknown) => Promise<{ data: null }>

const { fetchSpy } = vi.hoisted(() => ({
  fetchSpy: vi.fn<FetchMock>(async () => ({ data: null })),
}))
mockNuxtImport('$fetch', () => fetchSpy)

function authRequests(): string[] {
  return fetchSpy.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.includes('/v1/auth/session'))
}

beforeEach(() => {
  fetchSpy.mockClear()
  clearNuxtState(['auth-session', 'auth-session-pending', 'auth-session-error', 'localData'])
})

describe('landing publik', () => {
  it('tidak memanggil GET /v1/auth/session saat dirender tanpa sesi', async () => {
    const wrapper = await mountSuspended(LandingPage)

    try {
      await flushPromises()
      // Beri kesempatan watcher/hidrasi app-level jalan, kalau ada yang salah memicunya.
      await new Promise((resolve) => setTimeout(resolve, 250))
      await flushPromises()

      expect(
        authRequests(),
        'landing memanggil GET /v1/auth/session - hidrasi Pomodoro tidak boleh jalan tanpa sesi',
      ).toEqual([])
    } finally {
      wrapper.unmount()
    }
  })
})
