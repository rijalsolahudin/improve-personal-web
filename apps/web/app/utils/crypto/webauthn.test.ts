// @vitest-environment node
//
// Opsi yang kita kirim ke WebAuthn + cabang hasil ekstensi `prf`.
//
// `navigator.credentials` di sini PALSU. Test ini membuktikan apa yang kita MINTA ke browser dan
// bagaimana kita bereaksi terhadap tiap bentuk jawaban - bukan bahwa authenticator sungguhan menjawab
// begitu. Perilaku authenticator nyata (PRF create() == get(), passkey ditemukan di perangkat lain)
// hanya terbukti lewat browser/perangkat nyata; lihat catatan di `webauthn.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createWebAuthnAuthenticator,
  createWebAuthnRegistrar,
  deriveWebAuthnUserHandle,
} from './webauthn'

const ACCOUNT = '018f2c4e-0000-7000-8000-00000000000a'
const CREDENTIAL_ID = 'Y3JlZC0x' // base64url("cred-1")
const CREDENTIAL_RAW = new TextEncoder().encode('cred-1')
const SALT = new Uint8Array(32).fill(7)
const PRF_FROM_CREATE = new Uint8Array(32).fill(1)
const PRF_FROM_GET = new Uint8Array(32).fill(2)

type PrfOutput = { enabled?: boolean; results?: { first?: ArrayBuffer } }

function fakeCredential(prf: PrfOutput | undefined) {
  return {
    id: CREDENTIAL_ID,
    rawId: CREDENTIAL_RAW.slice().buffer,
    getClientExtensionResults: () => (prf === undefined ? {} : { prf }),
  }
}

function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer
}

const create = vi.fn<(options: CredentialCreationOptions) => Promise<unknown>>()
const get = vi.fn<(options: CredentialRequestOptions) => Promise<unknown>>()

