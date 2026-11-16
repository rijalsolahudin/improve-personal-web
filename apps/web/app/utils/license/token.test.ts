import { beforeAll, describe, expect, it } from 'vitest'

import {
  LICENSE_STORAGE_KEY,
  readStoredLicenseToken,
  storeLicenseToken,
  verifyLicenseToken,
} from './token'

const PAYLOAD = {
  v: 1,
  lid: '018f2c4e-0000-7000-8000-00000000000a',
  did: '018f2c4e-0000-7000-8000-0000000000d1',
  iat: 1_700_000_000,
  ed: 'standard',
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

type KeyPair = { readonly privateKey: CryptoKey; readonly publicKey: string }

async function keyPair(): Promise<KeyPair> {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return { privateKey: pair.privateKey, publicKey: toBase64(raw) }
}

/** Token persis seperti server: tanda tangan atas BYTE string `<payload>` base64url. */
async function signToken(privateKey: CryptoKey, payload: unknown): Promise<string> {
  const signed = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, new TextEncoder().encode(signed)),
  )
  return `${signed}.${toBase64Url(signature)}`
}

let server: KeyPair
let other: KeyPair

beforeAll(async () => {
  server = await keyPair()
  other = await keyPair()
})

describe('verifyLicenseToken', () => {
  it('token bertanda tangan kunci server -> payload', async () => {
    const token = await signToken(server.privateKey, PAYLOAD)
    expect(await verifyLicenseToken(token, server.publicKey)).toEqual(PAYLOAD)
  })

  it('payload diubah setelah ditandatangani -> null', async () => {
    const token = await signToken(server.privateKey, PAYLOAD)
    const [, signature] = token.split('.')
    const forged = toBase64Url(
      new TextEncoder().encode(JSON.stringify({ ...PAYLOAD, lid: PAYLOAD.did })),
    )
    expect(await verifyLicenseToken(`${forged}.${signature}`, server.publicKey)).toBeNull()
  })

  it('ditandatangani kunci lain (mis. environment lain) -> null', async () => {
    const token = await signToken(other.privateKey, PAYLOAD)
    expect(await verifyLicenseToken(token, server.publicKey)).toBeNull()
  })

  it('tanda tangan sah tapi payload di luar kontrak -> null', async () => {
    const token = await signToken(server.privateKey, { ...PAYLOAD, email: 'a@b.c' })
    expect(await verifyLicenseToken(token, server.publicKey)).toBeNull()
  })

  it.each(['', 'bukan-token', 'a.b', 'a.b.c'])(
    'token rusak %j -> null, tidak melempar',
    async (t) => {
      expect(await verifyLicenseToken(t, server.publicKey)).toBeNull()
    },
  )

  it('public key kosong (build tanpa konfigurasi) -> null', async () => {
    const token = await signToken(server.privateKey, PAYLOAD)
    expect(await verifyLicenseToken(token, '')).toBeNull()
  })
})

describe('penyimpanan token', () => {
  it('simpan lalu baca ulang', () => {
    localStorage.removeItem(LICENSE_STORAGE_KEY)
    expect(storeLicenseToken('abc.def')).toBe(true)
    expect(readStoredLicenseToken()).toBe('abc.def')
  })

  it('storage yang melempar dianggap kosong / gagal simpan', () => {
    const broken = {
      getItem: () => {
        throw new Error('diblokir')
      },
      setItem: () => {
        throw new Error('penuh')
      },
    } as unknown as Storage

    expect(readStoredLicenseToken(broken)).toBeNull()
    expect(storeLicenseToken('abc.def', broken)).toBe(false)
  })
})
