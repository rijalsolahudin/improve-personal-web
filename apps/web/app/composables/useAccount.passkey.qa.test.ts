import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SecureKeyStore } from '@improve-personal/core'

import { createMasterKey } from '~/utils/crypto/master-key'
import { loadSodium } from '~/utils/crypto/sodium'
import type { JsonFetch } from '~/utils/http/json-fetch'

import { useAccount } from './useAccount'

/**
 * QA #114: celah adversarial aktivasi passkey. WebAuthn + jaringan di-mock di batas; tidak
 * membuktikan authenticator nyata.
 */
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const CREDENTIAL_ID = 'Y3JlZC0x'

const ensure = vi.hoisted(() => vi.fn())
vi.mock('~/composables/useLocalData', () => ({ useLocalData: () => ({ ensure }) }))

type Row = { kind: string; handle: unknown }

function memoryKeyStore(failPut = false) {
  const rows = new Map<string, Row>()
  const puts: string[] = []
  const store: SecureKeyStore & { readonly puts: string[]; readonly rows: Map<string, Row> } = {
    puts,
    rows,
    has: async (slot) => rows.has(slot),
    put: async (slot, material) => {
      if (failPut) throw new Error('penyimpanan penuh')
      puts.push(slot)
      rows.set(slot, { kind: material.kind, handle: material.handle })
    },
    get: async (slot) => rows.get(slot) ?? null,
    remove: async (slot) => {
      rows.delete(slot)
    },
  }
  return store
}

async function prf(salt: BufferSource | undefined): Promise<ArrayBuffer> {
  const sodium = await loadSodium()
  return sodium.crypto_generichash(32, new Uint8Array(salt as Uint8Array), null).slice().buffer
}

function credential(results: ArrayBuffer | undefined) {
  return {
    id: CREDENTIAL_ID,
    rawId: new TextEncoder().encode('cred-1').buffer,
    getClientExtensionResults: () =>
      results === undefined ? { prf: { enabled: true } } : { prf: { results: { first: results } } },
  }
}

function install(mode: 'create-prf' | 'enabled-only-get-cancel') {
  const create = vi.fn(async (options: CredentialCreationOptions) =>
    mode === 'create-prf'
      ? credential(await prf(options.publicKey?.extensions?.prf?.eval?.first))
      : credential(undefined),
  )
  const get = vi.fn(async (options: CredentialRequestOptions) => {
    if (mode === 'enabled-only-get-cancel') throw new DOMException('cancel', 'NotAllowedError')
    return credential(await prf(options.publicKey?.extensions?.prf?.eval?.first))
  })
  Object.defineProperty(navigator, 'credentials', { value: { create, get }, configurable: true })
  vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
  return { create, get }
}

function requestMock(failPut = false) {
  return vi.fn<JsonFetch>(async (path, init) => {
    if (path === '/v1/keys/envelopes' && init.method === 'PUT') {
      if (failPut) throw new Error('boom')
      const body = init.body as object
      return { data: { ...body, updatedAt: '2026-10-26T00:00:00.000Z' } }
    }
    return { data: { devices: [] } }
  })
}

const puts = (request: ReturnType<typeof requestMock>) =>
  request.mock.calls.filter(([, init]) => init.method === 'PUT')

let keyStore: ReturnType<typeof memoryKeyStore>

async function arrange(userId = USER_ID, store = memoryKeyStore()) {
  keyStore = store
  const masterKey = createMasterKey(await loadSodium())
  ensure.mockReset()
  ensure.mockResolvedValue({
    userId,
    deviceId: 'dev-1',
    keyStore,
    withMasterKey: <T>(work: (key: Uint8Array) => Promise<T>) => work(new Uint8Array(masterKey)),
  })
}

beforeEach(async () => {
  clearNuxtState(['accountStatus', 'accountPasskey', 'accountError', 'accountBusy'])
  await arrange()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const input = { userName: 'u', userDisplayName: 'u' }

describe('activatePasskey: celah', () => {
  it('get() fallback dibatalkan di tengah aktivasi: tidak ada PUT/simpan, busy kembali false, error terlihat', async () => {
    install('enabled-only-get-cancel')
    const request = requestMock()
    const account = useAccount({ request, keyStore })

    await account.activatePasskey(input)

    expect(puts(request)).toHaveLength(0)
    expect(keyStore.puts).toEqual([])
    expect(account.busy.value).toBe(false)
    expect(account.status.value).toBe('error')
    expect(account.error.value).not.toBeNull()
  })

  it('user sesi kosong: ditolak sebelum menyentuh authenticator', async () => {
    await arrange('')
    const { create } = install('create-prf')
    const request = requestMock()
    const account = useAccount({ request, keyStore })

    await account.activatePasskey(input)

    expect(create).not.toHaveBeenCalled()
    expect(puts(request)).toHaveLength(0)
    expect(account.busy.value).toBe(false)
    expect(account.error.value).toMatch(/id akun kosong/)
  })

  // BUG QA #114-1 (Medium): produk melempar 'Invalid character' dan aktivasi macet selamanya.
  // `it.fails` = test ini HARUS dibalik jadi `it` begitu bug diperbaiki.
  it.fails(
    'petunjuk lokal dengan credentialId base64 rusak: aktivasi tetap bisa (komentar produk: "dianggap tidak ada")',
    async () => {
      const store = memoryKeyStore()
      store.rows.set('passkey', {
        kind: 'passkey-webauthn',
        handle: { credentialId: '!!rusak!!', salt: 'x' },
      })
      await arrange(USER_ID, store)
      install('create-prf')
      const request = requestMock()
      const account = useAccount({ request, keyStore })

      await account.activatePasskey(input)

      expect(account.error.value).toBeNull()
      expect(puts(request)).toHaveLength(1)
    },
  )

  it('PUT sukses tapi simpan lokal gagal: error terlihat, busy false, envelope server sudah baru', async () => {
    await arrange(USER_ID, memoryKeyStore(true))
    install('create-prf')
    const request = requestMock()
    const account = useAccount({ request, keyStore })

    await account.activatePasskey(input)

    expect(puts(request)).toHaveLength(1)
    expect(account.error.value).toMatch(/penyimpanan penuh/)
    expect(account.busy.value).toBe(false)
    expect(await keyStore.has('passkey')).toBe(false)
  })

  it('PUT server gagal: petunjuk lokal TIDAK ditulis', async () => {
    install('create-prf')
    const request = requestMock(true)
    const account = useAccount({ request, keyStore })

    await account.activatePasskey(input)

    expect(keyStore.puts).toEqual([])
    expect(account.busy.value).toBe(false)
    expect(account.error.value).not.toBeNull()
  })

  it('InvalidStateError dari create(): pesan jelas sampai ke UI, tidak ada PUT', async () => {
    const create = vi.fn(async () => {
      throw new DOMException('exists', 'InvalidStateError')
    })
    Object.defineProperty(navigator, 'credentials', {
      value: { create, get: vi.fn() },
      configurable: true,
    })
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
    const request = requestMock()
    const account = useAccount({ request, keyStore })

    await account.activatePasskey(input)

    expect(puts(request)).toHaveLength(0)
    expect(account.error.value).toMatch(/sudah menyimpan passkey akun ini/)
  })
})
