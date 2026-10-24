import { webSessionDtoSchema, type DeviceInfo } from '@improve-personal/contracts'
import { describe, expect, it, vi } from 'vitest'

import { AuthRequestError } from './gateway'
import { createAuthGateway, type AuthFetch } from './http-gateway'

const DEVICE = {
  name: 'Chrome di Linux',
  platform: 'web',
  installationId: '018f2b3c-4d5e-7f80-9abc-def012345678',
} as const satisfies DeviceInfo

const SESSION_BODY = {
  user: { id: '018f2b3c-4d5e-7f80-9abc-def012345678', email: 'kamu@email.com' },
  device: { id: '018f2b3c-4d5e-7f80-9abc-def012345678', name: 'Chrome di Linux' },
  expiresAt: '2026-05-10T09:00:00.000Z',
}

/** Error `$fetch` saat server menjawab dengan amplop error kontrak. */
function httpProblem(status: number, code: string): unknown {
  return Object.assign(new Error(`HTTP ${status}`), {
    status,
    data: { error: { code, message: 'generik' } },
  })
}

/** Error `$fetch` saat permintaan tidak pernah dapat respons HTTP sama sekali. */
function networkFailure(): unknown {
  return Object.assign(new Error('fetch failed'), { cause: new Error('ENOTFOUND') })
}

function gatewayWith(request: AuthFetch) {
  return createAuthGateway(request, { device: () => DEVICE })
}

describe('createAuthGateway', () => {
  it('minta OTP: POST ke kontrak dengan client web + device, tanpa mem-parse body 204', async () => {
    const request = vi.fn<AuthFetch>(async () => undefined)

    await gatewayWith(request).requestEmailOtp('kamu@email.com')

    expect(request).toHaveBeenCalledWith('/v1/auth/otp/request', {
      method: 'POST',
      body: { email: 'kamu@email.com', client: 'web', device: DEVICE },
    })
  })

  it('verifikasi OTP: mengembalikan DTO sesi web dari amplop kontrak', async () => {
    const request = vi.fn<AuthFetch>(async () => ({ data: { ...SESSION_BODY, client: 'web' } }))

    const session = await gatewayWith(request).verifyEmailOtp('kamu@email.com', '123456')

    expect(request).toHaveBeenCalledWith('/v1/auth/otp/verify', {
      method: 'POST',
      body: { email: 'kamu@email.com', code: '123456', client: 'web', device: DEVICE },
    })
    expect(session.expiresAt).toBe(SESSION_BODY.expiresAt)
    expect(webSessionDtoSchema.safeParse(session).success).toBe(true)
  })

  it('menolak DTO sesi web yang memuat token, jadi token tidak pernah masuk state client', async () => {
    const request = vi.fn<AuthFetch>(async () => ({
      data: { ...SESSION_BODY, client: 'web', token: 'rahasia' },
    }))

    // `INTERNAL` yang BUKAN network error: responsnya sampai, hanya bentuknya di luar kontrak.
    await expect(
      gatewayWith(request).verifyEmailOtp('kamu@email.com', '123456'),
    ).rejects.toMatchObject({ code: 'INTERNAL', isNetworkError: false })
  })

  it('currentSession: 401 → null (bukan error), sesi lain dikembalikan apa adanya', async () => {
    const unauthorized = gatewayWith(
      vi.fn<AuthFetch>(async () => {
        throw httpProblem(401, 'UNAUTHENTICATED')
      }),
    )
    await expect(unauthorized.currentSession()).resolves.toBeNull()

    const alive = gatewayWith(vi.fn<AuthFetch>(async () => ({ data: SESSION_BODY })))
    await expect(alive.currentSession()).resolves.toEqual(SESSION_BODY)
  })

  it('currentSession: kegagalan server jadi AuthRequestError dengan kode kontrak', async () => {
    const gateway = gatewayWith(
      vi.fn<AuthFetch>(async () => {
        throw httpProblem(500, 'INTERNAL')
      }),
    )

    await expect(gateway.currentSession()).rejects.toBeInstanceOf(AuthRequestError)
    await expect(gateway.currentSession()).rejects.toMatchObject({ code: 'INTERNAL' })
  })

  it('kegagalan tanpa respons HTTP ditandai isNetworkError = true', async () => {
    const gateway = gatewayWith(
      vi.fn<AuthFetch>(async () => {
        throw networkFailure()
      }),
    )

    await expect(gateway.currentSession()).rejects.toMatchObject({
      code: 'INTERNAL',
      isNetworkError: true,
    })
  })

  it('body error tanpa amplop kontrak dipetakan dari status HTTP', async () => {
    const gateway = gatewayWith(
      vi.fn<AuthFetch>(async () => {
        throw Object.assign(new Error('429'), { status: 429, data: '<html>rate limited</html>' })
      }),
    )

    await expect(gateway.signOut()).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('signOut: POST /v1/auth/logout dan tidak mem-parse body 204', async () => {
    const request = vi.fn<AuthFetch>(async () => undefined)

    await gatewayWith(request).signOut()

    expect(request).toHaveBeenCalledWith('/v1/auth/logout', { method: 'POST' })
  })
})
