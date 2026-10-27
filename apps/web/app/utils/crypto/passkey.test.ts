// @vitest-environment node
//
// Passkey + transfer QR + gateway keys.
//
// Yang diuji di sini adalah bagian yang BISA diuji tanpa browser: pembungkusan/pembukaan kunci, bentuk
// data yang dikirim ke server (harus lolos schema kontrak), dan pemetaan kegagalan HTTP.
//
// Yang TIDAK diuji di sini, dan tidak diklaim: cerita WebAuthn sendiri (`navigator.credentials` +
// ekstensi `prf`). Itu butuh authenticator nyata - lihat catatan di `webauthn.ts`.
import { describe, expect, it, vi } from 'vitest'

import { kdfParamsSchema, type ErrorCode } from '@improve-personal/contracts'
import type { SecureKeyStore } from '@improve-personal/core'

import { createMasterKey } from './master-key'
import { loadSodium } from './sodium'
import {
  PASSKEY_MATERIAL_KIND,
  PasskeyVerificationError,
  createPasskeyEnvelope,
  createVerifiedPasskeyEnvelope,
  readPasskeyMaterial,
  savePasskeyMaterial,
  toEnvelopePutInput,
  unlockMasterKeyWithPasskey,
  type PasskeyMaterial,
  type PasskeyPrfProvider,
} from './passkey'
import { KeysRequestError, createKeysGateway } from './keys-gateway'
import {
  TRANSFER_QR_VERSION,
  createTransferRequest,
  parseTransferQrPayload,
  sealTransferResponse,
} from './transfer'

/** Penyimpan kunci in-memory untuk test: yang diuji di sini bukan IndexedDB-nya. */
function memoryKeyStore(): SecureKeyStore {
  const rows = new Map<string, { kind: string; handle: unknown }>()

  return {
    has: async (slot) => rows.has(slot),
    put: async (slot, material) => {
      rows.set(slot, { kind: material.kind, handle: material.handle })
    },
    get: async (slot) => rows.get(slot) ?? null,
    remove: async (slot) => {
      rows.delete(slot)
    },
  }
}

/** Authenticator palsu: PRF deterministik per (credentialId, salt) - seperti authenticator sungguhan. */
function fakeAuthenticator(credentialId = 'cred-1'): PasskeyPrfProvider {
  return async ({ salt }) => {
    const sodium = await loadSodium()
    return {
      credentialId,
      prfOutput: sodium.crypto_generichash(
        32,
        new Uint8Array([...salt, ...new TextEncoder().encode(credentialId)]),
        null,
      ),
    }
  }
}

describe('passkey', () => {
  it('bungkus lalu buka: kunci utama yang sama, dan envelope-nya lolos schema server', async () => {
    const sodium = await loadSodium()
    const masterKey = createMasterKey(sodium)

    const { envelope, material } = await createPasskeyEnvelope(masterKey, fakeAuthenticator())

    // `kdfParams` dikirim ke server: kalau bentuknya tidak sesuai batas kontrak, server menolaknya
    // (dan lebih baik ketahuan di sini daripada di produksi).
    expect(kdfParamsSchema.safeParse(envelope.kdfParams).success).toBe(true)
    expect(toEnvelopePutInput(envelope).slot).toBe('passkey')

    const recovered = await unlockMasterKeyWithPasskey({ envelope, prf: fakeAuthenticator() })

    expect(Buffer.from(recovered)).toEqual(Buffer.from(masterKey))
    expect(material.kind).toBe(PASSKEY_MATERIAL_KIND)
  })

  it('kredensial/passkey yang berbeda tidak bisa membuka envelope', async () => {
    const sodium = await loadSodium()
    const { envelope } = await createPasskeyEnvelope(
      createMasterKey(sodium),
      fakeAuthenticator('cred-asli'),
    )

    await expect(
      unlockMasterKeyWithPasskey({ envelope, prf: fakeAuthenticator('cred-lain') }),
    ).rejects.toThrow(/tidak cocok/)
  })

  it('envelope tidak memuat kunci utama polos', async () => {
    const sodium = await loadSodium()
    const masterKey = createMasterKey(sodium)
    const { envelope } = await createPasskeyEnvelope(masterKey, fakeAuthenticator())

    const haystacks = [
      Buffer.from(JSON.stringify(envelope)),
      Buffer.from(envelope.wrappedKey, 'base64'),
    ]
    expect(haystacks.some((haystack) => haystack.includes(Buffer.from(masterKey)))).toBe(false)
  })

  it('versi KDF asing ditolak, bukan ditebak', async () => {
    const sodium = await loadSodium()
    const { envelope } = await createPasskeyEnvelope(createMasterKey(sodium), fakeAuthenticator())

    await expect(
      unlockMasterKeyWithPasskey({
        envelope: { ...envelope, kdfParams: { ...envelope.kdfParams, ver: 9 } },
        prf: fakeAuthenticator(),
      }),
    ).rejects.toThrow(/tidak dikenal/)
  })

  it('petunjuk lokal (credentialId + salt) disimpan dan dibaca kembali; bentuk asing ditolak', async () => {
    const sodium = await loadSodium()
    const keyStore = memoryKeyStore()
    const { material } = await createPasskeyEnvelope(
      createMasterKey(sodium),
      fakeAuthenticator('cred-9'),
    )

    expect(await readPasskeyMaterial(keyStore)).toBeNull()

    await savePasskeyMaterial(keyStore, material)
    expect(await readPasskeyMaterial(keyStore)).toEqual({
      credentialId: 'cred-9',
      salt: material.handle.salt,
    })

    await keyStore.put('passkey', { kind: 'sesuatu', handle: {} })
    await expect(readPasskeyMaterial(keyStore)).rejects.toThrow(/tidak dikenal/)

    await keyStore.put('passkey', { kind: PASSKEY_MATERIAL_KIND, handle: {} } as PasskeyMaterial)
    await expect(readPasskeyMaterial(keyStore)).rejects.toThrow(/rusak/)
  })
})

