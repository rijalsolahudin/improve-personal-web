/**
 * Kontrak login (ARCHITECTURE §8–9: POST /v1/auth/otp/request|verify, GET /v1/auth/google/start).
 * Login ≠ unlock: gateway ini cuma soal sesi API, tidak menyentuh kunci enkripsi.
 */
export interface AuthGateway {
  /** `false` selama belum ada server: UI wajib memberi tahu user bahwa kode tidak terkirim. */
  readonly isConnected: boolean
  /** `true` = gateway demo (OTP fix), cuma boleh aktif di env non-production. */
  readonly isDemo: boolean
  /** Respons selalu generik - tidak membocorkan apakah email terdaftar. */
  requestEmailOtp(email: string): Promise<void>
  verifyEmailOtp(email: string, code: string): Promise<void>
  startGoogleLogin(): Promise<void>
}

export class AuthUnavailableError extends Error {
  constructor() {
    super('Auth server belum tersambung')
    this.name = 'AuthUnavailableError'
  }
}

/**
 * Stub fase 1 (tanpa server). Tidak pernah meloloskan login: verifikasi & Google selalu gagal.
 * TODO(ergonio#1): ganti dengan gateway HTTP berbasis schema packages/contracts setelah
 * apps/server siap - sesi via cookie HttpOnly dari server, bukan disimpan di JS.
 */
export const pendingAuthGateway: AuthGateway = {
  isConnected: false,
  isDemo: false,
  async requestEmailOtp() {},
  async verifyEmailOtp() {
    throw new AuthUnavailableError()
  },
  async startGoogleLogin() {
    throw new AuthUnavailableError()
  },
}

/** OTP fix env non-production (ARCHITECTURE §8, §12). */
export const DEMO_OTP = '777777'
/** Env yang boleh pakai OTP fix. Selain ini (termasuk kosong) = production. */
const DEMO_ENVS: ReadonlySet<string> = new Set(['development', 'staging', 'test', 'preview'])

export const isDemoEnv = (appEnv: string): boolean => DEMO_ENVS.has(appEnv)

export class InvalidOtpError extends Error {
  constructor() {
    super('Kode OTP salah')
    this.name = 'InvalidOtpError'
  }
}

/**
 * Demo tanpa server: OTP `777777` diterima, Google langsung lolos. Tidak membuat sesi apa pun -
 * cuma mengizinkan navigasi UI. Hanya dipilih oleh `useAuthGateway` saat env non-production.
 */
export const demoAuthGateway: AuthGateway = {
  isConnected: false,
  isDemo: true,
  async requestEmailOtp() {},
  async verifyEmailOtp(_email, code) {
    if (code !== DEMO_OTP) throw new InvalidOtpError()
  },
  async startGoogleLogin() {
    await navigateTo('/app')
  },
}

export function useAuthGateway(): AuthGateway {
  const { appEnv } = useRuntimeConfig().public
  return isDemoEnv(appEnv) ? demoAuthGateway : pendingAuthGateway
}
