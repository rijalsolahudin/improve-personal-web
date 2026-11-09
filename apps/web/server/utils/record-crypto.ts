import { RECORD_PAYLOAD_MAX_BYTES } from '@improve-personal/contracts'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Enkripsi at-rest isi record di server (AES-256-GCM) - kunci hidup di env, BUKAN di client.
 *
 * Layout ciphertext (`records.blob`):
 *
 *   "ips1" | keyVersion(u16 BE) | iv(12) | tag(16) | ciphertext
 *
 * AAD mengikat baris ke pemilik dan versinya:
 *
 *   `ips1|<keyVersion>|<userId>|<recordId>|<hlc>|<deleted 0|1>`
 *
 * Artinya: memindahkan ciphertext ke user/record lain, mengubah `hlc`/`deleted`, atau memalsukan
 * `key_version` membuat dekripsi GAGAL - bukan menghasilkan data salah.
 *
 * Aturan yang dipegang:
 * - IV 12 byte acak dari CSPRNG per penulisan. JANGAN pernah memakai ulang IV untuk kunci yang sama:
 *   nonce reuse pada GCM membocorkan XOR plaintext dan memalsukan tag.
 * - `key_version` disimpan di baris (`records.key_version`) DAN di header. Header yang dipakai saat
 *   membuka; baris dipakai untuk audit/rotasi. Kalau keduanya tidak cocok, dekripsi gagal.
 * - Kunci hanya boleh datang dari `runtimeConfig` private (env `NUXT_RECORD_ENCRYPTION_KEYS`). Tidak
 *   ada kunci default, tidak ada penurunan kunci dari password.
 * - DILARANG log payload, kunci, atau ciphertext. Error hanya membawa kode.
 */

/** Magic ciphertext server. Berbeda dari magic blob lokal (`ipr`) supaya tidak tertukar. */
export const RECORD_CIPHER_MAGIC = 'ips1'

export const RECORD_CIPHER_MAGIC_BYTES = 4
export const RECORD_KEY_VERSION_BYTES = 2
export const RECORD_IV_BYTES = 12
export const RECORD_TAG_BYTES = 16
export const RECORD_CIPHER_HEADER_BYTES =
  RECORD_CIPHER_MAGIC_BYTES + RECORD_KEY_VERSION_BYTES + RECORD_IV_BYTES + RECORD_TAG_BYTES
export const RECORD_CIPHER_OVERHEAD_BYTES = RECORD_CIPHER_HEADER_BYTES
export const RECORD_KEY_BYTES = 32
/** `smallint` Postgres: versi kunci harus muat di kolomnya. */
export const RECORD_KEY_VERSION_MAX = 32_767

/** Kode kegagalan (bukan pesan isi) supaya jalur error tidak pernah membawa data user. */
export const RECORD_CIPHER_ERRORS = [
  'INVALID_KEYRING',
  'UNKNOWN_KEY_VERSION',
  'INVALID_CIPHERTEXT',
  'TAMPERED_OR_WRONG_KEY',
  'PAYLOAD_TOO_LARGE',
] as const

export type RecordCipherErrorCode = (typeof RECORD_CIPHER_ERRORS)[number]

export class RecordCipherError extends Error {
  readonly code: RecordCipherErrorCode

  constructor(code: RecordCipherErrorCode, options?: { cause?: unknown }) {
    super(`record cipher gagal: ${code}`, options)
    this.name = 'RecordCipherError'
    this.code = code
  }
}

export type RecordCipherKeyring = ReadonlyMap<number, Buffer>

/**
 * Parse `NUXT_RECORD_ENCRYPTION_KEYS` = `1:<base64 32 byte>[,2:<base64 32 byte>]`.
 *
 * Keyring (bukan satu kunci) supaya rotasi mungkin: record lama dibuka dengan versinya sendiri,
 * record baru memakai versi aktif. Tanpa ini, mengganti kunci = seluruh data lama tidak terbaca.
 */
export function parseRecordEncryptionKeyring(raw: string): RecordCipherKeyring {
  const keys = new Map<number, Buffer>()

  for (const entry of raw.split(',')) {
    const trimmed = entry.trim()
    if (trimmed === '') continue

    const separator = trimmed.indexOf(':')
    if (separator <= 0) throw new RecordCipherError('INVALID_KEYRING')

    const versionText = trimmed.slice(0, separator).trim()
    const keyText = trimmed.slice(separator + 1).trim()
    if (!/^\d+$/.test(versionText)) throw new RecordCipherError('INVALID_KEYRING')

    const version = Number(versionText)
    if (!Number.isInteger(version) || version < 1 || version > RECORD_KEY_VERSION_MAX) {
      throw new RecordCipherError('INVALID_KEYRING')
    }
    if (keys.has(version)) throw new RecordCipherError('INVALID_KEYRING')

    // `Buffer.from(..., 'base64')` membuang karakter non-base64 diam-diam, jadi panjang hasil decode
    // yang dipakai sebagai pemeriksaan utama - bukan regex alfabet base64.
    const key = Buffer.from(keyText, 'base64')
    if (key.length !== RECORD_KEY_BYTES) throw new RecordCipherError('INVALID_KEYRING')

    keys.set(version, key)
  }

  if (keys.size === 0) throw new RecordCipherError('INVALID_KEYRING')

  return keys
}

