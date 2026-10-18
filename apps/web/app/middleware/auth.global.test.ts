import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { RouteLocationNormalized } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_SESSION_STATE_KEYS } from '~/composables/useAuthSession'

import authGuard from './auth.global'

const { fetchSpy } = vi.hoisted(() => ({ fetchSpy: vi.fn() }))
const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('$fetch', () => fetchSpy)
mockNuxtImport('navigateTo', () => navigateToMock)

const SESSION = {
  user: { id: '018f2b3c-4d5e-7f80-9abc-def012345678', email: 'kamu@email.com' },
  device: { id: '018f2b3c-4d5e-7f80-9abc-def012345678', name: 'Chrome di Linux' },
  expiresAt: '2026-05-10T09:00:00.000Z',
}

/** Route minimal yang dibaca guard; sisanya (`params`, `matched`, …) tidak dipakai. */
const routeAt = (path: string, fullPath: string = path): RouteLocationNormalized =>
  ({ path, fullPath }) as RouteLocationNormalized

function sessionMissing(): void {
  fetchSpy.mockRejectedValue(
    Object.assign(new Error('401'), {
      status: 401,
      data: { error: { code: 'UNAUTHENTICATED', message: 'generik' } },
    }),
  )
}

function sessionAlive(): void {
  fetchSpy.mockResolvedValue({ data: SESSION })
}

describe('middleware auth.global', () => {
  beforeEach(() => {
    fetchSpy.mockReset()
    navigateToMock.mockReset()
    clearNuxtState(Object.values(AUTH_SESSION_STATE_KEYS))
  })

  it('tanpa sesi: /app/** dialihkan ke /login dengan tujuan asli sebagai redirect', async () => {
    sessionMissing()

    await authGuard(routeAt('/app/to-do', '/app/to-do?tanggal=2026-10-09'), routeAt('/'))

    expect(navigateToMock).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/app/to-do?tanggal=2026-10-09' },
    })
  })

  it('redirect hanya boleh path internal: tujuan di luar /app jatuh ke /app', async () => {
    sessionMissing()

    await authGuard(routeAt('/app/memo', 'https://evil.example/app'), routeAt('/'))

    expect(navigateToMock).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/app' },
    })
  })

  it('dengan sesi hidup: /app/** diloloskan', async () => {
    sessionAlive()

    await authGuard(routeAt('/app'), routeAt('/login'))

    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('dengan sesi hidup: /login dialihkan ke area app (tidak ada "login tapi masih di login")', async () => {
    sessionAlive()

    await authGuard(routeAt('/login'), routeAt('/'))

    expect(navigateToMock).toHaveBeenCalledWith('/app')
  })

  it('tanpa sesi: /login diloloskan (termasuk saat datang dari ?error=oauth)', async () => {
    sessionMissing()

    await authGuard(routeAt('/login', '/login?error=oauth'), routeAt('/'))

    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('route publik tidak memicu request sesi sama sekali', async () => {
    sessionMissing()

    await authGuard(routeAt('/'), routeAt('/'))

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(navigateToMock).not.toHaveBeenCalled()
  })
})
