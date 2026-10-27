// @vitest-environment node
//
// QA #114: bukti zeroing salinan kunci utama hasil verifikasi buka-kembali.
//
// Satu-satunya cara menangkap buffer internal tanpa mengubah kode produk adalah mengintai
// `sodium.memcmp` (argumen pertama = hasil buka kembali). Ini membuktikan EFEK (buffer nol setelah
// dipakai), bukan jalur kodenya.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMasterKey } from './master-key'
import { PasskeyVerificationError, createVerifiedPasskeyEnvelope } from './passkey'
import type { PasskeyPrfProvider } from './passkey'
import { loadSodium } from './sodium'

function authenticator(credentialId = 'cred-1'): PasskeyPrfProvider {
  return async ({ salt }) => {
    const sodium = await loadSodium()
    return {
      credentialId,
      prfOutput: sodium.crypto_generichash(32, new Uint8Array([...salt, 1, 2, 3]), null),
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createVerifiedPasskeyEnvelope: zeroing', () => {
  it('sukses: salinan hasil buka kembali dikosongkan, kunci milik pemanggil utuh', async () => {
    const sodium = await loadSodium()
    const masterKey = createMasterKey(sodium)
    const original = new Uint8Array(masterKey)
    const spy = vi.spyOn(sodium, 'memcmp')

    await createVerifiedPasskeyEnvelope({
      masterKey,
      register: authenticator(),
      authenticate: authenticator(),
    })

    const reopened = spy.mock.calls[0]?.[0] as Uint8Array
    expect(reopened).not.toBe(masterKey)
    expect(reopened.every((byte) => byte === 0)).toBe(true)
    expect(Buffer.from(masterKey)).toEqual(Buffer.from(original))
  })

  it('memcmp menolak (kunci beda): tetap dikosongkan dan PasskeyVerificationError', async () => {
    const sodium = await loadSodium()
    const masterKey = createMasterKey(sodium)
    const spy = vi.spyOn(sodium, 'memcmp').mockReturnValue(false)

    await expect(
      createVerifiedPasskeyEnvelope({
        masterKey,
        register: authenticator(),
        authenticate: authenticator(),
      }),
    ).rejects.toBeInstanceOf(PasskeyVerificationError)

    const reopened = spy.mock.calls[0]?.[0] as Uint8Array
    expect(reopened.every((byte) => byte === 0)).toBe(true)
  })

  it('PRF assertion berbeda panjang/isi: tidak ada envelope bocor lewat nilai kembalian', async () => {
    const sodium = await loadSodium()

    const outcome = await createVerifiedPasskeyEnvelope({
      masterKey: createMasterKey(sodium),
      register: authenticator('a'),
      authenticate: authenticator('a'),
    }).then(
      (value) => value,
      (error: unknown) => error,
    )
    expect(outcome).toHaveProperty('envelope')

    const failed = await createVerifiedPasskeyEnvelope({
      masterKey: createMasterKey(sodium),
      register: async (request) => ({
        ...(await authenticator('a')(request)),
        prfOutput: new Uint8Array(32).fill(9),
      }),
      authenticate: authenticator('a'),
    }).then(
      (value) => value,
      (error: unknown) => error,
    )
    expect(failed).toBeInstanceOf(PasskeyVerificationError)
    expect(failed).not.toHaveProperty('envelope')
  })
})