describe('createVerifiedPasskeyEnvelope', () => {
  it('PRF dari create(): dibuktikan lewat get() sungguhan ke kredensial yang sama', async () => {
    const sodium = await loadSodium()
    const masterKey = createMasterKey(sodium)
    const authenticate = vi.fn(fakeAuthenticator('cred-1'))

    const { envelope, material } = await createVerifiedPasskeyEnvelope({
      masterKey,
      register: fakeAuthenticator('cred-1'),
      authenticate,
    })

    expect(authenticate).toHaveBeenCalledTimes(1)
    expect(authenticate.mock.calls[0]?.[0].credentialId).toBe('cred-1')
    expect(material.handle.credentialId).toBe('cred-1')
    const recovered = await unlockMasterKeyWithPasskey({ envelope, prf: fakeAuthenticator() })
    expect(Buffer.from(recovered)).toEqual(Buffer.from(masterKey))
  })

  it('PRF sudah dari get() (isAssertion): dipakai ulang, tanpa sentuhan ketiga', async () => {
    const sodium = await loadSodium()
    const assertion = fakeAuthenticator('cred-1')
    const authenticate = vi.fn(fakeAuthenticator('cred-1'))

    await createVerifiedPasskeyEnvelope({
      masterKey: createMasterKey(sodium),
      register: async (request) => ({ ...(await assertion(request)), isAssertion: true }),
      authenticate,
    })

    expect(authenticate).not.toHaveBeenCalled()
  })

  it('PRF get() berbeda dari create() (mis. UV beda): DITOLAK, tidak ada envelope dikembalikan', async () => {
    const sodium = await loadSodium()

    await expect(
      createVerifiedPasskeyEnvelope({
        masterKey: createMasterKey(sodium),
        register: fakeAuthenticator('cred-create'),
        authenticate: fakeAuthenticator('cred-get'),
      }),
    ).rejects.toBeInstanceOf(PasskeyVerificationError)
  })

  it('get() verifikasi gagal/dibatalkan: DITOLAK sebagai kegagalan verifikasi', async () => {
    const sodium = await loadSodium()

    await expect(
      createVerifiedPasskeyEnvelope({
        masterKey: createMasterKey(sodium),
        register: fakeAuthenticator(),
        authenticate: async () => {
          throw new Error('permintaan passkey dibatalkan')
        },
      }),
    ).rejects.toThrow(/tidak bisa membuka kunci kembali/)
  })

  it('kunci utama milik pemanggil tidak dikosongkan oleh verifikasi', async () => {
    const sodium = await loadSodium()
    const masterKey = createMasterKey(sodium)
    const copy = new Uint8Array(masterKey)

    await createVerifiedPasskeyEnvelope({
      masterKey,
      register: fakeAuthenticator(),
      authenticate: fakeAuthenticator(),
    })

    expect(Buffer.from(masterKey)).toEqual(Buffer.from(copy))
  })
})