export type RecordCipherRow = {
  readonly userId: string
  readonly recordId: string
  readonly hlc: string
  readonly deleted: boolean
  readonly blob: Uint8Array
}

export type SealRecordInput = {
  readonly userId: string
  readonly recordId: string
  readonly hlc: string
  readonly deleted: boolean
  /** JSON polos `{ type, schemaVersion, data }`. */
  readonly payload: unknown
}

export type SealedRecordCiphertext = {
  readonly blob: Buffer
  readonly keyVersion: number
}

export type RecordCipher = {
  readonly activeKeyVersion: number
  readonly keyVersions: readonly number[]
  seal: (input: SealRecordInput) => SealedRecordCiphertext
  open: (row: RecordCipherRow) => unknown
}

/** AAD biner kanonik. Nilainya HARUS sama persis saat seal dan open. */
function recordAad(input: {
  readonly keyVersion: number
  readonly userId: string
  readonly recordId: string
  readonly hlc: string
  readonly deleted: boolean
}): Buffer {
  return Buffer.from(
    [
      RECORD_CIPHER_MAGIC,
      String(input.keyVersion),
      input.userId,
      input.recordId,
      input.hlc,
      input.deleted ? '1' : '0',
    ].join('|'),
    'utf8',
  )
}

function writeKeyVersion(version: number): Buffer {
  const buffer = Buffer.alloc(RECORD_KEY_VERSION_BYTES)
  buffer.writeUInt16BE(version, 0)
  return buffer
}

export function createRecordCipher(options: {
  readonly keys: RecordCipherKeyring
  readonly activeVersion: number
}): RecordCipher {
  const { keys, activeVersion } = options

  if (keys.size === 0) throw new RecordCipherError('INVALID_KEYRING')
  if (!keys.has(activeVersion)) throw new RecordCipherError('INVALID_KEYRING')

  return {
    activeKeyVersion: activeVersion,
    keyVersions: [...keys.keys()].sort((left, right) => left - right),

    seal(input) {
      const serialized = JSON.stringify(input.payload)
      if (serialized === undefined) throw new RecordCipherError('INVALID_CIPHERTEXT')

      const plaintext = Buffer.from(serialized, 'utf8')
      // Server menegakkan batas yang sama dengan kontrak wire, supaya record yang diterima tidak
      // pernah lebih besar dari yang bisa ditarik client (dan memori server tetap terbatas).
      if (plaintext.length > RECORD_PAYLOAD_MAX_BYTES)
        throw new RecordCipherError('PAYLOAD_TOO_LARGE')

      const key = keys.get(activeVersion)
      if (key === undefined) throw new RecordCipherError('INVALID_KEYRING')

      const iv = randomBytes(RECORD_IV_BYTES)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      cipher.setAAD(recordAad({ keyVersion: activeVersion, ...input }))

      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
      const tag = cipher.getAuthTag()

      return {
        blob: Buffer.concat([
          Buffer.from(RECORD_CIPHER_MAGIC, 'ascii'),
          writeKeyVersion(activeVersion),
          iv,
          tag,
          ciphertext,
        ]),
        keyVersion: activeVersion,
      }
    },

    open(row) {
      const blob = Buffer.from(row.blob)
      if (blob.length < RECORD_CIPHER_HEADER_BYTES)
        throw new RecordCipherError('INVALID_CIPHERTEXT')

      const magic = blob.subarray(0, RECORD_CIPHER_MAGIC_BYTES).toString('ascii')
      if (magic !== RECORD_CIPHER_MAGIC) throw new RecordCipherError('INVALID_CIPHERTEXT')

      const versionOffset = RECORD_CIPHER_MAGIC_BYTES
      const keyVersion = blob.readUInt16BE(versionOffset)
      const ivOffset = versionOffset + RECORD_KEY_VERSION_BYTES
      const tagOffset = ivOffset + RECORD_IV_BYTES
      const ciphertextOffset = tagOffset + RECORD_TAG_BYTES

      const key = keys.get(keyVersion)
      if (key === undefined) throw new RecordCipherError('UNKNOWN_KEY_VERSION')

      try {
        const decipher = createDecipheriv('aes-256-gcm', key, blob.subarray(ivOffset, tagOffset))
        decipher.setAAD(recordAad({ keyVersion, ...row }))
        decipher.setAuthTag(blob.subarray(tagOffset, ciphertextOffset))

        const plaintext = Buffer.concat([
          decipher.update(blob.subarray(ciphertextOffset)),
          decipher.final(),
        ])

        return JSON.parse(plaintext.toString('utf8')) as unknown
      } catch (error) {
        if (error instanceof SyntaxError)
          throw new RecordCipherError('INVALID_CIPHERTEXT', { cause: error })
        throw new RecordCipherError('TAMPERED_OR_WRONG_KEY', { cause: error })
      }
    },
  }
}
