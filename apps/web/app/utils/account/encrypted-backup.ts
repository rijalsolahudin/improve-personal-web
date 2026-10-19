import { z } from 'zod'

import { BRAND } from '#shared/brand'
import { TECH_IDENTITY } from '#shared/tech-identity'

import { aadFor, openWithKey, sealWithKey } from '../crypto/envelope'
import { loadSodium } from '../crypto/sodium'

/**
 * Berkas backup TERENKRIPSI dengan kata sandi pilihan user (format "file encrypted" di PRD, AC T22).
 *
 * Kenapa ini yang paling enak dipakai user: yang perlu diingat cuma satu kata sandi, dan berkasnya boleh
 * ditaruh di mana saja (Drive, email sendiri, flashdisk) tanpa user harus paham apa itu envelope. Berkas
 * ini juga MEMBAWA envelope kunci - jadi ia bisa berdiri sendiri, tidak seperti salinan 24 kata saja.
 *
 * Rantai kuncinya:
 *
 *   kata sandi user --Argon2id(salt, ops, mem)--> kunci pembungkus --XChaCha20-Poly1305--> isi berkas
 *
 * Isi berkas = kode cadangan (24 kata + envelope), jadi hasil dekripsi langsung bisa dipakai memulihkan.
 *
 * Dua hal yang harus diucapkan jujur ke user, dan keduanya ada di UI:
 * 1. **Kata sandinya tidak bisa dipulihkan.** Lupa kata sandi = berkasnya jadi sampah, dan 24 kata di
 *    dalamnya ikut hilang. Tidak ada jalur "lupa kata sandi" di sini.
 * 2. **Huruf besar/kecil dan spasi dihitung.** Satu huruf beda = tidak bisa dibuka. Ini disengaja:
 *    menormalkan huruf kecil akan mengurangi entropi kata sandi yang dipilih user.
 */

/** Penanda jenis berkas. */
export const ENCRYPTED_BACKUP_FORMAT = TECH_IDENTITY.formatMarkers.recoveryEncrypted

/** Versi format berkas. */
export const ENCRYPTED_BACKUP_VERSION = 1

/**
 * Panjang minimum kata sandi.
 *
 * Bukan angka keamanan yang ajaib: kata sandi ini membungkus rahasia yang bisa membuka seluruh data user,
 * dan satu kali tebak yang berhasil berarti kehilangan total. Dengan Argon2id, 12 karakter acak sudah
 * sangat mahal untuk ditebak - dan menolak yang lebih pendek lebih baik daripada membiarkan user merasa
 * aman dengan "1234".
 */
export const MIN_PASSPHRASE_LENGTH = 12

/** Dinyatakan di berkasnya sendiri, bukan cuma di UI. */
export const ENCRYPTED_BACKUP_WARNING =
  'Berkas ini terenkripsi dengan kata sandi yang kamu pilih. Lupa kata sandi = isinya tidak bisa dibuka, termasuk 24 kata di dalamnya.'

const AAD = aadFor('recovery-encrypted')

/** Panjang salt Argon2id (byte). */
const SALT_BYTES = 16

/** Panjang kunci pembungkus (byte). */
const KEY_BYTES = 32

export const encryptedBackupDocumentSchema = z
  .object({
    format: z.literal(ENCRYPTED_BACKUP_FORMAT),
    version: z.literal(ENCRYPTED_BACKUP_VERSION),
    createdAtMs: z.int().min(0),
    encryption: z.literal('argon2id-xchacha20poly1305'),
    warning: z.literal(ENCRYPTED_BACKUP_WARNING),
    /** Salt Argon2id, base64. */
    salt: z.string().min(1).max(256),
    ops: z.int().min(1),
    mem: z.int().min(1),
    /** base64( nonce[24] || ciphertext||tag ). */
    blob: z.string().min(1).max(16384),
  })
  .strict()

export type EncryptedBackupDocument = z.infer<typeof encryptedBackupDocumentSchema>

/** Panjang efektif kata sandi setelah spasi di ujung dibuang - `"          "` bukan kata sandi. */
function passphraseLength(passphrase: string): number {
  return passphrase.trim().length
}

export async function encryptRecoveryBackup(input: {
  readonly payload: string
  readonly passphrase: string
  readonly createdAtMs: number
}): Promise<EncryptedBackupDocument> {
  if (passphraseLength(input.passphrase) < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`kata sandi minimal ${MIN_PASSPHRASE_LENGTH} karakter`)
  }

  const sodium = await loadSodium()
  const salt = sodium.randombytes_buf(SALT_BYTES)
  const ops = sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE
  const mem = sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE

  const key = sodium.crypto_pwhash(
    KEY_BYTES,
    // NFKD: bentuk kanonik untuk unicode (huruf beraksen), BUKAN penurunan huruf besar/kecil.
    input.passphrase.normalize('NFKD'),
    salt,
    ops,
    mem,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  )

  return {
    format: ENCRYPTED_BACKUP_FORMAT,
    version: ENCRYPTED_BACKUP_VERSION,
    createdAtMs: input.createdAtMs,
    encryption: 'argon2id-xchacha20poly1305',
    warning: ENCRYPTED_BACKUP_WARNING,
    salt: sodium.to_base64(salt, sodium.base64_variants.ORIGINAL),
    ops,
    mem,
    blob: sealWithKey(sodium, key, AAD, sodium.from_string(input.payload)),
  }
}

/**
 * Buka berkas terenkripsi.
 *
 * Kata sandi salah dan berkas yang diubah sama-sama berakhir di auth tag - dan pesannya menyebut itu,
 * bukan "kesalahan tak dikenal", supaya user tahu yang harus diperiksa: kata sandinya.
 */
export async function decryptRecoveryBackup(
  document: EncryptedBackupDocument,
  passphrase: string,
): Promise<string> {
  const sodium = await loadSodium()
  const salt = sodium.from_base64(document.salt, sodium.base64_variants.ORIGINAL)

  const key = sodium.crypto_pwhash(
    KEY_BYTES,
    passphrase.normalize('NFKD'),
    salt,
    document.ops,
    document.mem,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  )

  try {
    return sodium.to_string(openWithKey(sodium, key, AAD, document.blob))
  } catch (error) {
    throw new Error('berkas tidak bisa dibuka: kata sandi salah atau berkasnya berubah', {
      cause: error,
    })
  }
}

/** Serialisasi berkas (pretty: user harus bisa membukanya dan melihat bahwa isinya terenkripsi). */
export function serializeEncryptedBackup(document: EncryptedBackupDocument): string {
  return JSON.stringify(document, null, 2)
}

/** Nama berkas unduhan. */
export function encryptedBackupFileName(): string {
  return `${BRAND.slug}-recovery-encrypted.json`
}

/** Baca berkas terenkripsi; bentuk yang tidak sesuai DITOLAK sebelum KDF dijalankan. */
export function parseEncryptedBackup(text: string): EncryptedBackupDocument {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new Error('berkas backup bukan JSON yang sah', { cause: error })
  }

  const parsed = encryptedBackupDocumentSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error('berkas backup tidak dikenali: format atau isinya tidak sesuai')
  }

  return parsed.data
}
