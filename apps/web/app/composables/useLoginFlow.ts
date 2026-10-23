import { OTP_RESEND_COOLDOWN_SECONDS, type ErrorCode } from '@improve-personal/contracts'

import { MS_PER_SECOND } from '~/utils/time'
import { isValidEmail, safeRedirectPath } from '~/utils/validation'

import { AuthRequestError, type AuthGateway } from './auth/gateway'
import { useAuthGateway } from './auth/http-gateway'
import { useAuthSession } from './useAuthSession'

export type LoginStep = 'choose' | 'otp' | 'recovery'

/** Kunci pesan di i18n `login.error.*` - semua generik (F15: jangan bocorkan email terdaftar). */
export const LOGIN_ERROR_KEYS = [
  'emailEmpty',
  'emailInvalid',
  'otpIncomplete',
  'otpInvalid',
  /** Kode benar tapi kedaluwarsa: user cuma butuh kode baru, bukan mengulang dari awal. */
  'otpExpired',
  'rateLimited',
  /** Kegagalan callback Google (`/login?error=oauth`). */
  'oauthFailed',
  'unavailable',
  'generic',
] as const

export type LoginError = (typeof LOGIN_ERROR_KEYS)[number]

/**
 * Kode kontrak -> kunci pesan.
 *
 * `VALIDATION_FAILED` sengaja TIDAK ada di sini: server memakai kode itu untuk "email tidak valid"
 * maupun "kode tidak valid", jadi kuncinya ditentukan pemanggil (per langkah). Kode lain - termasuk
 * `UNAUTHENTICATED` - jatuh ke `generic`, sesuai kebijakan pesan generik F15.
 */
const LOGIN_ERROR_BY_CODE: Readonly<Partial<Record<ErrorCode, LoginError>>> = {
  OTP_INVALID: 'otpInvalid',
  OTP_EXPIRED: 'otpExpired',
  RATE_LIMITED: 'rateLimited',
}

/** Nilai `?error=` yang dipasang server saat alur Google gagal (`server/routes/v1/auth/google/callback.get.ts`). */
const OAUTH_ERROR_QUERY_VALUE = 'oauth'

/** Kode dari callback `?error=oauth`: tampil di blok Google, tidak menyamar jadi error email. */
function initialGoogleError(queryValue: unknown): LoginError | null {
  return queryValue === OAUTH_ERROR_QUERY_VALUE ? 'oauthFailed' : null
}

/**
 * Kegagalan request -> kunci pesan. `validation` = kunci untuk `VALIDATION_FAILED` di langkah yang
 * sedang berjalan. Error yang tidak dikenali sama sekali jatuh ke `generic`, bukan diteruskan apa
 * adanya ke UI.
 */
function toLoginError(error: unknown, validation: LoginError): LoginError {
  if (!(error instanceof AuthRequestError)) return 'generic'

  // Permintaan tidak pernah sampai ke server: "server tidak terjangkau" lebih jujur daripada
  // menyalahkan kode/email user yang mungkin saja benar.
  if (error.isNetworkError) return 'unavailable'
  if (error.code === 'VALIDATION_FAILED') return validation

  return LOGIN_ERROR_BY_CODE[error.code] ?? 'generic'
}

export type LoginFlow = ReturnType<typeof useLoginFlow>

