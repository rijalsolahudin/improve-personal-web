import { z } from 'zod'

import { parseHlc } from './hlc.ts'
import { UUID_PATTERN } from './protocol.ts'
import { SEALED_RECORD_MAX_BLOB_BYTES } from './sync.ts'

/**
 * Format blob record v2 + identitas kunci (KID) - spec #120 §2.1, §4.1, §4.2.
 *
 * Semua byte di file ini DIKUNCI oleh vektor emas di `record-format.test.ts`. Mengubah satu offset,
 * urutan field AAD, atau konstanta KDF berarti blob lama tidak bisa dibuka lagi, jadi itu perubahan
 * format (versi byte baru), bukan perbaikan. Paket ini hanya mengunci KONTRAK: seal/open sungguhan
 * (libsodium) ada di sisi client, supaya web dan mobile memakai layout yang sama persis.
 *
 * Kenapa versi dan KID ada di dalam BLOB dan bukan field baru di DTO sync: schema DTO sync `.strict()`,
 * jadi satu field tambahan membuat client lama menolak seluruh halaman pull. Blob memang opak bagi
 * server (ADR 4), jadi header-nya tidak mengubah kontrak HTTP.
 *
 * Layout blob (offset dalam byte):
 *
 *   0   magic      3   "ipr" (0x69 0x70 0x72)
 *   3   version    1   0x02
 *   4   kid        16
 *   20  nonce      24  XChaCha20-Poly1305 IETF, acak per seal (sama dengan blob v1)
 *   44  ciphertext     padded_plaintext || tag 16
 *
 * `padded_plaintext = sodium.pad(plaintext, 256)` (ISO/IEC 7816-4: 0x80 lalu 0x00 sampai kelipatan
 * blok), jadi selalu menambah >= 1 byte.
 */

// -----------------------------------------------------------------------------
// Layout blob v2
// -----------------------------------------------------------------------------

/** Penanda awal blob v2: ASCII "ipr". Blob v1 tidak punya header, jadi awalannya nonce acak. */
export const RECORD_BLOB_MAGIC = [0x69, 0x70, 0x72] as const

/** Byte versi format blob. Nilai lain (termasuk 0x01) bukan blob v2 yang dikenal. */
export const RECORD_BLOB_VERSION_V2 = 0x02

/** Panjang KID mentah. 128 bit memberi ketahanan second-preimage 2^128. */
export const KID_BYTES = 16

/** Panjang KID di wire: base64url tanpa padding (16 byte -> 22 karakter). */
export const KID_WIRE_LENGTH = 22

/** Panjang nonce XChaCha20-Poly1305 IETF - sama dengan blob v1 (`envelope.ts` di client). */
export const RECORD_V2_NONCE_BYTES = 24

/** Panjang tag Poly1305. */
export const RECORD_V2_TAG_BYTES = 16

export const RECORD_V2_VERSION_OFFSET = RECORD_BLOB_MAGIC.length
export const RECORD_V2_KID_OFFSET = RECORD_V2_VERSION_OFFSET + 1
export const RECORD_V2_NONCE_OFFSET = RECORD_V2_KID_OFFSET + KID_BYTES

/**
 * Panjang header yang ikut AAD: magic + versi + KID. Nonce SENGAJA di luar AAD (nonce sudah menjadi
 * masukan AEAD sendiri), dan di sini pula `header[0..20)` pada spec §4.2 berakhir.
 */
export const RECORD_V2_HEADER_BYTES = RECORD_V2_NONCE_OFFSET

export const RECORD_V2_CIPHERTEXT_OFFSET = RECORD_V2_NONCE_OFFSET + RECORD_V2_NONCE_BYTES

/**
 * Biaya tetap blob v2 di luar plaintext berpad: header + nonce + tag = 3 + 1 + 16 + 24 + 16 = 60.
 * Minimum blob v2 yang bisa diurai adalah tepat ini (ciphertext kosong tapi bertag).
 */
export const SEALED_RECORD_V2_OVERHEAD_BYTES = RECORD_V2_CIPHERTEXT_OFFSET + RECORD_V2_TAG_BYTES

/** Ukuran blok padding. Panjang plaintext hanya bocor per bucket 256 byte (L3). */
export const RECORD_PAD_BLOCK_BYTES = 256

/**
 * Panjang plaintext berpad: `sodium.pad` selalu menambah >= 1 byte (0x80), jadi hasilnya
 * `256 * ceil((n + 1) / 256)`. Plaintext 255 B -> 256, tetapi 256 B -> 512 (bukan 256).
 */
function paddedPlaintextBytes(plaintextBytes: number): number {
  return RECORD_PAD_BLOCK_BYTES * Math.ceil((plaintextBytes + 1) / RECORD_PAD_BLOCK_BYTES)
}

