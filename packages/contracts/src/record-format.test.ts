import sodium from 'libsodium-wrappers-sumo'
import { beforeAll, describe, expect, it } from 'vitest'

import { HlcFormatError } from './hlc.ts'
import {
  KID_BYTES,
  KID_KDF_CONTEXT,
  KID_KDF_SUBKEY_ID,
  KID_WIRE_LENGTH,
  RECORD_AAD_V2_LABEL,
  RECORD_BLOB_VERSION_V2,
  RECORD_PAD_BLOCK_BYTES,
  RECORD_V2_CIPHERTEXT_OFFSET,
  RECORD_V2_HEADER_BYTES,
  RECORD_V2_KID_OFFSET,
  RECORD_V2_NONCE_BYTES,
  RECORD_V2_NONCE_OFFSET,
  SEALED_RECORD_V2_MAX_PLAINTEXT_BYTES,
  SEALED_RECORD_V2_OVERHEAD_BYTES,
  V1_CUTOFF_GRACE_MS,
  V1_CUTOFF_MS,
  decodeKid,
  encodeKid,
  encodeRecordAadV2,
  encodeSealedBlobHeaderV2,
  isPlaintextWithinV2Limit,
  kidSchema,
  parseSealedBlobHeader,
  sealedRecordV2BlobBytes,
  type RecordAadV2Input,
} from './record-format.ts'
import { SEALED_RECORD_MAX_BLOB_BYTES } from './sync.ts'

// -----------------------------------------------------------------------------
// Fixture deterministik. MENGUBAH SATU PUN NILAI DI SINI berarti vektor emas harus dibuat ulang
// dan itu berarti format berubah - jangan "memperbaiki" test supaya hijau.
// -----------------------------------------------------------------------------

const MASTER_KEY = Uint8Array.from({ length: 32 }, (_, index) => index)
const NONCE = Uint8Array.from({ length: RECORD_V2_NONCE_BYTES }, (_, index) => 0xa0 + index)
const ZERO_KID = new Uint8Array(KID_BYTES)
const USER_ID = '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b'
const RECORD_ID = '0190a1b2-c3d4-7e5f-8a6b-000000000001'
const HLC = '1700000000123-5-dev0abc'

const KID_HEX = '2c169354669729f5bbd7434e0885e9b4'
const KID_WIRE = 'LBaTVGaXKfW710NOCIXptA'

const AAD_HEX =
  '69702d7265636f726400' + // "ip-record" || 0x00
  '69707202' + // magic "ipr" || versi 0x02
  KID_HEX +
  '0190a1b2c3d47e5f8a6b7c8d9e0f1a2b' + // userId
  '0190a1b2c3d47e5f8a6b000000000001' + // recordId
  '0000018bcfe5687b' + // wallMs u64 BE
  '00000005' + // counter u32 BE
  '07' + // len(devId)
  '64657630616263' + // "dev0abc"
  '00' // deleted

/** Plaintext deterministik berpola agar bug geser-byte terlihat. */
function plaintextOf(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 7 + 3) % 251)
}

let dataKey: Uint8Array
let kid: Uint8Array

beforeAll(async () => {
  await sodium.ready
  kid = sodium.crypto_kdf_derive_from_key(KID_BYTES, KID_KDF_SUBKEY_ID, KID_KDF_CONTEXT, MASTER_KEY)
  dataKey = sodium.crypto_kdf_derive_from_key(32, 1, 'ip-data-', MASTER_KEY)
})

function aadInput(overrides: Partial<RecordAadV2Input> = {}): RecordAadV2Input {
  return { kid, userId: USER_ID, recordId: RECORD_ID, hlc: HLC, deleted: false, ...overrides }
}

/** Seal sesuai spec §4.1 dengan libsodium asli - pembanding independen dari kode produk. */
function sealV2(plaintext: Uint8Array, sealKid: Uint8Array): Uint8Array {
  const aad = encodeRecordAadV2(aadInput({ kid: sealKid }))
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    sodium.pad(plaintext, RECORD_PAD_BLOCK_BYTES),
    aad,
    null,
    NONCE,
    dataKey,
  )
  const blob = new Uint8Array(RECORD_V2_CIPHERTEXT_OFFSET + ciphertext.length)
  blob.set(encodeSealedBlobHeaderV2(sealKid), 0)
  blob.set(NONCE, RECORD_V2_NONCE_OFFSET)
  blob.set(ciphertext, RECORD_V2_CIPHERTEXT_OFFSET)

  return blob
}