/** Alur login email OTP + Google (Login.dc.html). */
export function useLoginFlow(gateway: AuthGateway = useAuthGateway()) {
  const now = useNow()
  const route = useRoute()
  const otp = useOtpInput()
  const auth = useAuthSession(gateway)

  const step = ref<LoginStep>('choose')
  const email = ref('')
  const emailError = ref<LoginError | null>(null)
  const otpError = ref<LoginError | null>(null)
  // Kegagalan callback Google datang lewat `?error=oauth`: itu sebab pertama user melihat form ini,
  // jadi pesannya sudah ada sejak render pertama.
  const googleError = ref<LoginError | null>(initialGoogleError(route.query.error))
  const isSending = ref(false)
  const isVerifying = ref(false)
  const isGooglePending = ref(false)
  const resendAt = ref(0)

  const resendSecondsLeft = computed(() =>
    Math.max(0, Math.ceil((resendAt.value - now.value) / MS_PER_SECOND)),
  )

  async function requestCode(address: string): Promise<void> {
    await gateway.requestEmailOtp(address)
    otp.clear()
    otpError.value = null
    // Jeda kirim ulang dari KONTRAK: server menegakkannya juga, jadi angkanya tidak boleh ditulis
    // ulang di sini (kalau menyimpang, tombol aktif saat server masih menolak).
    resendAt.value = Date.now() + OTP_RESEND_COOLDOWN_SECONDS * MS_PER_SECOND
  }

  async function submitEmail(): Promise<void> {
    if (isSending.value) return
    const address = email.value.trim()
    emailError.value = !address ? 'emailEmpty' : isValidEmail(address) ? null : 'emailInvalid'
    if (emailError.value) return

    isSending.value = true
    try {
      await requestCode(address)
      email.value = address
      step.value = 'otp'
    } catch (error) {
      emailError.value = toLoginError(error, 'emailInvalid')
    } finally {
      isSending.value = false
    }
  }

  async function verify(): Promise<void> {
    if (!otp.isComplete.value) {
      otpError.value = 'otpIncomplete'
      return
    }
    if (isVerifying.value) return

    isVerifying.value = true
    try {
      const session = await gateway.verifyEmailOtp(email.value, otp.code.value)
      // Hasil login langsung jadi state sesi: guard & kartu akun tidak perlu request tambahan.
      auth.setSession(session)
      await navigateTo(safeRedirectPath(route.query.redirect))
    } catch (error) {
      otpError.value = toLoginError(error, 'otpInvalid')
      otp.clear()
    } finally {
      isVerifying.value = false
    }
  }

  async function resend(): Promise<void> {
    if (resendSecondsLeft.value > 0 || isSending.value) return
    isSending.value = true
    try {
      await requestCode(email.value)
    } catch (error) {
      otpError.value = toLoginError(error, 'emailInvalid')
    } finally {
      isSending.value = false
    }
  }

  async function loginWithGoogle(): Promise<void> {
    if (isGooglePending.value) return
    isGooglePending.value = true
    googleError.value = null
    try {
      await gateway.startGoogleLogin()
    } catch (error) {
      googleError.value = toLoginError(error, 'generic')
    } finally {
      // Selalu dibuka lagi: `startGoogleLogin` memicu navigasi PENUH, jadi kalau halaman ternyata
      // tidak pindah (mis. navigasi diblokir), tombol tidak boleh menggantung di state pending.
      isGooglePending.value = false
    }
  }

  function setEmail(value: string): void {
    email.value = value
    emailError.value = null
  }

  function backToEmail(): void {
    step.value = 'choose'
    otpError.value = null
  }

  /**
   * "Lupa OTP": email tidak bisa diakses, jadi tawarkan passkey / kode pemulihan.
   *
   * Langkahnya tidak meminta OTP lebih dulu - permintaan kode yang gagal berulang kali justru masalah
   * awalnya. Yang membuka kunci tetap `AccountUnlockForm` di langkah itu (passkey, kode, atau berkas).
   */
  function openRecovery(): void {
    step.value = 'recovery'
    otpError.value = null
  }

  return {
    step: readonly(step),
    email: readonly(email),
    emailError: readonly(emailError),
    otpError: readonly(otpError),
    googleError: readonly(googleError),
    isSending: readonly(isSending),
    isVerifying: readonly(isVerifying),
    isGooglePending: readonly(isGooglePending),
    resendSecondsLeft,
    otp,
    setEmail,
    submitEmail,
    verify,
    resend,
    loginWithGoogle,
    backToEmail,
    openRecovery,
  }
}
