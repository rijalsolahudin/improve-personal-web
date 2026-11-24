import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthGateway } from './auth/gateway'
import { LICENSE_STATE_KEYS, useLicense } from './useLicense'

const { ensureKeyMock } = vi.hoisted(() => ({ ensureKeyMock: vi.fn<() => Promise<string>>() }))

/** Pembuatan keypair diuji di `utils/crypto/device-sign-key.test.ts`; di sini hanya perilaku aktivasi. */
vi.mock('~/utils/crypto/device-sign-key', () => ({ ensureDeviceSignPublicKey: ensureKeyMock }))

/** Verifikasi tanda tangan token diuji di `utils/license/token.test.ts`. */
vi.mock('~/utils/license/token', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/license/token')>()),
  verifyLicenseToken: vi.fn(async () => ({ v: 2 })),
}))

const DEVICE_SIGN_PK = Buffer.alloc(32, 5).toString('base64')

function gatewayReturningToken() {
  const issueLicenseToken = vi.fn<AuthGateway['issueLicenseToken']>(async () => 'token')
  return { gateway: { issueLicenseToken } as unknown as AuthGateway, issueLicenseToken }
}

describe('useLicense.activate (Device Sign Key, ADR 17)', () => {
  beforeEach(() => {
    ensureKeyMock.mockReset()
    clearNuxtState(Object.values(LICENSE_STATE_KEYS))
    localStorage.clear()
  })

  it('mengirim public key perangkat saat aktivasi', async () => {
    ensureKeyMock.mockResolvedValue(DEVICE_SIGN_PK)
    const { gateway, issueLicenseToken } = gatewayReturningToken()

    const activated = await useLicense(gateway).activate()

    expect(activated).toBe(true)
    expect(issueLicenseToken).toHaveBeenCalledWith({ deviceSignPk: DEVICE_SIGN_PK })
  })

  it('browser tanpa Ed25519/IndexedDB: aktivasi tetap jalan tanpa kunci', async () => {
    ensureKeyMock.mockRejectedValue(new Error('NotSupportedError'))
    const { gateway, issueLicenseToken } = gatewayReturningToken()

    const activated = await useLicense(gateway).activate()

    expect(activated).toBe(true)
    expect(issueLicenseToken).toHaveBeenCalledWith(undefined)
  })
})
