import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SecureKeyStore } from '@improve-personal/core'

import { createMasterKey } from '~/utils/crypto/master-key'
import { loadSodium } from '~/utils/crypto/sodium'
import { deriveWebAuthnUserHandle } from '~/utils/crypto/webauthn'
import type { JsonFetch } from '~/utils/http/json-fetch'

import { useAccount } from './useAccount'

/**
 * Aktivasi passkey: envelope server (slot tunggal, ditimpa oleh PUT) hanya boleh dikirim SETELAH
 * envelope baru terbukti bisa dibuka kembali.
 *
 * Jaringan di-mock di batas (`JsonFetch`), WebAuthn di-mock di batas (`navigator.credentials`). PRF palsu
 * diturunkan dari (salt, "rahasia") - rahasia create() dan get() bisa dibuat berbeda untuk meniru
 * authenticator yang memberi PRF berbeda dengan/tanpa UV. Bukan bukti terhadap authenticator nyata.
 */

const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d1'
const CREDENTIAL_ID = 'Y3JlZC0x'

const ensure = vi.hoisted(() => vi.fn())
vi.mock('~/composables/useLocalData', () => ({ useLocalData: () => ({ ensure }) }))

function memoryKeyStore(): SecureKeyStore & { readonly puts: string[] } {
  const rows = new Map<string, { kind: string; handle: unknown }>()
  const puts: string[] = []

  return {
    puts,
    has: async (slot) => rows.has(slot),
    put: async (slot, material) => {
      puts.push(slot)
      rows.set(slot, { kind: material.kind, handle: material.handle })
    },
    get: async (slot) => rows.get(slot) ?? null,
    remove: async (slot) => {
      rows.delete(slot)
    },
  }
}

async function prf(salt: BufferSource | undefined, secret: string): Promise<ArrayBuffer> {
  const sodium = await loadSodium()
  const bytes = new Uint8Array(salt as Uint8Array)
  return sodium
    .crypto_generichash(32, new Uint8Array([...bytes, ...new TextEncoder().encode(secret)]), null)
    .slice().buffer
}

function credential(prfResult: ArrayBuffer) {
  return {
    id: CREDENTIAL_ID,
    rawId: new TextEncoder().encode('cred-1').buffer,
    getClientExtensionResults: () => ({ prf: { results: { first: prfResult } } }),
  }
}

/** Authenticator palsu: `getSecret` berbeda dari create() = PRF assertion tidak cocok. */
function installAuthenticator(getSecret = 'rahasia') {
  const create = vi.fn(async (options: CredentialCreationOptions) =>
    credential(await prf(options.publicKey?.extensions?.prf?.eval?.first, 'rahasia')),
  )
  const get = vi.fn(async (options: CredentialRequestOptions) =>
    credential(await prf(options.publicKey?.extensions?.prf?.eval?.first, getSecret)),
  )

  Object.defineProperty(navigator, 'credentials', { value: { create, get }, configurable: true })
  vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
  return { create }
}

function requestMock() {
  return vi.fn<JsonFetch>(async (path, init) => {
    if (path === '/v1/keys/envelopes' && init.method === 'PUT') {
      const body = init.body as { slot: string; wrappedKey: string; kdfParams: object }
      return { data: { ...body, updatedAt: '2026-10-26T00:00:00.000Z' } }
    }
    return { data: { devices: [] } }
  })
}

let keyStore: ReturnType<typeof memoryKeyStore>

beforeEach(async () => {
  clearNuxtState(['accountStatus', 'accountPasskey', 'accountError', 'accountBusy'])
  keyStore = memoryKeyStore()
  const masterKey = createMasterKey(await loadSodium())

  ensure.mockReset()
  ensure.mockResolvedValue({
    userId: USER_ID,
    deviceId: DEVICE_ID,
    keyStore,
    withMasterKey: <T>(work: (key: Uint8Array) => Promise<T>) => work(new Uint8Array(masterKey)),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('activatePasskey', () => {
  it('verifikasi lolos: PUT envelope sekali, lalu petunjuk lokal; handle = turunan id akun', async () => {
    const { create } = installAuthenticator()
    const request = requestMock()
    const account = useAccount({ request, keyStore })

    await account.activatePasskey({ userName: 'u', userDisplayName: 'u' })

    expect(account.error.value).toBeNull()
    expect(request.mock.calls.filter(([, init]) => init.method === 'PUT')).toHaveLength(1)
    expect(keyStore.puts).toEqual(['passkey'])
    expect(account.passkey.value).toBe('set')
    expect(Buffer.from(create.mock.calls[0]?.[0].publicKey?.user.id as Uint8Array)).toEqual(
      Buffer.from(await deriveWebAuthnUserHandle(USER_ID)),
    )
  })

  it('verifikasi GAGAL: putEnvelope TIDAK dipanggil, petunjuk lokal tidak ditulis, error jelas', async () => {
    installAuthenticator('rahasia-lain')
    const request = requestMock()
    const account = useAccount({ request, keyStore })

    await account.activatePasskey({ userName: 'u', userDisplayName: 'u' })

    expect(request.mock.calls.some(([, init]) => init.method === 'PUT')).toBe(false)
    expect(keyStore.puts).toEqual([])
    expect(account.error.value).toMatch(/tidak bisa membuka kunci kembali/)
  })

  it('aktivasi ulang: credentialId lokal masuk excludeCredentials', async () => {
    const { create } = installAuthenticator()
    const account = useAccount({ request: requestMock(), keyStore })

    await account.activatePasskey({ userName: 'u', userDisplayName: 'u' })
    await account.activatePasskey({ userName: 'u', userDisplayName: 'u' })

    expect(create.mock.calls[0]?.[0].publicKey?.excludeCredentials).toEqual([])
    expect(create.mock.calls[1]?.[0].publicKey?.excludeCredentials).toHaveLength(1)
  })
})
