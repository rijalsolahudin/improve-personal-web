// @vitest-environment node
//
// QA #114: celah adversarial untuk webauthn.ts. `navigator.credentials` PALSU - tidak membuktikan
// perilaku authenticator nyata.
import { createHash } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createWebAuthnAuthenticator,
  createWebAuthnRegistrar,
  deriveWebAuthnUserHandle,
} from './webauthn'

const ACCOUNT = '018f2c4e-0000-7000-8000-00000000000a'
const SALT = new Uint8Array(32).fill(7)
const PRF = new Uint8Array(32).fill(1)

const create = vi.fn<(options: CredentialCreationOptions) => Promise<unknown>>()
const get = vi.fn<(options: CredentialRequestOptions) => Promise<unknown>>()

function credential(prf: object | undefined) {
  return {
    id: 'Y3JlZC0x',
    rawId: new TextEncoder().encode('cred-1').buffer,
    getClientExtensionResults: () => (prf === undefined ? {} : { prf }),
  }
}

beforeEach(() => {
  create.mockReset()
  get.mockReset()
  vi.stubGlobal('window', { PublicKeyCredential: function PublicKeyCredential() {} })
  vi.stubGlobal('navigator', { credentials: { create, get } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function registrar(exclude: readonly string[] = []) {
  return createWebAuthnRegistrar({
    rpName: 'T',
    userName: 'kamu@email.com',
    userDisplayName: 'Kamu',
    userHandle: await deriveWebAuthnUserHandle(ACCOUNT),
    excludeCredentialIds: exclude,
  })
}

describe('user handle', () => {
  it('terkunci ke SHA-256(konteks v1 || id akun): berubah = passkey lama yatim', async () => {
    const expected = createHash('sha256').update(`ip-webauthn-user-handle:v1:${ACCOUNT}`).digest()

    expect(Buffer.from(await deriveWebAuthnUserHandle(ACCOUNT))).toEqual(expected)
  })

  it('opsi create() tidak memuat email/nama/id akun mentah di user.id', async () => {
    create.mockResolvedValue(credential({ results: { first: PRF.slice().buffer } }))

    await (
      await registrar()
    )({ salt: SALT })

    const user = create.mock.calls[0]?.[0].publicKey?.user
    const id = Buffer.from(user?.id as Uint8Array)
    expect(id).toHaveLength(32)
    for (const pii of ['kamu@email.com', 'Kamu', ACCOUNT]) {
      expect(id.includes(Buffer.from(pii))).toBe(false)
    }
  })
})

describe('celah', () => {
  it('fallback get() dibatalkan user (NotAllowedError): error merambat, tidak ada hasil', async () => {
    create.mockResolvedValue(credential({ enabled: true }))
    get.mockRejectedValue(new DOMException('cancel', 'NotAllowedError'))

    await expect((await registrar())({ salt: SALT })).rejects.toMatchObject({
      name: 'NotAllowedError',
    })
  })

  it('create() ditolak error selain InvalidStateError: diteruskan apa adanya', async () => {
    create.mockRejectedValue(new DOMException('x', 'NotAllowedError'))

    await expect((await registrar())({ salt: SALT })).rejects.toMatchObject({
      name: 'NotAllowedError',
    })
  })

  it('excludeCredentials berisi base64 rusak: MENOLAK (bukan diabaikan) dan create() tidak dipanggil', async () => {
    await expect((await registrar(['!!bukan base64!!']))({ salt: SALT })).rejects.toBeInstanceOf(
      Error,
    )
    expect(create).not.toHaveBeenCalled()
  })

  it('PRF mentah bukan ArrayBuffer (mis. Uint8Array) diperlakukan sebagai tidak didukung', async () => {
    create.mockResolvedValue(credential({ results: { first: PRF } }))

    await expect((await registrar())({ salt: SALT })).rejects.toThrow(/tidak mendukung prf/)
  })

  it('PRF lebih panjang dari 32 byte dipotong ke 32', async () => {
    create.mockResolvedValue(credential({ results: { first: new Uint8Array(64).fill(5).buffer } }))

    const result = await (await registrar())({ salt: SALT })

    expect(result.prfOutput).toHaveLength(32)
  })

  it('WebAuthn tidak tersedia: menolak sebelum menyentuh authenticator', async () => {
    vi.stubGlobal('navigator', {})

    await expect(createWebAuthnAuthenticator()({ salt: SALT })).rejects.toThrow(/tidak tersedia/)
    await expect((await registrar())({ salt: SALT })).rejects.toThrow(/tidak tersedia/)
  })
})
