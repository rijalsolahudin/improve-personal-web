// @vitest-environment node
//
// `CryptoProvider` web, format blob v2 (spec #120). Yang diuji di sini bukan "libsodium jalan" (itu
// urusan library), tapi janji yang kita pegang sendiri (ARCHITECTURE §6, ADR 4):
// - round-trip plaintext utuh, termasuk teks non-ASCII,
// - layout byte persis sama dengan yang dikunci contracts (header, nonce, ciphertext berpad),
// - AAD mengikat KID, akun, record, HLC, dan `deleted`,
// - kunci/AAD salah, blob v1, dan blob rusak = GAGAL, bukan terbuka dengan isi yang salah.
import { beforeEach, describe, expect, it } from 'vitest'

import {
  KID_BYTES,
  RECORD_V2_KID_OFFSET,
  RECORD_V2_NONCE_OFFSET,
  RECORD_V2_CIPHERTEXT_OFFSET,
  SEALED_RECORD_V2_MAX_PLAINTEXT_BYTES,
  RECORD_PAD_BLOCK_BYTES,
  encodeKid,
  encodeRecordAadV2,
  encodeSealedBlobHeaderV2,
  parseSealedBlobHeader,
  sealedRecordV2BlobBytes,
} from '@improve-personal/contracts'
import type { CryptoProvider } from '@improve-personal/core'

import { loadSodium } from './sodium'
import { TEST_HLC, TEST_USER_ID, testKeyIdentity } from '../../../tests/nuxt/record-key'
import { createSodiumCryptoProvider, rawDataKeyMaterial } from './provider'

const RECORD_ID = '018f2c4e-0000-7000-8000-000000000001'
const OTHER_RECORD_ID = '018f2c4e-0000-7000-8000-000000000002'
const META = { recordId: RECORD_ID, hlc: TEST_HLC, deleted: false }

function keyOf(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill)
}

function bytesOf(blob: string): Buffer {
  return Buffer.from(blob, 'base64')
}

let provider: CryptoProvider
let dataKey: ReturnType<typeof rawDataKeyMaterial>

beforeEach(async () => {
  provider = await createSodiumCryptoProvider()
  dataKey = rawDataKeyMaterial(keyOf(7), testKeyIdentity(1))
})