function sha256Hex(bytes: Uint8Array): string {
  return sodium.to_hex(sodium.crypto_hash_sha256(bytes))
}

describe('konstanta layout v2', () => {
  it('mengunci offset tiap field: magic 3 | versi 1 | kid 16 | nonce 24 | ciphertext', () => {
    expect(RECORD_V2_KID_OFFSET).toBe(4)
    expect(RECORD_V2_NONCE_OFFSET).toBe(20)
    expect(RECORD_V2_HEADER_BYTES).toBe(20)
    expect(RECORD_V2_CIPHERTEXT_OFFSET).toBe(44)
    expect(RECORD_V2_NONCE_BYTES).toBe(24)
    expect(KID_BYTES).toBe(16)
    expect(KID_WIRE_LENGTH).toBe(22)
    expect(RECORD_BLOB_VERSION_V2).toBe(0x02)
    expect(RECORD_PAD_BLOCK_BYTES).toBe(256)
  })

  it('overhead tetap 60 byte (header 20 + nonce 24 + tag 16)', () => {
    expect(SEALED_RECORD_V2_OVERHEAD_BYTES).toBe(60)
  })

  it('konteks KDF KID 8 karakter (crypto_kdf_CONTEXTBYTES) dan beda dari subkey lain', () => {
    expect(KID_KDF_CONTEXT).toHaveLength(8)
    expect(KID_KDF_CONTEXT).not.toBe('ip-data-')
    expect(KID_KDF_CONTEXT).not.toBe('ip-passk')
    expect(KID_KDF_SUBKEY_ID).toBe(1)
  })

  it('label AAD dan masa transisi v1: cutoff null sampai R2, grace 7 hari', () => {
    expect(RECORD_AAD_V2_LABEL).toBe('ip-record')
    expect(V1_CUTOFF_MS).toBeNull()
    expect(V1_CUTOFF_GRACE_MS).toBe(604_800_000)
  })
})

describe('panjang blob + batas plaintext', () => {
  it('rumus 60 + 256 * ceil((n + 1) / 256) di titik-titik batas bucket', () => {
    expect(sealedRecordV2BlobBytes(0)).toBe(316)
    expect(sealedRecordV2BlobBytes(1)).toBe(316)
    expect(sealedRecordV2BlobBytes(254)).toBe(316)
    // 255 B + 1 byte 0x80 = tepat 256: masih bucket pertama.
    expect(sealedRecordV2BlobBytes(255)).toBe(316)
    // 256 B + 0x80 = 257 -> bucket kedua (bukan 256, padding selalu menambah >= 1 byte).
    expect(sealedRecordV2BlobBytes(256)).toBe(572)
    expect(sealedRecordV2BlobBytes(257)).toBe(572)
    expect(sealedRecordV2BlobBytes(510)).toBe(572)
    expect(sealedRecordV2BlobBytes(511)).toBe(572)
    expect(sealedRecordV2BlobBytes(512)).toBe(828)
  })

  it('rumus identik dengan sodium.pad asli untuk setiap panjang 0..1100', () => {
    for (let length = 0; length <= 1100; length += 1) {
      const padded = sodium.pad(new Uint8Array(length), RECORD_PAD_BLOCK_BYTES)
      expect(sealedRecordV2BlobBytes(length)).toBe(padded.length + 16 + 44)
    }
  })

  it('batas plaintext 1_048_319, dihitung ulang dari SEALED_RECORD_MAX_BLOB_BYTES', () => {
    expect(SEALED_RECORD_V2_MAX_PLAINTEXT_BYTES).toBe(1_048_319)
    expect(SEALED_RECORD_MAX_BLOB_BYTES).toBe(1_048_576)

    expect(sealedRecordV2BlobBytes(1_048_319)).toBe(1_048_380)
    expect(sealedRecordV2BlobBytes(1_048_319)).toBeLessThanOrEqual(SEALED_RECORD_MAX_BLOB_BYTES)
    // Satu byte lagi melompat satu bucket penuh dan melewati batas kontrak.
    expect(sealedRecordV2BlobBytes(1_048_320)).toBe(1_048_636)
    expect(sealedRecordV2BlobBytes(1_048_320)).toBeGreaterThan(SEALED_RECORD_MAX_BLOB_BYTES)
  })

  it('isPlaintextWithinV2Limit menolak tepat di atas batas', () => {
    expect(isPlaintextWithinV2Limit(0)).toBe(true)
    expect(isPlaintextWithinV2Limit(1_048_319)).toBe(true)
    expect(isPlaintextWithinV2Limit(1_048_320)).toBe(false)
  })

  it('panjang tidak valid ditolak (bug programmer, bukan input jaringan)', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => sealedRecordV2BlobBytes(bad)).toThrow(RangeError)
      expect(() => isPlaintextWithinV2Limit(bad)).toThrow(RangeError)
    }
  })
})