function assertPlaintextLength(plaintextBytes: number): void {
  if (!Number.isSafeInteger(plaintextBytes) || plaintextBytes < 0) {
    throw new RangeError('panjang plaintext harus bilangan bulat non-negatif')
  }
}

/** Panjang blob v2 (byte) untuk plaintext `plaintextBytes` byte: `60 + 256 * ceil((n + 1) / 256)`. */
export function sealedRecordV2BlobBytes(plaintextBytes: number): number {
  assertPlaintextLength(plaintextBytes)

  return SEALED_RECORD_V2_OVERHEAD_BYTES + paddedPlaintextBytes(plaintextBytes)
}

/**
 * Plaintext terbesar yang masih muat di `SEALED_RECORD_MAX_BLOB_BYTES` SETELAH padding dan overhead.
 *
 * Padding membulatkan ke atas, jadi yang dibatasi adalah plaintext berpad, bukan plaintext mentah:
 *   ruang untuk plaintext berpad = 1_048_576 - 60 = 1_048_516
 *   kelipatan 256 terbesar di bawahnya = 4095 * 256 = 1_048_320
 *   plaintext = 1_048_320 - 1 (minimal satu byte 0x80) = 1_048_319
 * Plaintext 1_048_320 B berpad ke 1_048_576 B, blob jadi 1_048_636 B (> batas) - karena itu ditolak.
 */
export const SEALED_RECORD_V2_MAX_PLAINTEXT_BYTES =
  Math.floor(
    (SEALED_RECORD_MAX_BLOB_BYTES - SEALED_RECORD_V2_OVERHEAD_BYTES) / RECORD_PAD_BLOCK_BYTES,
  ) *
    RECORD_PAD_BLOCK_BYTES -
  1

/** Writer WAJIB memanggil ini sebelum menulis lokal: blob yang kelewat besar ditolak server. */
export function isPlaintextWithinV2Limit(plaintextBytes: number): boolean {
  assertPlaintextLength(plaintextBytes)

  return plaintextBytes <= SEALED_RECORD_V2_MAX_PLAINTEXT_BYTES
}

// -----------------------------------------------------------------------------
// KID
// -----------------------------------------------------------------------------

/**
 * Turunan KID: `crypto_kdf_derive_from_key(16, KID_KDF_SUBKEY_ID, KID_KDF_CONTEXT, MK)`.
 *
 * Konteks WAJIB 8 karakter dan berbeda dari `ip-data-` (kunci data) serta `ip-passk` (passkey), supaya
 * KID tidak pernah sama dengan subkey lain. Mengubah nilainya mengganti identitas semua akun.
 */
export const KID_KDF_CONTEXT = 'ip-keyid'
export const KID_KDF_SUBKEY_ID = 1

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const BASE64URL_SIX_BIT_MASK = 0x3f
const BITS_PER_BASE64_CHAR = 6
const BITS_PER_BYTE = 8

/** Bentuk wire KID: base64url tanpa padding, 22 karakter. */
export const KID_WIRE_PATTERN = /^[A-Za-z0-9_-]{22}$/

/**
 * KID mentah -> string wire. Melempar `RangeError` kalau panjangnya bukan 16 (bug programmer).
 */
export function encodeKid(kid: Uint8Array): string {
  assertKidBytes(kid)

  let output = ''
  let buffer = 0
  let bufferedBits = 0
  for (const byte of kid) {
    buffer = (buffer << BITS_PER_BYTE) | byte
    bufferedBits += BITS_PER_BYTE
    while (bufferedBits >= BITS_PER_BASE64_CHAR) {
      bufferedBits -= BITS_PER_BASE64_CHAR
      output += BASE64URL_ALPHABET.charAt((buffer >> bufferedBits) & BASE64URL_SIX_BIT_MASK)
    }
    buffer &= (1 << bufferedBits) - 1
  }
  if (bufferedBits > 0) {
    output += BASE64URL_ALPHABET.charAt(
      (buffer << (BITS_PER_BASE64_CHAR - bufferedBits)) & BASE64URL_SIX_BIT_MASK,
    )
  }

  return output
}

/**
 * String wire -> KID mentah, atau `null` kalau bukan KID kanonik. Tidak pernah melempar.
 *
 * 22 karakter membawa 132 bit untuk 128 bit data, jadi ada 4 bit sisa di karakter terakhir. Bit sisa
 * yang tidak nol ditolak (hasil encode ulang harus sama persis), supaya satu KID tidak punya dua
 * string wire - itu penting karena KID dibandingkan sebagai string di registry.
 */
