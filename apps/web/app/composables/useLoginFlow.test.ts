import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthRequestError, type AuthGateway } from './auth/gateway'
import { AUTH_SESSION_STATE_KEYS, useAuthSession } from './useAuthSession'
import { LOGIN_ERROR_KEYS, useLoginFlow } from './useLoginFlow'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

/** Query route di-mock supaya `?redirect=` dan `?error=oauth` bisa diuji tanpa router sungguhan. */
const routeState: { query: Record<string, unknown> } = { query: {} }
const { useRouteMock } = vi.hoisted(() => ({ useRouteMock: vi.fn() }))
mockNuxtImport('useRoute', () => useRouteMock)
useRouteMock.mockImplementation(() => routeState)

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

/** Sesi yang tersimpan di state bersama (`useAuthSession`) - dibaca tanpa memicu request. */
function storedSession(): unknown {
  return useAuthSession(fakeGateway()).session.value
}

describe('useLoginFlow', () => {
  beforeEach(() => {
    navigateToMock.mockReset()
    routeState.query = {}
    clearNuxtState(Object.values(AUTH_SESSION_STATE_KEYS))
  })

  it('memvalidasi email sebelum meminta OTP', async () => {
    const gateway = fakeGateway()
    const flow = useLoginFlow(gateway)

    await flow.submitEmail()
    expect(flow.emailError.value).toBe('emailEmpty')

    flow.setEmail('bukan-email')
    await flow.submitEmail()
    expect(flow.emailError.value).toBe('emailInvalid')
    expect(gateway.requestEmailOtp).not.toHaveBeenCalled()
  })

  it('meminta OTP lalu pindah ke langkah kode dengan cooldown kirim ulang', async () => {
    const gateway = fakeGateway()
    const flow = useLoginFlow(gateway)

    flow.setEmail('  kamu@email.com ')
    await flow.submitEmail()

    expect(gateway.requestEmailOtp).toHaveBeenCalledWith('kamu@email.com')
    expect(flow.step.value).toBe('otp')
    expect(flow.email.value).toBe('kamu@email.com')
    expect(flow.resendSecondsLeft.value).toBeGreaterThan(0)
  })

  it('OTP belum lengkap tidak dikirim ke server', async () => {
    const gateway = fakeGateway()
    const flow = useLoginFlow(gateway)
    flow.otp.paste('123')

    await flow.verify()

    expect(flow.otpError.value).toBe('otpIncomplete')
    expect(gateway.verifyEmailOtp).not.toHaveBeenCalled()
  })

  it('verifikasi sukses: hasil login jadi state sesi, lalu redirect ke path internal yang aman', async () => {
    const gateway = fakeGateway()
    const flow = useLoginFlow(gateway)
    flow.setEmail('kamu@email.com')
    await flow.submitEmail()
    flow.otp.paste('123456')

    await flow.verify()

    expect(gateway.verifyEmailOtp).toHaveBeenCalledWith('kamu@email.com', '123456')
    // Sama persis dengan bentuk `CurrentSessionResult` dari `GET /v1/auth/session`: `client` dibuang.
    expect(storedSession()).toEqual({
      user: SESSION_DTO.user,
      device: SESSION_DTO.device,
      expiresAt: SESSION_DTO.expiresAt,
    })
    expect(navigateToMock).toHaveBeenCalledWith('/app')
  })

  it('redirect setelah login hanya ke path internal: percobaan open redirect diabaikan', async () => {
    routeState.query = { redirect: 'https://evil.example/app' }
    const flow = useLoginFlow(fakeGateway())
    flow.otp.paste('123456')

    await flow.verify()

    expect(navigateToMock).toHaveBeenCalledWith('/app')
  })

  it('redirect setelah login mengikuti tujuan asli yang internal', async () => {
    routeState.query = { redirect: '/app/to-do' }
    const flow = useLoginFlow(fakeGateway())
    flow.otp.paste('123456')

    await flow.verify()

    expect(navigateToMock).toHaveBeenCalledWith('/app/to-do')
  })

  it.each([
    ['OTP_INVALID', new AuthRequestError('OTP_INVALID'), 'otpInvalid'],
    ['OTP_EXPIRED', new AuthRequestError('OTP_EXPIRED'), 'otpExpired'],
    ['RATE_LIMITED', new AuthRequestError('RATE_LIMITED'), 'rateLimited'],
    ['VALIDATION_FAILED di langkah kode', new AuthRequestError('VALIDATION_FAILED'), 'otpInvalid'],
    ['UNAUTHENTICATED', new AuthRequestError('UNAUTHENTICATED'), 'generic'],
    [
      'kegagalan jaringan',
      new AuthRequestError('INTERNAL', { isNetworkError: true }),
      'unavailable',
    ],
    ['error tak dikenal', new Error('boom'), 'generic'],
  ])('kode server %s → pesan %s', async (_label, failure, expected) => {
    const flow = useLoginFlow(
      fakeGateway({
        verifyEmailOtp: vi.fn(async () => {
          throw failure
        }),
      }),
    )
    flow.otp.paste('000000')

    await flow.verify()

    expect(flow.otpError.value).toBe(expected)
    expect(flow.otp.code.value).toBe('')
    expect(navigateToMock).not.toHaveBeenCalled()
    expect(storedSession()).toBeNull()
  })

  it('VALIDATION_FAILED saat meminta kode dipetakan ke pesan email', async () => {
    const flow = useLoginFlow(
      fakeGateway({
        requestEmailOtp: vi.fn(async () => {
          throw new AuthRequestError('VALIDATION_FAILED')
        }),
      }),
    )
    flow.setEmail('kamu@email.com')

    await flow.submitEmail()

    expect(flow.emailError.value).toBe('emailInvalid')
    expect(flow.step.value).toBe('choose')
  })

  it('login Google: panggil gateway (navigasi penuh) dan tidak menggantung di state pending', async () => {
    const gateway = fakeGateway()
    const flow = useLoginFlow(gateway)

    await flow.loginWithGoogle()

    expect(gateway.startGoogleLogin).toHaveBeenCalledTimes(1)
    expect(flow.googleError.value).toBeNull()
    expect(flow.isGooglePending.value).toBe(false)
  })

  it('login Google yang gagal karena jaringan: pesan "server tidak terjangkau"', async () => {
    const flow = useLoginFlow(
      fakeGateway({
        startGoogleLogin: vi.fn(async () => {
          throw new AuthRequestError('INTERNAL', { isNetworkError: true })
        }),
      }),
    )

    await flow.loginWithGoogle()

    expect(flow.googleError.value).toBe('unavailable')
    expect(flow.isGooglePending.value).toBe(false)
  })

  it('`?error=oauth` dari callback Google ditampilkan sejak render pertama', () => {
    routeState.query = { error: 'oauth' }

    expect(useLoginFlow(fakeGateway()).googleError.value).toBe('oauthFailed')
  })

  it('nilai query lain tidak dianggap kegagalan OAuth', () => {
    routeState.query = { error: 'lain' }

    expect(useLoginFlow(fakeGateway()).googleError.value).toBeNull()
  })
})

// Setiap kunci `LoginError` dipakai template sebagai `login.error.<kunci>`: kunci yang lupa ditambahkan
// tampil KOSONG di UI (bukan error), jadi dijaga di sini - bukan berharap ketahuan saat review.
const idMessages = JSON.parse(readFileSync(resolve('i18n/locales/id.json'), 'utf8')) as {
  login: { error: Record<string, string> }
}

describe('locale login.error', () => {
  it('tiap kunci LoginError punya pesan', () => {
    const missing = LOGIN_ERROR_KEYS.filter(
      (key) => typeof idMessages.login.error[key] !== 'string',
    )

    expect(missing).toEqual([])
  })
})