describe('KID', () => {
  it('turunan dari MK tetap: kunci ke hex dan string wire (web dan mobile wajib sama)', () => {
    expect(sodium.to_hex(kid)).toBe(KID_HEX)
    expect(encodeKid(kid)).toBe(KID_WIRE)
    expect(sodium.to_hex(decodeKid(KID_WIRE) ?? new Uint8Array())).toBe(KID_HEX)
  })

  it('encode/decode bolak-balik untuk KID acak dan all-zero/all-0xff', () => {
    expect(encodeKid(ZERO_KID)).toBe('AAAAAAAAAAAAAAAAAAAAAA')
    expect(encodeKid(new Uint8Array(KID_BYTES).fill(0xff))).toBe('_____________________w')

    for (let round = 0; round < 50; round += 1) {
      const random = sodium.randombytes_buf(KID_BYTES)
      const wire = encodeKid(random)
      expect(wire).toHaveLength(KID_WIRE_LENGTH)
      expect(decodeKid(wire)).toEqual(random)
      expect(wire).toBe(sodium.to_base64(random, sodium.base64_variants.URLSAFE_NO_PADDING))
    }
  })

  it('decode menolak bentuk tak kanonik tanpa melempar', () => {
    const nonCanonical = `${KID_WIRE.slice(0, -1)}B` // bit sisa karakter terakhir tidak nol
    expect(decodeKid(nonCanonical)).toBeNull()
    expect(decodeKid(`${KID_WIRE}=`)).toBeNull()
    expect(decodeKid(KID_WIRE.slice(1))).toBeNull()
    expect(decodeKid(`${KID_WIRE}A`)).toBeNull()
    expect(decodeKid('')).toBeNull()
    expect(decodeKid(KID_WIRE.replace('V', '+'))).toBeNull()
  })

  it('encode menolak panjang selain 16 byte', () => {
    expect(() => encodeKid(new Uint8Array(15))).toThrow(RangeError)
    expect(() => encodeKid(new Uint8Array(17))).toThrow(RangeError)
  })

  it('kidSchema: hanya string wire kanonik', () => {
    expect(kidSchema.safeParse(KID_WIRE).success).toBe(true)
    expect(kidSchema.safeParse('AAAAAAAAAAAAAAAAAAAAAA').success).toBe(true)
    expect(kidSchema.safeParse(`${KID_WIRE.slice(0, -1)}B`).success).toBe(false)
    expect(kidSchema.safeParse('pendek').success).toBe(false)
    expect(kidSchema.safeParse(KID_WIRE.toLowerCase()).success).toBe(false)
    expect(kidSchema.safeParse(123).success).toBe(false)
  })
})

