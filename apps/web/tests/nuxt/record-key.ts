import { decodeKid } from '@improve-personal/contracts'

import type { RecordKeyIdentity } from '~/utils/crypto/provider'

/**
 * Fixture identitas kunci untuk test: nilai tetap (bukan acak) supaya AAD v2 deterministik dan
 * kegagalan test mudah direproduksi. Bukan data asli.
 */
export const TEST_USER_ID = '018f2c4e-0000-7000-8000-0000000000aa'
export const TEST_HLC = '1700000000000-0-devicea'
/** Bentuk wire KID untuk `LocalDataSession.kid` pada sesi palsu (base64url 22 karakter kanonik). */
export const TEST_KID_WIRE = 'LBaTVGaXKfW710NOCIXptA'

export function testKeyIdentity(fill = 1): RecordKeyIdentity {
  return { kid: new Uint8Array(16).fill(fill), userId: TEST_USER_ID }
}

const V2_MAGIC_AND_VERSION = [0x69, 0x70, 0x72, 0x02]
const V2_NONCE_BYTES = 24
/** Satu blok padding 256 B + tag 16 B: ciphertext v2 terkecil yang panjangnya sah. */
const V2_MIN_CIPHERTEXT_BYTES = 256 + 16

/**
 * Blob v2 BERFORMAT SAH (header + KID + nonce + ciphertext berpanjang benar) untuk `kid` tertentu.
 * Isinya bukan ciphertext asli: dipakai test yang menyuntik provider palsu, supaya `resolveBlobVerdict`
 * melihat blob ber-KID akun dan meneruskannya ke pembuka.
 */
export function v2BlobFor(kidWire: string): string {
  const kid = decodeKid(kidWire)
  if (kid === null) throw new Error('KID uji tidak kanonik')

  return Buffer.concat([
    Buffer.from(V2_MAGIC_AND_VERSION),
    Buffer.from(kid),
    Buffer.alloc(V2_NONCE_BYTES, 7),
    Buffer.alloc(V2_MIN_CIPHERTEXT_BYTES, 9),
  ]).toString('base64')
}

/** Blob v2 ber-KID `TEST_KID_WIRE` (KID sesi palsu di test). */
export const TEST_V2_BLOB = v2BlobFor(TEST_KID_WIRE)

const LENGTH_PREFIX_BYTES = 4
const PAD_BLOCK = 256
const TAG_BYTES = 16

/**
 * Seal PALSU berformat blob v2 sah: plaintext dititipkan (bukan dienkripsi) di ciphertext yang panjangnya
 * kelipatan blok + tag. Untuk test lintas-perangkat yang memakai provider tiruan tetapi tetap harus
 * lolos `resolveBlobVerdict` (prefix + KID + panjang).
 */
export function fakeV2Seal(plaintext: string, kidWire = TEST_KID_WIRE): string {
  const body = Buffer.from(plaintext, 'utf8')
  const used = LENGTH_PREFIX_BYTES + body.length
  const padded = PAD_BLOCK * Math.ceil(used / PAD_BLOCK)
  const ciphertext = Buffer.alloc(padded + TAG_BYTES)
  ciphertext.writeUInt32BE(body.length, 0)
  body.copy(ciphertext, LENGTH_PREFIX_BYTES)

  const header = Buffer.from(v2BlobFor(kidWire), 'base64').subarray(0, 20 + V2_NONCE_BYTES)

  return Buffer.concat([header, ciphertext]).toString('base64')
}

/** Kebalikan `fakeV2Seal`. */
export function fakeV2Open(blob: string): string {
  const raw = Buffer.from(blob, 'base64')
  const ciphertext = raw.subarray(20 + V2_NONCE_BYTES)
  const length = ciphertext.readUInt32BE(0)

  return ciphertext.subarray(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + length).toString('utf8')
}
