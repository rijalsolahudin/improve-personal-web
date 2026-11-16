import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { OTP_RESEND_COOLDOWN_SECONDS } from '@improve-personal/contracts'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthRequestError, type AuthGateway } from './auth/gateway'
import { AUTH_SESSION_STATE_KEYS, useAuthSession } from './useAuthSession'
import { LICENSE_STATE_KEYS } from './useLicense'
import { LOGIN_ERROR_KEYS, useLoginFlow } from './useLoginFlow'
import { LICENSE_STORAGE_KEY } from '~/utils/license/token'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

/** Query route di-mock supaya `?redirect=` dan `?error=oauth` bisa diuji tanpa router sungguhan. */
const routeState: { query: Record<string, unknown> } = { query: {} }
const { useRouteMock } = vi.hoisted(() => ({ useRouteMock: vi.fn() }))
mockNuxtImport('useRoute', () => useRouteMock)
useRouteMock.mockImplementation(() => routeState)

/**
 * Verifikasi tanda tangan di-mock di batas util token: kriptonya sendiri diuji di
 * `utils/license/token.test.ts`, dan runtime test tidak punya public key build. `'token-sah'` = token
 * yang lolos verifikasi; selain itu ditolak.
 */
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
    issueLicenseToken: vi.fn(async () => VALID_TOKEN),
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
    clearNuxtState([
      ...Object.values(AUTH_SESSION_STATE_KEYS),
      ...Object.values(LICENSE_STATE_KEYS),
    ])
    localStorage.clear()
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

