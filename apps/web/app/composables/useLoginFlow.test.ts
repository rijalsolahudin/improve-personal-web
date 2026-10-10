import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AuthUnavailableError,
  DEMO_OTP,
  demoAuthGateway,
  isDemoEnv,
  pendingAuthGateway,
  type AuthGateway,
} from './auth/gateway'
import { useLoginFlow } from './useLoginFlow'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

function fakeGateway(overrides: Partial<AuthGateway> = {}): AuthGateway {
  return {
    isConnected: true,
    isDemo: false,
    requestEmailOtp: vi.fn(async () => {}),
    verifyEmailOtp: vi.fn(async () => {}),
    startGoogleLogin: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('useLoginFlow', () => {
  beforeEach(() => {
    navigateToMock.mockReset()
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

  it('verifikasi sukses redirect ke path internal yang aman saja', async () => {
    const gateway = fakeGateway()
    const flow = useLoginFlow(gateway)
    flow.setEmail('kamu@email.com')
    await flow.submitEmail()
    flow.otp.paste('123456')

    await flow.verify()

    expect(gateway.verifyEmailOtp).toHaveBeenCalledWith('kamu@email.com', '123456')
    expect(navigateToMock).toHaveBeenCalledWith('/app')
  })

  it('kode ditolak server → pesan generik dan kotak dikosongkan', async () => {
    const flow = useLoginFlow(
      fakeGateway({
        verifyEmailOtp: vi.fn(async () => {
          throw new Error('401')
        }),
      }),
    )
    flow.otp.paste('000000')

    await flow.verify()

    expect(flow.otpError.value).toBe('otpInvalid')
    expect(flow.otp.code.value).toBe('')
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('stub fase 1 tidak pernah meloloskan login', async () => {
    const flow = useLoginFlow(pendingAuthGateway)
    expect(flow.isServerConnected).toBe(false)
    flow.otp.paste('777777')

    await flow.verify()
    await flow.loginWithGoogle()

    expect(flow.otpError.value).toBe('unavailable')
    expect(flow.googleError.value).toBe('unavailable')
    expect(navigateToMock).not.toHaveBeenCalled()
    await expect(pendingAuthGateway.verifyEmailOtp('a@b.id', '123456')).rejects.toBeInstanceOf(
      AuthUnavailableError,
    )
  })

  it('demo: cuma kode 777777 yang lolos', async () => {
    const flow = useLoginFlow(demoAuthGateway)
    expect(flow.isDemo).toBe(true)

    flow.otp.paste('123456')
    await flow.verify()
    expect(flow.otpError.value).toBe('otpInvalid')
    expect(navigateToMock).not.toHaveBeenCalled()

    flow.otp.paste(DEMO_OTP)
    await flow.verify()
    expect(navigateToMock).toHaveBeenCalledWith('/app')
  })

  it('demo cuma aktif di env non-production', () => {
    for (const env of ['development', 'staging', 'test', 'preview']) {
      expect(isDemoEnv(env)).toBe(true)
    }
    for (const env of ['production', '', 'prod', 'Development']) {
      expect(isDemoEnv(env)).toBe(false)
    }
  })
})