describe('parseSealedBlobHeader', () => {
  it('mengurai blob sah: kid, nonce, ciphertext di offset yang dikunci', () => {
    const blob = sealV2(plaintextOf(10), kid)
    const parsed = parseSealedBlobHeader(blob)

    expect(parsed).not.toBeNull()
    expect(parsed?.version).toBe(2)
    expect(sodium.to_hex(parsed?.kid ?? new Uint8Array())).toBe(KID_HEX)
    expect(parsed?.nonce).toEqual(NONCE)
    expect(parsed?.ciphertext).toEqual(blob.subarray(44))
    expect(parsed?.ciphertext.length).toBe(256 + 16)
  })

  it('kembalikan null (tanpa throw) untuk < 60 byte, termasuk kosong', () => {
    const valid = sealV2(plaintextOf(0), kid)

    expect(parseSealedBlobHeader(new Uint8Array(0))).toBeNull()
    expect(parseSealedBlobHeader(valid.subarray(0, 59))).toBeNull()
    expect(parseSealedBlobHeader(valid.subarray(0, 4))).toBeNull()
    expect(parseSealedBlobHeader(valid.subarray(0, 60))).not.toBeNull()
  })

  it('kembalikan null untuk versi tak dikenal dan magic yang salah', () => {
    for (const version of [0x00, 0x01, 0x03, 0xff]) {
      const blob = sealV2(plaintextOf(0), kid)
      blob[3] = version
      expect(parseSealedBlobHeader(blob)).toBeNull()
    }
    for (const index of [0, 1, 2]) {
      const blob = sealV2(plaintextOf(0), kid)
      blob[index] = (blob[index] ?? 0) ^ 0x01
      expect(parseSealedBlobHeader(blob)).toBeNull()
    }
  })

  it('blob v1 (nonce acak di awal) tidak dikenali sebagai v2', () => {
    for (let round = 0; round < 100; round += 1) {
      expect(parseSealedBlobHeader(sodium.randombytes_buf(316))).toBeNull()
    }
  })

  it('blob v1 yang nonce-nya sengaja diawali "ipr\\x02" memang terbaca sebagai prefix v2', () => {
    // Tabrakan 2^-32 yang diterima spec §4.4 (baris "v2 | KID lain | belum v1Closed" jatuh ke
    // fallback v1). Test ini mendokumentasikan bahwa PARSER tidak membedakan; keputusan ada di pull.
    const collided = sodium.randombytes_buf(316)
    collided.set([0x69, 0x70, 0x72, 0x02], 0)
    expect(parseSealedBlobHeader(collided)).not.toBeNull()
  })
})

describe('AAD v2', () => {
  it('vektor emas: byte-persis sesuai urutan field spec §4.2', () => {
    expect(sodium.to_hex(encodeRecordAadV2(aadInput()))).toBe(AAD_HEX)
  })

  it('flag deleted di-pin literal: byte terakhir 0x00 untuk false, 0x01 untuk true', () => {
    const live = encodeRecordAadV2(aadInput({ deleted: false }))
    const tombstone = encodeRecordAadV2(aadInput({ deleted: true }))
    const flagOffset = live.length - 1

    expect(live[flagOffset]).toBe(0x00)
    expect(tombstone[flagOffset]).toBe(0x01)
    // Hanya flag yang berbeda: seluruh prefix sebelumnya identik byte demi byte.
    expect(tombstone.subarray(0, flagOffset)).toEqual(live.subarray(0, flagOffset))
    // Vektor emas tombstone penuh, supaya mobile (T23) memakai nilai literal yang sama.
    expect(sodium.to_hex(live)).toBe(AAD_HEX)
    expect(sodium.to_hex(tombstone)).toBe(AAD_HEX.slice(0, -2) + '01')
  })

  it('panjang AAD = 76 + panjang devId', () => {
    expect(encodeRecordAadV2(aadInput()).length).toBe(76 + 'dev0abc'.length)
    expect(encodeRecordAadV2(aadInput({ hlc: '1-0-a' })).length).toBe(77)
    expect(encodeRecordAadV2(aadInput({ hlc: `1-0-${'a'.repeat(64)}` })).length).toBe(140)
  })

  it('tuple HLC sama dengan string berbeda menghasilkan AAD identik', () => {
    const baseline = sodium.to_hex(encodeRecordAadV2(aadInput({ hlc: '1700000000123-5-dev0abc' })))

    for (const variant of [
      '01700000000123-0005-dev0abc',
      '1700000000123-5-DEV0ABC',
      '1700000000123-5-dev-0-abc',
    ]) {
      expect(sodium.to_hex(encodeRecordAadV2(aadInput({ hlc: variant })))).toBe(baseline)
    }
  })

  it('UUID huruf besar dinormalkan ke AAD yang sama', () => {
    expect(
      sodium.to_hex(
        encodeRecordAadV2(
          aadInput({ userId: USER_ID.toUpperCase(), recordId: RECORD_ID.toUpperCase() }),
        ),
      ),
    ).toBe(AAD_HEX)
  })

  it('perbedaan HLC / deleted / userId / recordId / KID menghasilkan AAD berbeda', () => {
    const baseline = sodium.to_hex(encodeRecordAadV2(aadInput()))
    const variants: Partial<RecordAadV2Input>[] = [
      { hlc: '1700000000124-5-dev0abc' },
      { hlc: '1700000000123-6-dev0abc' },
      { hlc: '1700000000123-5-dev0abd' },
      { hlc: '1700000000123-5-dev0ab' },
      { deleted: true },
      { userId: '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c' },
      { recordId: '0190a1b2-c3d4-7e5f-8a6b-000000000002' },
      { kid: ZERO_KID },
    ]

    const seen = new Set<string>([baseline])
    for (const variant of variants) {
      seen.add(sodium.to_hex(encodeRecordAadV2(aadInput(variant))))
    }
    expect(seen.size).toBe(variants.length + 1)
  })

  it('wallMs di atas 2^32 dan counter maksimum dikodekan benar (u64/u32 BE)', () => {
    const wide = encodeRecordAadV2(aadInput({ hlc: `${2 ** 53 - 1}-2147483647-a` }))
    const tail = sodium.to_hex(wide.subarray(wide.length - 15))

    // wallMs 2^53-1 = 0x001fffffffffffff | counter 0x7fffffff | len 1 | "a" | deleted 0
    expect(tail).toBe('001fffffffffffff7fffffff01' + '61' + '00')
  })

  it('masukan tidak valid melempar, tidak pernah menghasilkan AAD sebagian', () => {
    expect(() => encodeRecordAadV2(aadInput({ hlc: 'bukan-hlc' }))).toThrow(HlcFormatError)
    expect(() => encodeRecordAadV2(aadInput({ userId: 'bukan-uuid' }))).toThrow(RangeError)
    expect(() => encodeRecordAadV2(aadInput({ recordId: '' }))).toThrow(RangeError)
    expect(() => encodeRecordAadV2(aadInput({ kid: new Uint8Array(8) }))).toThrow(RangeError)
  })
})

