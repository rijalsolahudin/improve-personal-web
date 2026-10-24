import { deviceInfoSchema, uuidSchema } from '@improve-personal/contracts'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  INSTALLATION_ID_STORAGE_KEY,
  resetInstallationIdForTest,
} from '~/utils/device-installation'

import { useAuthGateway } from './http-gateway'

/**
 * Yang diuji di sini adalah PAYLOAD yang benar-benar meninggalkan browser, bukan bentuk objek di
 * dalam gateway: transport Nuxt (`useRequestFetch`) dan `window.location` dimock, lalu isi request
 * diperiksa terhadap kontrak. Dengan begitu regresi "device tanpa `installationId`" tidak bisa lolos
 * hanya karena unit test gateway memakai `DeviceInfo` buatan sendiri.
 */
const { fetchSpy } = vi.hoisted(() => ({ fetchSpy: vi.fn() }))
mockNuxtImport('useRequestFetch', () => () => fetchSpy)

const SESSION_BODY = {
  user: { id: '018f2b3c-4d5e-7f80-9abc-def012345678', email: 'kamu@email.com' },
  device: { id: '018f2b3c-4d5e-7f80-9abc-def012345678', name: 'Chrome di Linux' },
  expiresAt: '2026-05-10T09:00:00.000Z',
  client: 'web' as const,
}

type SentBody = { readonly device: Record<string, unknown> }

/** Body request terakhir yang dikirim ke `path`, atau gagal kalau jalur/nilai lain yang dikirim. */
function sentBody(path: string): SentBody {
  expect(fetchSpy).toHaveBeenCalledTimes(1)
  const [sentPath, options] = fetchSpy.mock.calls[0] as [string, { body: SentBody }]
  expect(sentPath).toBe(path)

  return options.body
}

function expectInstallationIdValue(value: unknown): void {
  expect(uuidSchema.safeParse(value).success).toBe(true)
  // Id yang dikirim harus id tersimpan instalasi ini, bukan nilai acak per request.
  expect(value).toBe(localStorage.getItem(INSTALLATION_ID_STORAGE_KEY))
}

function expectDeviceBody(device: Record<string, unknown>): void {
  expect(deviceInfoSchema.safeParse(device).success).toBe(true)
  expectInstallationIdValue(device.installationId)
}

beforeEach(() => {
  fetchSpy.mockReset()
  localStorage.clear()
  resetInstallationIdForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('payload perangkat di jalur login', () => {
  it('POST /v1/auth/otp/request mengirim device dengan installationId', async () => {
    fetchSpy.mockResolvedValue(undefined)

    await useAuthGateway().requestEmailOtp('kamu@email.com')

    expectDeviceBody(sentBody('/v1/auth/otp/request').device)
  })

  it('POST /v1/auth/otp/verify mengirim device dengan installationId yang sama', async () => {
    fetchSpy.mockResolvedValue({ data: SESSION_BODY })

    await useAuthGateway().verifyEmailOtp('kamu@email.com', '123456')

    expectDeviceBody(sentBody('/v1/auth/otp/verify').device)
  })

  it('GET /v1/auth/google/start membawa installationId di query', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })

    await useAuthGateway().startGoogleLogin()

    expect(assign).toHaveBeenCalledTimes(1)
    const url = new URL(assign.mock.calls[0]?.[0] as string, 'https://app.example')
    expect(url.pathname).toBe('/v1/auth/google/start')
    expect(url.searchParams.get('client')).toBe('web')
    expectInstallationIdValue(url.searchParams.get('installationId'))
  })
})