beforeEach(() => {
  create.mockReset()
  get.mockReset()
  vi.stubGlobal('window', { PublicKeyCredential: function PublicKeyCredential() {} })
  vi.stubGlobal('navigator', { credentials: { create, get } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function registrar(excludeCredentialIds: readonly string[] = []) {
  return createWebAuthnRegistrar({
    rpName: 'Test',
    userName: 'kamu@email.com',
    userDisplayName: 'kamu@email.com',
    userHandle: await deriveWebAuthnUserHandle(ACCOUNT),
    excludeCredentialIds,
  })
}

function createOptions(): PublicKeyCredentialCreationOptions {
  const options = create.mock.calls[0]?.[0].publicKey
  if (options === undefined) throw new Error('create() tidak dipanggil')
  return options
}

function getOptions(call = 0): PublicKeyCredentialRequestOptions {
  const options = get.mock.calls[call]?.[0].publicKey
  if (options === undefined) throw new Error('get() tidak dipanggil')
  return options
}

describe('deriveWebAuthnUserHandle', () => {
  it('stabil untuk akun yang sama, berbeda antar akun, 32 byte', async () => {
    const first = await deriveWebAuthnUserHandle(ACCOUNT)
    const again = await deriveWebAuthnUserHandle(ACCOUNT)
    const other = await deriveWebAuthnUserHandle('018f2c4e-0000-7000-8000-00000000000b')

    expect(first).toHaveLength(32)
    expect(Buffer.from(again)).toEqual(Buffer.from(first))
    expect(Buffer.from(other)).not.toEqual(Buffer.from(first))
  })

  it('tidak memuat id akun mentah', async () => {
    const handle = Buffer.from(await deriveWebAuthnUserHandle(ACCOUNT))

    expect(handle.includes(Buffer.from(ACCOUNT))).toBe(false)
    expect(handle.toString('latin1')).not.toContain(ACCOUNT.slice(0, 8))
  })

  it('id akun kosong ditolak, bukan menghasilkan handle bersama', async () => {
    await expect(deriveWebAuthnUserHandle('')).rejects.toThrow(/kosong/)
  })
})

describe('registrasi', () => {
  it('meminta UV + discoverable WAJIB, user handle stabil, dan excludeCredentials', async () => {
    create.mockResolvedValue(fakeCredential({ results: { first: buffer(PRF_FROM_CREATE) } }))

    const result = await (await registrar([CREDENTIAL_ID]))({ salt: SALT })

    const options = createOptions()
    expect(options.authenticatorSelection).toMatchObject({
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    })
    expect(Buffer.from(options.user.id as Uint8Array)).toEqual(
      Buffer.from(await deriveWebAuthnUserHandle(ACCOUNT)),
    )
    expect(options.excludeCredentials?.map((item) => Buffer.from(item.id as Uint8Array))).toEqual([
      Buffer.from(CREDENTIAL_RAW),
    ])
    expect(Buffer.from(options.extensions?.prf?.eval?.first as Uint8Array)).toEqual(
      Buffer.from(SALT),
    )

    expect(result.credentialId).toBe(CREDENTIAL_ID)
    expect(Buffer.from(result.prfOutput)).toEqual(Buffer.from(PRF_FROM_CREATE))
    expect(result.isAssertion).toBeUndefined()
    expect(get).not.toHaveBeenCalled()
  })

  it('user handle sama di dua aktivasi akun yang sama', async () => {
    create.mockResolvedValue(fakeCredential({ results: { first: buffer(PRF_FROM_CREATE) } }))

    await (
      await registrar()
    )({ salt: SALT })
    await (
      await registrar()
    )({ salt: SALT })

    const [first, second] = create.mock.calls.map(([options]) =>
      Buffer.from(options.publicKey?.user.id as Uint8Array),
    )
    expect(second).toEqual(first)
  })

  it('hanya `prf.enabled`: get() langsung ke kredensial baru dengan salt sama dan UV wajib', async () => {
    create.mockResolvedValue(fakeCredential({ enabled: true }))
    get.mockResolvedValue(fakeCredential({ results: { first: buffer(PRF_FROM_GET) } }))

    const result = await (await registrar())({ salt: SALT })

    expect(get).toHaveBeenCalledTimes(1)
    const options = getOptions()
    expect(options.userVerification).toBe('required')
    expect(options.allowCredentials?.map((item) => Buffer.from(item.id as Uint8Array))).toEqual([
      Buffer.from(CREDENTIAL_RAW),
    ])
    expect(Buffer.from(options.extensions?.prf?.eval?.first as Uint8Array)).toEqual(
      Buffer.from(SALT),
    )

    expect(Buffer.from(result.prfOutput)).toEqual(Buffer.from(PRF_FROM_GET))
    expect(result.isAssertion).toBe(true)
  })

  it('tanpa dukungan prf sama sekali: MENOLAK, tanpa get() dan tanpa kunci cadangan', async () => {
    for (const prf of [undefined, {}, { enabled: false }]) {
      create.mockResolvedValueOnce(fakeCredential(prf))
      await expect((await registrar())({ salt: SALT })).rejects.toThrow(/tidak mendukung prf/)
    }

    expect(get).not.toHaveBeenCalled()
  })

  it('`prf.enabled` tapi get() juga tanpa hasil: MENOLAK', async () => {
    create.mockResolvedValue(fakeCredential({ enabled: true }))
    get.mockResolvedValue(fakeCredential({ enabled: true }))

    await expect((await registrar())({ salt: SALT })).rejects.toThrow(
      /tidak mengembalikan hasil prf/,
    )
  })

  it('output prf yang terlalu pendek diperlakukan sebagai tidak ada', async () => {
    create.mockResolvedValue(fakeCredential({ results: { first: new ArrayBuffer(16) } }))

    await expect((await registrar())({ salt: SALT })).rejects.toThrow(/tidak mendukung prf/)
  })

  it('kredensial yang dikecualikan sudah ada: pesan jelas, bukan error mentah', async () => {
    create.mockRejectedValue(new DOMException('exists', 'InvalidStateError'))

    await expect((await registrar([CREDENTIAL_ID]))({ salt: SALT })).rejects.toThrow(
      /sudah menyimpan passkey akun ini/,
    )
  })

  it('dibatalkan user (null) ditolak', async () => {
    create.mockResolvedValue(null)

    await expect((await registrar())({ salt: SALT })).rejects.toThrow(/dibatalkan/)
  })
})

describe('autentikasi', () => {
  it('UV WAJIB; tanpa credentialId = discoverable (allowCredentials kosong)', async () => {
    get.mockResolvedValue(fakeCredential({ results: { first: buffer(PRF_FROM_GET) } }))

    const result = await createWebAuthnAuthenticator()({ salt: SALT })

    expect(getOptions().userVerification).toBe('required')
    expect(getOptions().allowCredentials).toEqual([])
    expect(Buffer.from(result.prfOutput)).toEqual(Buffer.from(PRF_FROM_GET))
  })

  it('dengan credentialId: diarahkan ke kredensial itu', async () => {
    get.mockResolvedValue(fakeCredential({ results: { first: buffer(PRF_FROM_GET) } }))

    await createWebAuthnAuthenticator()({ credentialId: CREDENTIAL_ID, salt: SALT })

    expect(
      getOptions().allowCredentials?.map((item) => Buffer.from(item.id as Uint8Array)),
    ).toEqual([Buffer.from(CREDENTIAL_RAW)])
  })

  it('tanpa hasil prf: MENOLAK', async () => {
    get.mockResolvedValue(fakeCredential({ enabled: true }))

    await expect(createWebAuthnAuthenticator()({ salt: SALT })).rejects.toThrow(
      /tidak mengembalikan hasil prf/,
    )
  })

  it('salt yang bukan 32 byte ditolak sebelum menyentuh authenticator', async () => {
    await expect(createWebAuthnAuthenticator()({ salt: new Uint8Array(8) })).rejects.toThrow(
      /32 byte/,
    )
    expect(get).not.toHaveBeenCalled()
  })
})