export function decodeKid(wire: string): Uint8Array | null {
  if (!KID_WIRE_PATTERN.test(wire)) return null

  const kid = new Uint8Array(KID_BYTES)
  let buffer = 0
  let bufferedBits = 0
  let written = 0
  for (const char of wire) {
    buffer = (buffer << BITS_PER_BASE64_CHAR) | BASE64URL_ALPHABET.indexOf(char)
    bufferedBits += BITS_PER_BASE64_CHAR
    if (bufferedBits >= BITS_PER_BYTE) {
      bufferedBits -= BITS_PER_BYTE
      kid[written] = (buffer >> bufferedBits) & 0xff
      written += 1
      buffer &= (1 << bufferedBits) - 1
    }
  }

  return encodeKid(kid) === wire ? kid : null
}

/**
 * KID di wire. KID BUKAN bukti kepemilikan kunci (siapa pun yang melihat satu blob tahu KID-nya) dan
 * pengenal pseudonim (UU PDP): DILARANG di-log, dikirim ke analytics, atau ditaruh di URL.
 */
export const kidSchema = z
  .string()
  .regex(KID_WIRE_PATTERN, 'KID harus base64url 22 karakter')
  .refine((value) => decodeKid(value) !== null, 'KID tidak kanonik')

function assertKidBytes(kid: Uint8Array): void {
  if (kid.length !== KID_BYTES) {
    throw new RangeError(`KID harus ${KID_BYTES} byte`)
  }
}

// -----------------------------------------------------------------------------
// Header blob v2
// -----------------------------------------------------------------------------

/** Header yang ikut AAD dan ditulis di awal blob: `"ipr" || 0x02 || kid` (20 byte). */
export function encodeSealedBlobHeaderV2(kid: Uint8Array): Uint8Array {
  assertKidBytes(kid)

  const header = new Uint8Array(RECORD_V2_HEADER_BYTES)
  header.set(RECORD_BLOB_MAGIC, 0)
  header[RECORD_V2_VERSION_OFFSET] = RECORD_BLOB_VERSION_V2
  header.set(kid, RECORD_V2_KID_OFFSET)

  return header
}

/**
 * Hasil urai blob v2. Semua field adalah VIEW atas buffer masukan (tanpa salinan, blob bisa ~1 MB):
 * jangan dimutasi, dan salin kalau buffer asalnya akan dipakai ulang.
 */
export type SealedBlobHeaderV2 = {
  readonly version: typeof RECORD_BLOB_VERSION_V2
  readonly kid: Uint8Array
  readonly nonce: Uint8Array
  /** `padded_plaintext || tag`, siap dimasukkan ke dekripsi AEAD. */
  readonly ciphertext: Uint8Array
}

/**
 * Urai header blob v2. Mengembalikan `null` (tanpa melempar) kalau blob BUKAN v2: kurang dari 60 byte,
 * magic tidak cocok, atau byte versi bukan 0x02.
 *
 * `null` berarti "tidak berprefix v2", yang oleh pull diperlakukan sebagai blob v1 (spec §4.4).
 * Fungsi ini hanya melihat prefix dan panjang minimum; keabsahan isi diputuskan AEAD + unpad, bukan
 * di sini.
 */
export function parseSealedBlobHeader(blob: Uint8Array): SealedBlobHeaderV2 | null {
  if (blob.length < SEALED_RECORD_V2_OVERHEAD_BYTES) return null

  for (const [index, expected] of RECORD_BLOB_MAGIC.entries()) {
    if (blob[index] !== expected) return null
  }
  if (blob[RECORD_V2_VERSION_OFFSET] !== RECORD_BLOB_VERSION_V2) return null

  return {
    version: RECORD_BLOB_VERSION_V2,
    kid: blob.subarray(RECORD_V2_KID_OFFSET, RECORD_V2_NONCE_OFFSET),
    nonce: blob.subarray(RECORD_V2_NONCE_OFFSET, RECORD_V2_CIPHERTEXT_OFFSET),
    ciphertext: blob.subarray(RECORD_V2_CIPHERTEXT_OFFSET),
  }
}

// -----------------------------------------------------------------------------
// AAD v2
// -----------------------------------------------------------------------------

/** Label domain AAD, supaya ciphertext record tidak bisa dipakai ulang sebagai AEAD jenis lain. */
export const RECORD_AAD_V2_LABEL = 'ip-record'

/** Pemisah label dan header. */
const AAD_LABEL_TERMINATOR = 0x00

const UINT32_RANGE = 2 ** 32
const UUID_BYTES = 16
const UUID_HEX_CHARS_PER_BYTE = 2
const HEX_RADIX = 16

