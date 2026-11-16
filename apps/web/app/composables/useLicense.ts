import { AuthRequestError, type AuthGateway } from './auth/gateway'
import { useAuthGateway } from './auth/http-gateway'

import {
  readStoredLicenseToken,
  storeLicenseToken,
  verifyLicenseToken,
} from '~/utils/license/token'

/**
 * Lisensi perangkat ini (ADR 15, PRD F15 "Pembelian & Lisensi").
 *
 * Dua langkah yang sengaja dipisah:
 * - `ensureChecked()` - OFFLINE: baca token tersimpan dan verifikasi tanda tangannya. Dipakai gerbang
 *   `/app` setiap navigasi; hasilnya di-cache per tab, jadi verifikasi kripto cuma sekali.
 * - `activate()` - ONLINE, sekali per perangkat: tukar sesi login (OTP/Google) jadi token lewat
 *   `POST /v1/license/token`. Server yang memutuskan email itu sudah membeli atau belum.
 *
 * Login hanya membuktikan pemilik email; data aplikasi tetap lokal dan tidak ikut ke server.
 */

export type LicenseStatus = 'unknown' | 'valid' | 'missing'

/** Sebab aktivasi gagal - kunci i18n `login.license.<error>`. */
export type LicenseActivationError = 'notPurchased' | 'limitReached' | 'network' | 'unavailable'

export const LICENSE_STATE_KEYS = {
  status: 'license-status',
  error: 'license-activation-error',
} as const

function activationErrorOf(caught: unknown): LicenseActivationError | null {
  if (!(caught instanceof AuthRequestError)) return 'unavailable'
  if (caught.isNetworkError) return 'network'
  if (caught.code === 'LICENSE_REQUIRED') return 'notPurchased'
  if (caught.code === 'LICENSE_LIMIT_REACHED') return 'limitReached'
  // Sesi belum ada/kedaluwarsa: bukan kegagalan lisensi - user cukup login dulu.
  if (caught.code === 'UNAUTHENTICATED') return null
  return 'unavailable'
}

export function useLicense(gateway?: AuthGateway) {
  const status = useState<LicenseStatus>(LICENSE_STATE_KEYS.status, () => 'unknown')
  const activationError = useState<LicenseActivationError | null>(
    LICENSE_STATE_KEYS.error,
    () => null,
  )
  const publicKey = useRuntimeConfig().public.licensePublicKey

  /** `true` kalau perangkat ini memegang token yang sah. Tanpa jaringan. */
  async function ensureChecked(): Promise<boolean> {
    if (!import.meta.client) return false
    if (status.value === 'valid') return true

    const token = readStoredLicenseToken()
    const payload = token === null ? null : await verifyLicenseToken(token, publicKey)
    status.value = payload === null ? 'missing' : 'valid'

    return payload !== null
  }

  /** Minta token untuk sesi yang sedang login. `false` = gagal; sebabnya di `activationError`. */
  async function activate(): Promise<boolean> {
    try {
      const token = await (gateway ?? useAuthGateway()).issueLicenseToken()

      // Token dari server yang tidak lolos verifikasi = public key build tidak cocok dengan kunci
      // server. Jangan disimpan: menyimpannya hanya membuat gerbang menolak lagi di navigasi berikut.
      if ((await verifyLicenseToken(token, publicKey)) === null) {
        activationError.value = 'unavailable'
        return false
      }

      storeLicenseToken(token)
      status.value = 'valid'
      activationError.value = null
      return true
    } catch (caught) {
      activationError.value = activationErrorOf(caught)
      return false
    }
  }

  function clearActivationError(): void {
    activationError.value = null
  }

  return {
    status: readonly(status),
    activationError: readonly(activationError),
    ensureChecked,
    activate,
    clearActivationError,
  }
}