describe('vektor emas blob v2 (libsodium asli, termasuk padding)', () => {
  // [panjang plaintext, KID, panjang blob, sha256(blob)]. Digest di-pin supaya perubahan SATU byte
  // di mana pun (urutan field, panjang prefix, AAD, padding) menggagalkan test ini.
  const VECTORS: readonly {
    name: string
    length: number
    zeroKid: boolean
    blobBytes: number
    sha256: string
  }[] = [
    {
      name: 'plaintext kosong',
      length: 0,
      zeroKid: false,
      blobBytes: 316,
      sha256: '66a09031fc10a694316dc22dea6cd5f1f6fd60100f801fd5a020babc64336431',
    },
    {
      name: '1 byte',
      length: 1,
      zeroKid: false,
      blobBytes: 316,
      sha256: 'e0f63e4a936193f9a3edbf55975c3b3b963b54f3b3764637d20553f7f55f17c8',
    },
    {
      name: '255 byte (tepat penuh satu bucket setelah 0x80)',
      length: 255,
      zeroKid: false,
      blobBytes: 316,
      sha256: '88ef6c15d7c7ff8c8be082a449b22add8530b3f215d6b2b575df163bfbac64ca',
    },
    {
      name: '256 byte (melompat ke bucket kedua)',
      length: 256,
      zeroKid: false,
      blobBytes: 572,
      sha256: 'bf5b32bcb7185221b61c49d67cadb3a86a40c85437cde687054825e4e8c80cba',
    },
    {
      name: '257 byte',
      length: 257,
      zeroKid: false,
      blobBytes: 572,
      sha256: '11654f13acfccee25e0e7cf55e2ad50b66d6bc9844f15f5007cacc8ca01f34b0',
    },
    {
      name: 'plaintext kosong, KID all-zero',
      length: 0,
      zeroKid: true,
      blobBytes: 316,
      sha256: '6cac3030a1a8c117618ede93014d7acfb8e66f68d87107680c407d43225a8777',
    },
    {
      name: '255 byte, KID all-zero',
      length: 255,
      zeroKid: true,
      blobBytes: 316,
      sha256: 'f25d3622055e98ba016ee1ac475d54c8986bc2da1a6dc0b3303949e133881315',
    },
    {
      name: 'plaintext di batas maksimum 1_048_319 byte',
      length: SEALED_RECORD_V2_MAX_PLAINTEXT_BYTES,
      zeroKid: false,
      blobBytes: 1_048_380,
      sha256: '6d14fc6a1b4f41e1cba1c80f2d1bdf047252867a78818203377ae62dfa9ffcb8',
    },
  ]

  it.each(VECTORS)('$name: panjang + digest terkunci', (vector) => {
    const blob = sealV2(plaintextOf(vector.length), vector.zeroKid ? ZERO_KID : kid)

    expect(blob.length).toBe(vector.blobBytes)
    expect(blob.length).toBe(sealedRecordV2BlobBytes(vector.length))
    expect(blob.length).toBeLessThanOrEqual(SEALED_RECORD_MAX_BLOB_BYTES)
    expect(sha256Hex(blob)).toBe(vector.sha256)
  })

  it.each(VECTORS)('$name: header terkunci dan bisa dibuka balik dengan libsodium', (vector) => {
    const sealKid = vector.zeroKid ? ZERO_KID : kid
    const plaintext = plaintextOf(vector.length)
    const blob = sealV2(plaintext, sealKid)

    // "ipr" 0x02 || kid || nonce, byte demi byte.
    expect(sodium.to_hex(blob.subarray(0, 4))).toBe('69707202')
    expect(blob.subarray(4, 20)).toEqual(sealKid)
    expect(blob.subarray(20, 44)).toEqual(NONCE)

    const parsed = parseSealedBlobHeader(blob)
    const opened = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      parsed?.ciphertext ?? new Uint8Array(),
      encodeRecordAadV2(aadInput({ kid: sealKid })),
      parsed?.nonce ?? new Uint8Array(),
      dataKey,
    )

    expect(opened.length).toBe(sealedRecordV2BlobBytes(vector.length) - 60)
    expect(sodium.unpad(opened, RECORD_PAD_BLOCK_BYTES)).toEqual(plaintext)
  })

  it('vektor lengkap plaintext kosong: seluruh 316 byte terkunci', () => {
    expect(sodium.to_hex(sealV2(plaintextOf(0), kid))).toBe(
      '697072022c169354669729f5bbd7434e0885e9b4' +
        'a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7' +
        '5e9df23313cb270eb2d4b1659a91077722d190ff84595a1dbaff1dd2994968dbcc1a73c72302ffd851616e49ef6e' +
        '00fae89070c4fa18dbc3641b2d650dee2f24352877a68f9901994653a8bd74ce069645b51d7ffa2f819320d1b548' +
        '7f5eb29bf05c49b95ce8c812049c839978bafd17d63680b89da8138c881b52c680a65a9139777d44c5a3ed59729f' +
        '796c7913aee8538620edcdb2a3a65b83ab07232e8b3c27f50b4367b2e188c1310cd9a053f3a5a8a390e3a973d498' +
        '34a8b97de53617de7f3712f5c44326906a04ce166cba30bac9dd09fd0038e968a5d570e979458485181179fa68f' +
        '562553e71a0a4d687c556a7f854fa5a1dc9dda144885b8eddf4443b87988fc1d585ee592b0dd6b8fdb808',
    )
  })

  it('mengubah SATU field AAD membuat dekripsi gagal (AAD benar-benar mengikat)', () => {
    const blob = sealV2(plaintextOf(40), kid)
    const parsed = parseSealedBlobHeader(blob)
    const decryptWith = (overrides: Partial<RecordAadV2Input>): Uint8Array =>
      sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        parsed?.ciphertext ?? new Uint8Array(),
        encodeRecordAadV2(aadInput(overrides)),
        parsed?.nonce ?? new Uint8Array(),
        dataKey,
      )

    expect(decryptWith({})).toHaveLength(256)
    for (const tampered of [
      { deleted: true },
      { hlc: '1700000000123-6-dev0abc' },
      { hlc: '1700000000124-5-dev0abc' },
      { userId: '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c' },
      { recordId: '0190a1b2-c3d4-7e5f-8a6b-000000000002' },
      { kid: ZERO_KID },
    ] satisfies Partial<RecordAadV2Input>[]) {
      expect(() => decryptWith(tampered)).toThrow()
    }
  })
})