export type RecordAadV2Input = {
  readonly kid: Uint8Array
  /** UUID akun (sesi di server, bukan dari blob). Huruf besar dinormalkan. */
  readonly userId: string
  /** UUID record. Huruf besar dinormalkan. */
  readonly recordId: string
  /** String HLC apa pun yang valid; yang diikat adalah tuple kanonik-nya. */
  readonly hlc: string
  readonly deleted: boolean
}

function uuidToBytes(value: string, field: string): Uint8Array {
  const canonical = value.toLowerCase()
  if (!UUID_PATTERN.test(canonical)) {
    throw new RangeError(`${field} bukan UUID kanonik`)
  }

  const hex = canonical.replaceAll('-', '')
  const bytes = new Uint8Array(UUID_BYTES)
  for (let index = 0; index < UUID_BYTES; index += 1) {
    const start = index * UUID_HEX_CHARS_PER_BYTE
    bytes[index] = Number.parseInt(hex.slice(start, start + UUID_HEX_CHARS_PER_BYTE), HEX_RADIX)
  }

  return bytes
}

function asciiBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index)
  }

  return bytes
}

/**
 * AAD biner kanonik blob v2 (spec §4.2):
 *
 *   "ip-record" (9) || 0x00 || header[0..20) || userId (16) || recordId (16)
 *   || wallMs (u64 BE) || counter (u32 BE) || len(devId) (u8) || devId (ASCII) || deleted (u8)
 *
 * Yang diikat adalah tuple HLC yang sudah dinormalkan (`parseHlc`), bukan string-nya: HLC yang sama
 * dengan penulisan berbeda (nol di depan, deviceId bertanda hubung/huruf besar) menghasilkan AAD
 * identik, jadi tie-break LWW dan AEAD selalu sepakat. `type`/`schemaVersion` tetap di dalam
 * ciphertext (ADR 4).
 *
 * Encoding ini injektif: field panjang tetap kecuali `devId`, yang diawali panjangnya dan diikuti
 * satu byte `deleted` yang panjangnya tetap. `userId` ikut diikat supaya blob tidak bisa dipindah
 * antar akun yang berbagi kunci.
 *
 * Melempar kalau masukan tidak valid (`RangeError` untuk KID/UUID, `HlcFormatError` untuk HLC):
 * keduanya bug penulis, atau data yang memang harus ditolak pembaca. Pull menangkapnya sebagai blob
 * yang tidak bisa dibuka.
 */
export function encodeRecordAadV2(input: RecordAadV2Input): Uint8Array {
  const header = encodeSealedBlobHeaderV2(input.kid)
  const userId = uuidToBytes(input.userId, 'userId')
  const recordId = uuidToBytes(input.recordId, 'recordId')
  const { wallMs, counter, deviceId } = parseHlc(input.hlc)
  const label = asciiBytes(RECORD_AAD_V2_LABEL)
  const deviceBytes = asciiBytes(deviceId)

  const aad = new Uint8Array(
    label.length + 1 + header.length + 2 * UUID_BYTES + 8 + 4 + 1 + deviceBytes.length + 1,
  )
  const view = new DataView(aad.buffer)

  let offset = 0
  aad.set(label, offset)
  offset += label.length
  aad[offset] = AAD_LABEL_TERMINATOR
  offset += 1
  aad.set(header, offset)
  offset += header.length
  aad.set(userId, offset)
  offset += UUID_BYTES
  aad.set(recordId, offset)
  offset += UUID_BYTES
  // u64 BE dipecah dua: wallMs <= 2^53 - 1, jadi bagian atasnya muat u32 tanpa BigInt.
  view.setUint32(offset, Math.floor(wallMs / UINT32_RANGE))
  view.setUint32(offset + 4, wallMs % UINT32_RANGE)
  offset += 8
  view.setUint32(offset, counter)
  offset += 4
  aad[offset] = deviceBytes.length
  offset += 1
  aad.set(deviceBytes, offset)
  offset += deviceBytes.length
  aad[offset] = input.deleted ? 1 : 0

  return aad
}

// -----------------------------------------------------------------------------
// Cutoff v1
// -----------------------------------------------------------------------------

/**
 * Toleransi jam pada cutoff v1 (7 hari). BUKAN kontrol keamanan: HLC v1 tidak terautentikasi, jadi
 * grace hanya meredam selisih jam perangkat (spec §0 Q5, §5.1).
 */
export const V1_CUTOFF_GRACE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Cutoff v1 yang di-hardcode di build client (epoch ms). `null` sampai rilis R2 (sesudah fase F3):
 * nilai konstanta build MENANG atas nilai dari server, termasuk saat server menjawab `null` (spec
 * §5.2), jadi server tidak bisa menahan cutoff. Mengisinya adalah perubahan rilis, bukan konfigurasi.
 */
export const V1_CUTOFF_MS: number | null = null
