import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'

import { LICENSE_STATE_KEYS } from '~/composables/useLicense'
import { LICENSE_STORAGE_KEY } from '~/utils/license/token'

import licenseGuard from './license.global'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

/** Kripto diuji di `utils/license/token.test.ts`; di sini cukup sah/tidak sah. */
const VALID_TOKEN = 'token-sah'
vi.mock('~/utils/license/token', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/license/token')>()),
  verifyLicenseToken: vi.fn(async (token: string) =>
    token === VALID_TOKEN
      ? {
          v: 1,
          lid: '018f2b3c-4d5e-7f80-9abc-def01234567a',
          did: '018f2b3c-4d5e-7f80-9abc-def01234567d',
          iat: 1,
          ed: 'standard',
        }
      : null,
  ),
}))

function routeTo(fullPath: string): RouteLocationNormalized {
  const path = fullPath.split('?')[0] ?? fullPath
  return { path, fullPath } as RouteLocationNormalized
}

function runGuard(fullPath: string): unknown {
  return licenseGuard(routeTo(fullPath), routeTo('/'))
}

beforeEach(() => {
  navigateToMock.mockReset()
  clearNuxtState(Object.values(LICENSE_STATE_KEYS))
  localStorage.clear()
})

describe('gerbang lisensi /app (ADR 15)', () => {
  it('tanpa token -> ke /login dengan tujuan asli', async () => {
    await runGuard('/app/to-do')

    expect(navigateToMock).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/app/to-do' },
    })
  })

  it('token palsu/rusak -> tetap ke /login', async () => {
    localStorage.setItem(LICENSE_STORAGE_KEY, 'token-palsu')

    await runGuard('/app')

    expect(navigateToMock).toHaveBeenCalledTimes(1)
  })

  it('token sah -> app terbuka, tanpa jaringan', async () => {
    localStorage.setItem(LICENSE_STORAGE_KEY, VALID_TOKEN)

    await runGuard('/app/journal')

    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it.each(['/', '/login', '/applikasi'])('rute di luar /app (%s) tidak dijaga', async (path) => {
    await runGuard(path)

    expect(navigateToMock).not.toHaveBeenCalled()
  })
})