describe('sealRecord / openRecord (blob v2)', () => {
  it('round-trip: plaintext keluar persis seperti masuk, termasuk teks non-ASCII', async () => {
    const plaintext = JSON.stringify({
      type: 'todo',
      schemaVersion: 1,
      data: { title: 'Ngopi dulu — jangan lupa 🙂', done: false },
    })

    const blob = await provider.sealRecord({ ...META, dataKey, plaintext })

    expect(await provider.openRecord({ ...META, dataKey, blob })).toBe(plaintext)
  })

  it('layout: header "ipr"+0x02+KID, nonce 24, ciphertext berpad ke bucket 256 + tag', async () => {
    const plaintext = 'RAHASIA-jangan-sampai-terbaca'
    const raw = bytesOf(await provider.sealRecord({ ...META, dataKey, plaintext }))

    expect(raw.toString('latin1')).not.toContain('RAHASIA')
    expect(raw.length).toBe(sealedRecordV2BlobBytes(plaintext.length))
    expect([...raw.subarray(0, 4)]).toEqual([0x69, 0x70, 0x72, 0x02])
    expect([...raw.subarray(RECORD_V2_KID_OFFSET, RECORD_V2_NONCE_OFFSET)]).toEqual(
      new Array<number>(KID_BYTES).fill(1),
    )
    expect(RECORD_V2_CIPHERTEXT_OFFSET).toBe(44)

    const header = parseSealedBlobHeader(new Uint8Array(raw))
    expect(header).not.toBeNull()
    expect(encodeKid(header!.kid)).toBe(encodeKid(new Uint8Array(KID_BYTES).fill(1)))
  })

  it('membuka blob v2 yang dirakit independen dari spec (cross-check layout + AAD)', async () => {
    const sodium = await loadSodium()
    const identity = testKeyIdentity(1)
    const nonce = new Uint8Array(24).fill(0xa5)
    const plaintext = 'dirakit-manual'
    const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      sodium.pad(new TextEncoder().encode(plaintext), RECORD_PAD_BLOCK_BYTES),
      encodeRecordAadV2({ kid: identity.kid, userId: identity.userId, ...META }),
      null,
      nonce,
      keyOf(7),
    )
    const blob = new Uint8Array(RECORD_V2_CIPHERTEXT_OFFSET + sealed.length)
    blob.set(encodeSealedBlobHeaderV2(identity.kid), 0)
    blob.set(nonce, RECORD_V2_NONCE_OFFSET)
    blob.set(sealed, RECORD_V2_CIPHERTEXT_OFFSET)

    expect(
      await provider.openRecord({
        ...META,
        dataKey,
        blob: sodium.to_base64(blob, sodium.base64_variants.ORIGINAL),
      }),
    ).toBe(plaintext)
  })

  it('padding: panjang blob hanya bergantung pada bucket 256 byte', async () => {
    const lengthOf = async (size: number) =>
      bytesOf(await provider.sealRecord({ ...META, dataKey, plaintext: 'a'.repeat(size) })).length

    expect(await lengthOf(1)).toBe(await lengthOf(255))
    expect(await lengthOf(256)).toBe((await lengthOf(255)) + 256)
  })

  it('dua kali seal untuk input yang sama menghasilkan blob berbeda, dua-duanya bisa dibuka', async () => {
    const plaintext = 'isi yang sama'

    const first = await provider.sealRecord({ ...META, dataKey, plaintext })
    const second = await provider.sealRecord({ ...META, dataKey, plaintext })

    expect(first).not.toBe(second)
    expect(await provider.openRecord({ ...META, dataKey, blob: first })).toBe(plaintext)
    expect(await provider.openRecord({ ...META, dataKey, blob: second })).toBe(plaintext)
  })

  it('menolak plaintext di atas batas blob v2', async () => {
    await expect(
      provider.sealRecord({
        ...META,
        dataKey,
        plaintext: 'a'.repeat(SEALED_RECORD_V2_MAX_PLAINTEXT_BYTES + 1),
      }),
    ).rejects.toThrow(/melebihi batas/)
  })

  it.each([
    ['record id', { recordId: OTHER_RECORD_ID }],
    ['hlc', { hlc: '1700000000001-0-devicea' }],
    ['deleted', { deleted: true }],
  ])('AAD mengikat %s: nilai berbeda = gagal dibuka', async (_label, override) => {
    const blob = await provider.sealRecord({ ...META, dataKey, plaintext: 'punya saya' })

    await expect(provider.openRecord({ ...META, ...override, dataKey, blob })).rejects.toThrow(
      /tidak cocok/,
    )
  })

  it('AAD mengikat akun: akun lain dengan kunci & KID sama tidak bisa membuka', async () => {
    const blob = await provider.sealRecord({ ...META, dataKey, plaintext: 'rahasia' })
    const otherAccount = rawDataKeyMaterial(keyOf(7), {
      ...testKeyIdentity(1),
      userId: '018f2c4e-0000-7000-8000-0000000000bb',
    })

    await expect(provider.openRecord({ ...META, dataKey: otherAccount, blob })).rejects.toThrow(
      /tidak cocok/,
    )
  })

  it('kunci lain atau KID lain tidak bisa membuka blob', async () => {
    const blob = await provider.sealRecord({ ...META, dataKey, plaintext: 'rahasia' })

    const otherKey = rawDataKeyMaterial(keyOf(8), testKeyIdentity(1))
    const otherKid = rawDataKeyMaterial(keyOf(7), testKeyIdentity(2))

    await expect(provider.openRecord({ ...META, dataKey: otherKey, blob })).rejects.toThrow(
      /tidak cocok/,
    )
    await expect(provider.openRecord({ ...META, dataKey: otherKid, blob })).rejects.toThrow(
      /tidak cocok/,
    )
  })

  it('blob yang diubah, terpotong, atau berformat v1 ditolak, bukan dibuka setengah isi', async () => {
    const blob = await provider.sealRecord({ ...META, dataKey, plaintext: 'rahasia' })
    const raw = bytesOf(blob)

    const tampered = Buffer.from(raw)
    tampered[tampered.length - 1] = (tampered.at(-1) ?? 0) ^ 0xff

    await expect(
      provider.openRecord({ ...META, dataKey, blob: tampered.toString('base64') }),
    ).rejects.toThrow(/tidak cocok/)

    await expect(
      provider.openRecord({ ...META, dataKey, blob: raw.subarray(0, 10).toString('base64') }),
    ).rejects.toThrow(/bukan blob v2/)

    // Blob v1 (tanpa header): nonce acak + ciphertext. Provider hanya memahami v2.
    const v1Like = Buffer.alloc(80, 3).toString('base64')
    await expect(provider.openRecord({ ...META, dataKey, blob: v1Like })).rejects.toThrow(
      /bukan blob v2/,
    )
  })
})

describe('bahan kunci', () => {
  it('menolak byte kunci yang bukan 32 dan KID yang bukan 16 byte', () => {
    expect(() => rawDataKeyMaterial(new Uint8Array(31), testKeyIdentity())).toThrow(/32 byte/)
    expect(() => rawDataKeyMaterial(new Uint8Array(0), testKeyIdentity())).toThrow(/32 byte/)
    expect(() =>
      rawDataKeyMaterial(keyOf(1), { kid: new Uint8Array(15), userId: TEST_USER_ID }),
    ).toThrow(/KID harus 16/)
  })

  it('menolak jenis bahan kunci yang belum didukung, bukan menebaknya jadi byte', async () => {
    await expect(
      provider.sealRecord({
        ...META,
        dataKey: { kind: 'webauthn-prf', handle: keyOf(1) },
        plaintext: '{}',
      }),
    ).rejects.toThrow(/belum didukung/)

    await expect(
      provider.sealRecord({
        ...META,
        dataKey: { kind: 'raw-32', handle: 'bukan-byte' },
        plaintext: '{}',
      }),
    ).rejects.toThrow(/rusak/)

    await expect(
      provider.sealRecord({
        ...META,
        dataKey: { kind: 'raw-32', handle: keyOf(1) },
        plaintext: '{}',
      }),
    ).rejects.toThrow(/identitas kunci/)
  })
})