describe('transfer QR', () => {
  it('alur dua perangkat: perangkat lama membungkus, perangkat baru membuka kunci yang sama', async () => {
    const sodium = await loadSodium()
    const masterKey = createMasterKey(sodium)

    // Perangkat BARU: bikin permintaan + tampilkan QR.
    const request = await createTransferRequest()
    const payload = parseTransferQrPayload(request.qrPayload)
    expect(payload.v).toBe(TRANSFER_QR_VERSION)

    // Perangkat LAMA: scan QR, bungkus kunci utama (ini yang dikirim ke server).
    const blob = await sealTransferResponse(request.qrPayload, masterKey)

    // Server tidak bisa membukanya - yang membuka hanya perangkat baru.
    expect(blob).not.toContain(sodium.to_base64(masterKey, sodium.base64_variants.ORIGINAL))

    const recovered = await request.openSealed(blob)
    expect(Buffer.from(recovered)).toEqual(Buffer.from(masterKey))
  })

  it('kiriman untuk QR lain ditolak (nonce tidak cocok)', async () => {
    const sodium = await loadSodium()
    const first = await createTransferRequest()
    const second = await createTransferRequest()

    // Perangkat lama membungkus untuk permintaan pertama; perangkat kedua mencoba memakainya.
    const blob = await sealTransferResponse(first.qrPayload, createMasterKey(sodium))

    await expect(second.openSealed(blob)).rejects.toThrow(/bukan untuk permintaan ini/)
  })

  it('QR dengan versi/bentuk asing ditolak sebelum kunci dibungkus', async () => {
    expect(() => parseTransferQrPayload('bukan json')).toThrow(/bukan JSON/)
    expect(() =>
      parseTransferQrPayload(JSON.stringify({ v: 99, publicKey: 'x', nonce: 'y' })),
    ).toThrow(/tidak dikenal/)
    expect(() => parseTransferQrPayload(JSON.stringify({ v: 1, publicKey: 'x' }))).toThrow(
      /tidak dikenal/,
    )

    // Yang penting: kunci utama tidak pernah dibungkus ke public key yang tidak dikenal.
    await expect(
      sealTransferResponse('bukan json', createMasterKey(await loadSodium())),
    ).rejects.toThrow(/bukan JSON/)
  })

  it('blob yang diubah ditolak', async () => {
    const sodium = await loadSodium()
    const request = await createTransferRequest()
    const blob = await sealTransferResponse(request.qrPayload, createMasterKey(sodium))

    const raw = Buffer.from(blob, 'base64')
    raw[raw.length - 1] = (raw.at(-1) ?? 0) ^ 0xff

    await expect(request.openSealed(raw.toString('base64'))).rejects.toThrow(/tidak bisa dibuka/)
  })
})

describe('gateway keys', () => {
  it('putEnvelope: path, method, body, dan parsing respons kontrak', async () => {
    const calls: Array<{ path: string; method: string; body?: unknown }> = []
    const gateway = createKeysGateway(async (path, options) => {
      calls.push({ path, method: options.method, body: options.body })
      return {
        data: {
          slot: 'passkey',
          wrappedKey: 'AAAA',
          kdfParams: { kdf: 'webauthn-prf', ver: 1, salt: 'BBBB' },
          updatedAt: '2026-10-19T00:00:00.000Z',
        },
      }
    })

    const envelope = await gateway.putEnvelope({
      slot: 'passkey',
      wrappedKey: 'AAAA',
      kdfParams: { kdf: 'webauthn-prf', ver: 1, salt: 'BBBB' },
    })

    expect(calls).toEqual([
      {
        path: '/v1/keys/envelopes',
        method: 'PUT',
        body: {
          slot: 'passkey',
          wrappedKey: 'AAAA',
          kdfParams: { kdf: 'webauthn-prf', ver: 1, salt: 'BBBB' },
        },
      },
    ])
    expect(envelope.slot).toBe('passkey')
  })

  it('respons yang menyimpang dari kontrak dilaporkan INTERNAL, bukan lolos ke UI', async () => {
    const gateway = createKeysGateway(async () => ({ data: { slot: 'otp' } }))

    await expect(
      gateway.putEnvelope({ slot: 'passkey', wrappedKey: 'AAAA', kdfParams: {} }),
    ).rejects.toMatchObject({ code: 'INTERNAL' })
  })

  it('error server dipetakan ke kode kontrak, dan kegagalan jaringan dibedakan', async () => {
    const fromServer = createKeysGateway(async () => {
      throw { status: 401, data: { error: { code: 'UNAUTHENTICATED', message: 'x' } } }
    })
    await expect(fromServer.listEnvelopes()).rejects.toBeInstanceOf(KeysRequestError)
    await expect(fromServer.listEnvelopes()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED' satisfies ErrorCode,
      isNetworkError: false,
    })

    // Tanpa status = tidak pernah dapat respons HTTP.
    const offline = createKeysGateway(async () => {
      throw new Error('fetch failed')
    })
    await expect(offline.listEnvelopes()).rejects.toMatchObject({
      code: 'INTERNAL',
      isNetworkError: true,
    })

    // Body error yang tidak terbaca: kode diturunkan dari status.
    const bare = createKeysGateway(async () => {
      throw { status: 429 }
    })
    await expect(bare.listEnvelopes()).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('transfer: kirim target + blob, dan klaim memakai id di path', async () => {
    const calls: string[] = []
    const gateway = createKeysGateway(async (path, options) => {
      calls.push(`${options.method} ${path}`)
      if (path.includes('/transfer/')) return { data: { blob: 'BLOB' } }
      return { data: { id: 'a'.repeat(22), expiresAt: '2026-10-19T00:00:00.000Z' } }
    })

    const created = await gateway.createTransfer({
      targetDeviceId: '018f2c4e-0000-7000-8000-0000000000d1',
      blob: 'BLOB',
    })
    const claimed = await gateway.claimTransfer(created.id)

    expect(calls).toEqual(['POST /v1/keys/transfer', `POST /v1/keys/transfer/${'a'.repeat(22)}`])
    expect(claimed.blob).toBe('BLOB')
  })
})
