import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LOGIN_PATH } from '~/utils/features'

import type { AuthGateway } from './auth/gateway'
import { AUTH_SESSION_STATE_KEYS, useAuthSession } from './useAuthSession'
import { clearAppStorage, useLogout } from './useLogout'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

const SESSION_DTO = {
  user: { id: '018f2b3c-4d5e-7f80-9abc-def012345678', email: 'kamu@email.com' },
  device: { id: '018f2b3c-4d5e-7f80-9abc-def012345678', name: 'Chrome di Linux' },
  expiresAt: '2026-05-10T09:00:00.000Z',
  client: 'web' as const,
}

function fakeGateway(overrides: Partial<AuthGateway> = {}): AuthGateway {
  return {
    requestEmailOtp: vi.fn(async () => {}),
    verifyEmailOtp: vi.fn(async () => SESSION_DTO),
    startGoogleLogin: vi.fn(async () => {}),
    currentSession: vi.fn(async () => null),
    signOut: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('clearAppStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('menghapus key app (ip-*) saja', () => {
    localStorage.setItem('ip-theme', 'ungu')
    localStorage.setItem('ip-style', 'tegas')
    localStorage.setItem('ip-deco', '[]')
    localStorage.setItem('other-site', 'keep')

    clearAppStorage(localStorage)

    expect(localStorage.getItem('ip-theme')).toBeNull()
    expect(localStorage.getItem('ip-style')).toBeNull()
    expect(localStorage.getItem('ip-deco')).toBeNull()
    expect(localStorage.getItem('other-site')).toBe('keep')
  })
})

describe('useLogout', () => {
  beforeEach(() => {
    localStorage.clear()
    navigateToMock.mockReset()
    clearNuxtState(Object.values(AUTH_SESSION_STATE_KEYS))
  })

  it('cabut sesi di server dulu, baru bersihkan client, lalu reload ke /login', async () => {
    const events: string[] = []
    const gateway = fakeGateway({
      signOut: vi.fn(async () => {
        events.push('signOut')
      }),
    })
    navigateToMock.mockImplementation(async () => {
      events.push('navigate')
    })
    localStorage.setItem('ip-theme', 'ungu')
    useAuthSession(gateway).setSession(SESSION_DTO)

    await useLogout(gateway).logout()

    expect(gateway.signOut).toHaveBeenCalledTimes(1)
    // Urutannya penting: pencabutan sesi tidak bisa diulang setelah state client dibuang.
    expect(events).toEqual(['signOut', 'navigate'])
    expect(useAuthSession(gateway).session.value).toBeNull()
    expect(localStorage.getItem('ip-theme')).toBeNull()
    expect(navigateToMock).toHaveBeenCalledWith(LOGIN_PATH, { external: true, replace: true })
  })

  it('signOut gagal (mis. offline): user tetap keluar dan state lokal tetap dibersihkan', async () => {
    const gateway = fakeGateway({
      signOut: vi.fn(async () => {
        throw new Error('offline')
      }),
    })
    useAuthSession(gateway).setSession(SESSION_DTO)

    await useLogout(gateway).logout()

    expect(useAuthSession(gateway).session.value).toBeNull()
    expect(navigateToMock).toHaveBeenCalledWith(LOGIN_PATH, { external: true, replace: true })
  })
})
