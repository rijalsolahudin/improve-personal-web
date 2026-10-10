import { MS_PER_SECOND } from '~/utils/time'
import { isValidEmail, safeRedirectPath } from '~/utils/validation'

import { AuthUnavailableError, useAuthGateway, type AuthGateway } from './auth/gateway'

const RESEND_COOLDOWN_MS = 30 * MS_PER_SECOND

export type LoginStep = 'choose' | 'otp'
/** Kunci pesan di i18n `login.error.*` - semua generik (F15: jangan bocorkan email terdaftar). */
export type LoginError =
  'emailEmpty' | 'emailInvalid' | 'otpIncomplete' | 'otpInvalid' | 'unavailable' | 'generic'

const toLoginError = (error: unknown, fallback: LoginError): LoginError =>
  error instanceof AuthUnavailableError ? 'unavailable' : fallback

export type LoginFlow = ReturnType<typeof useLoginFlow>

/** Alur login email OTP + Google (Login.dc.html). */
export function useLoginFlow(gateway: AuthGateway = useAuthGateway()) {
  const now = useNow()
  const route = useRoute()
  const otp = useOtpInput()

  const step = ref<LoginStep>('choose')
  const email = ref('')
  const emailError = ref<LoginError | null>(null)
  const otpError = ref<LoginError | null>(null)
  const googleError = ref<LoginError | null>(null)
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
    resendAt.value = Date.now() + RESEND_COOLDOWN_MS
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
      emailError.value = toLoginError(error, 'generic')
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
      await gateway.verifyEmailOtp(email.value, otp.code.value)
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
      otpError.value = toLoginError(error, 'generic')
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

  return {
    step: readonly(step),
    email: readonly(email),
    emailError: readonly(emailError),
    otpError: readonly(otpError),
    googleError: readonly(googleError),
    isSending: readonly(isSending),
    isVerifying: readonly(isVerifying),
    isGooglePending: readonly(isGooglePending),
    isServerConnected: gateway.isConnected,
    isDemo: gateway.isDemo,
    resendSecondsLeft,
    otp,
    setEmail,
    submitEmail,
    verify,
    resend,
    loginWithGoogle,
    backToEmail,
  }
}