describe('aktivasi lisensi setelah login (ADR 15)', () => {
  beforeEach(() => {
    navigateToMock.mockReset()
    routeState.query = {}
    clearNuxtState([
      ...Object.values(AUTH_SESSION_STATE_KEYS),
      ...Object.values(LICENSE_STATE_KEYS),
    ])
    localStorage.clear()
  })

  async function loginWith(gateway: AuthGateway) {
    const flow = useLoginFlow(gateway)
    flow.setEmail('kamu@email.com')
    await flow.submitEmail()
    flow.otp.paste('123456')
    await flow.verify()
    return flow
  }

  it('login sukses + sudah membeli: token disimpan, lalu masuk app', async () => {
    const gateway = fakeGateway()

    await loginWith(gateway)

    expect(gateway.issueLicenseToken).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(LICENSE_STORAGE_KEY)).toBe(VALID_TOKEN)
    expect(navigateToMock).toHaveBeenCalledWith('/app')
  })

  it.each([
    ['LICENSE_REQUIRED', 'notPurchased'],
    ['LICENSE_LIMIT_REACHED', 'limitReached'],
    ['INTERNAL', 'unavailable'],
  ] as const)('%s -> langkah lisensi `%s`, tidak masuk app', async (code, reason) => {
    const flow = await loginWith(
      fakeGateway({
        issueLicenseToken: vi.fn(async () => {
          throw new AuthRequestError(code)
        }),
      }),
    )

    expect(flow.step.value).toBe('license')
    expect(flow.licenseError.value).toBe(reason)
    expect(navigateToMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(LICENSE_STORAGE_KEY)).toBeNull()
  })

  it('server tak terjangkau saat aktivasi -> sebab `network`', async () => {
    const flow = await loginWith(
      fakeGateway({
        issueLicenseToken: vi.fn(async () => {
          throw new AuthRequestError('INTERNAL', { isNetworkError: true })
        }),
      }),
    )

    expect(flow.licenseError.value).toBe('network')
  })

  it('token dari server yang tidak lolos verifikasi TIDAK disimpan', async () => {
    const flow = await loginWith(
      fakeGateway({ issueLicenseToken: vi.fn(async () => 'token-palsu') }),
    )

    expect(flow.step.value).toBe('license')
    expect(localStorage.getItem(LICENSE_STORAGE_KEY)).toBeNull()
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('resume: perangkat sudah berlisensi -> kembali ke app tanpa request apa pun', async () => {
    localStorage.setItem(LICENSE_STORAGE_KEY, VALID_TOKEN)
    const gateway = fakeGateway()

    await useLoginFlow(gateway).resume()

    expect(navigateToMock).toHaveBeenCalledWith('/app')
    expect(gateway.currentSession).not.toHaveBeenCalled()
    expect(gateway.issueLicenseToken).not.toHaveBeenCalled()
  })

  it('resume: sesi sudah ada (kembali dari Google) -> aktivasi otomatis', async () => {
    const gateway = fakeGateway({ currentSession: vi.fn(async () => SESSION_DTO) })

    await useLoginFlow(gateway).resume()

    expect(gateway.issueLicenseToken).toHaveBeenCalledTimes(1)
    expect(navigateToMock).toHaveBeenCalledWith('/app')
  })

  it('resume: belum ada sesi -> tetap di form login', async () => {
    const gateway = fakeGateway()
    const flow = useLoginFlow(gateway)

    await flow.resume()

    expect(flow.step.value).toBe('choose')
    expect(gateway.issueLicenseToken).not.toHaveBeenCalled()
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('pakai email lain: sesi dicabut, form kembali kosong', async () => {
    const gateway = fakeGateway({
      issueLicenseToken: vi.fn(async () => {
        throw new AuthRequestError('LICENSE_REQUIRED')
      }),
    })
    const flow = await loginWith(gateway)

    await flow.switchEmail()

    expect(gateway.signOut).toHaveBeenCalledTimes(1)
    expect(flow.step.value).toBe('choose')
    expect(flow.licenseError.value).toBeNull()
    expect(storedSession()).toBeNull()
  })
})

describe('jeda 30 detik & pesan yang tidak membocorkan email terdaftar (T22)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('cooldown kirim ulang = 30 detik (konstanta kontrak), kirim ulang ditolak sampai habis', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T08:00:00.000Z'))
    clearNuxtState(['now'])

    const gateway = fakeGateway()
    const flow = useLoginFlow(gateway)
    flow.setEmail('kamu@email.com')

    await flow.submitEmail()

    expect(OTP_RESEND_COOLDOWN_SECONDS).toBe(30)
    expect(flow.resendSecondsLeft.value).toBe(30)

    // Selama jeda: tombol kirim ulang tidak mengirim apa pun ke server.
    await flow.resend()
    expect(gateway.requestEmailOtp).toHaveBeenCalledTimes(1)

    useState<number>('now').value = Date.now() + 29_000
    await nextTick()
    await flow.resend()
    expect(gateway.requestEmailOtp).toHaveBeenCalledTimes(1)

    // Lewat jeda: boleh kirim lagi, dan jedanya mulai dari 30 detik lagi.
    useState<number>('now').value = Date.now() + 30_000
    await nextTick()
    expect(flow.resendSecondsLeft.value).toBe(0)

    await flow.resend()
    expect(gateway.requestEmailOtp).toHaveBeenCalledTimes(2)
    // Ticker jam menyusul; nilai `now` yang dipakai assertion sebelumnya masih di detik ke-30.
    useState<number>('now').value = Date.now()
    await nextTick()
    expect(flow.resendSecondsLeft.value).toBe(30)
  })

  it('email belum terdaftar & email terdaftar menghasilkan langkah yang sama (tidak ada cabang pendaftaran)', async () => {
    // Server selalu 204 untuk keduanya; UI memang tidak boleh punya jalur "email tidak dikenal".
    for (const address of ['baru@email.com', 'sudah-terdaftar@email.com']) {
      const gateway = fakeGateway()
      const flow = useLoginFlow(gateway)
      flow.setEmail(address)

      await flow.submitEmail()

      expect(flow.step.value).toBe('otp')
      expect(flow.emailError.value).toBeNull()
    }
  })

  it('tidak ada pesan login yang menyebut status pendaftaran email', () => {
    const forbidden = /terdaftar|belum punya akun|tidak ditemukan|tidak dikenal|unknown/i
    const messages = Object.values(idMessages.login.error)

    expect(messages.filter((message) => forbidden.test(message))).toEqual([])
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
