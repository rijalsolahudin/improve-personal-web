import { generateMnemonic, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { z } from 'zod'

import { aadFor, openWithKey, sealWithKey } from './envelope'
import { MAX_KDF_MEM_BYTES, MAX_KDF_OPS } from './kdf-limits'
import { assertMasterKey } from './master-key'
import { loadSodium, type SodiumModule } from './sodium'

/**
 * Envelope recovery: 24 kata BIP39 → Argon2id → membungkus kunci utama (ARCHITECTURE §7, ADR 11-12).
 *
 * Dua keputusan yang menentukan bentuk modul ini:
 *
 * 1. **Envelope ini TIDAK PERNAH dikirim ke server.** Server cuma boleh menyimpan envelope `passkey`
 *    (ADR 10-11, `contracts/keys.ts`: `KEY_SLOTS = ['passkey']`). Yang menyimpan envelope recovery
 *    adalah berkas backup milik user sendiri. Akibatnya jalur pemulihan ini jalan tanpa server - dan
 *    itu memang tujuannya: server tidak boleh punya apa pun yang bisa membuka data.
 * 2. **24 kata saja tidak cukup.** Kunci utama dibuat ACAK, jadi tanpa envelope-nya 24 kata tidak
 *    memulihkan apa pun. Ini harus dikatakan jujur di onboarding, bukan disembunyikan.
 *
 * Kenapa Argon2id (bukan PBKDF2 yang biasa dipakai BIP39): 24 kata BIP39 "hanya" 256-bit entropi yang
 * diucapkan manusia - kalau ada yang menebak frasa yang lebih lemah/berulang, KDF yang mahal dan
 * ber-memori yang membuat tebakan itu tidak murah. Parameter tersimpan di envelope supaya menaikkannya
 * nanti tidak membuat envelope lama tidak bisa dibuka.
 */

/** Jumlah kata recovery. 24 kata = entropi 256-bit. */
export const RECOVERY_WORD_COUNT = 24

/**
 * Schema envelope recovery.
 *
 * Dipakai SEMUA artefak yang membawa envelope: berkas plaintext, kode cadangan, dan berkas terenkripsi.
 * Satu definisi, bukan tiga: kalau salah satu jalur melonggarkan validasinya, envelope rusak bisa lolos
 * ke jalur pemulihan - dan di sana kegagalannya cuma terlihat sebagai "tidak bisa membuka data".
 *
 * `ops`/`mem` dibatasi atas, bukan hanya minimal: keduanya dibaca dari kode/berkas yang bisa datang dari
 * orang lain ("pakai kode ini untuk memulihkan akunmu"), jadi tanpa batas atas Argon2id bisa diminta
 * menghabiskan memori dan membekukan tab pemulihan (PRD 912).
 */
export const recoveryEnvelopeSchema = z
  .object({
    kdf: z.literal('argon2id'),
    alg: z.literal('xchacha20poly1305'),
    ver: z.literal(1),
    salt: z.string().min(1).max(256),
    ops: z.int().min(1).max(MAX_KDF_OPS),
    mem: z.int().min(1).max(MAX_KDF_MEM_BYTES),
    wrappedKey: z.string().min(1).max(4096),
  })
  .strict()

/** Kekuatan entropi yang diminta ke BIP39 saat membuat frasa baru. */
const RECOVERY_STRENGTH_BITS = 256

/** Panjang kunci hasil KDF (byte) - kunci XChaCha20-Poly1305. */
const RECOVERY_KEY_BYTES = 32

/** Nama KDF yang ditulis di envelope. `ver` memisahkan format kalau detailnya berubah. */
export const RECOVERY_KDF = 'argon2id'

/** Panjang salt Argon2id (byte) - `crypto_pwhash_SALTBYTES`. */
const RECOVERY_SALT_BYTES = 16

const RECOVERY_AAD = aadFor('recovery')

/**
 * Envelope recovery - inilah yang ikut berkas backup user.
 *
 * Semua field-nya primitif (string/number) supaya bisa ditulis sebagai JSON di berkas, diketik ulang,
 * atau dipindai dari QR tanpa pernah menyentuh server.
 */
export type RecoveryEnvelope = {
  readonly kdf: typeof RECOVERY_KDF
  readonly alg: 'xchacha20poly1305'
  readonly ver: 1
  /** Salt Argon2id, base64. Acak per envelope. */
  readonly salt: string
  /** `opslimit` Argon2id yang dipakai saat envelope dibuat. */
  readonly ops: number
  /** `memlimit` Argon2id (byte) yang dipakai saat envelope dibuat. */
  readonly mem: number
  /** Kunci utama terbungkus: base64( nonce[24] || ciphertext||tag ). */
  readonly wrappedKey: string
}

/** Frasa recovery baru: 24 kata dari wordlist English. */
export function createRecoveryWords(): string {
  // `generateMnemonic` mengambil entropi dari CSPRNG platform dan MELEMPAR kalau tidak ada sumber acak
  // yang aman - jadi tidak ada jalur "frasa dibuat dari Math.random" di sini.
  return generateMnemonic(wordlist, RECOVERY_STRENGTH_BITS)
}

/** Jumlah kata setelah input dirapikan (spasi berlebih/baris baru sering terbawa saat copy-paste). */
export function recoveryWordCount(words: string): number {
  return normalizeRecoveryWords(words)
    .split(' ')
    .filter((word) => word.length > 0).length
}

/** Apakah frasa ini sah: 24 kata DAN checksum BIP39-nya benar. */
export function isValidRecoveryWords(words: string): boolean {
  const normalized = normalizeRecoveryWords(words)
  if (recoveryWordCount(words) !== RECOVERY_WORD_COUNT) return false

  return validateMnemonic(normalized, wordlist)
}

/**
 * Rapikan frasa: NFKD, huruf kecil, dan satu spasi antar kata.
 *
 * Huruf kecil itu sengaja: wordlist BIP39 seluruhnya huruf kecil, dan yang mengetik ulang 24 kata dari
 * kertas/berkas sering memakai huruf kapital. Karena wordlist-nya cuma huruf kecil, normalisasi ini
 * tidak bisa membuat dua frasa berbeda jadi sama.
 */
function normalizeRecoveryWords(words: string): string {
  return words.normalize('NFKD').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Tolak parameter KDF di luar batas SEBELUM Argon2id jalan.
 *
 * Schema hanya menjaga envelope yang dibaca dari teks user. Envelope juga bisa sampai ke sini sebagai
 * objek yang sudah tersimpan (slot `recovery` di perangkat, hasil impor QR), jalur yang tidak melewati
 * schema - jadi pemeriksaan di titik ini memastikan tidak ada jalan menuju KDF mahal atas permintaan
 * artefak pihak lain.
 */
function assertKdfParams(ops: number, mem: number): void {
  const isOpsValid = Number.isInteger(ops) && ops >= 1 && ops <= MAX_KDF_OPS
  const isMemValid = Number.isInteger(mem) && mem >= 1 && mem <= MAX_KDF_MEM_BYTES
  if (!isOpsValid || !isMemValid) {
    throw new Error('parameter KDF envelope di luar batas yang diizinkan')
  }
}

/** Turunkan kunci pembungkus dari frasa + salt, dengan Argon2id. */
export function deriveRecoveryKey(
  sodium: SodiumModule,
  words: string,
  salt: Uint8Array,
  ops: number,
  mem: number,
): Uint8Array {
  assertKdfParams(ops, mem)

  if (salt.length !== RECOVERY_SALT_BYTES) {
    throw new Error(`salt recovery harus ${RECOVERY_SALT_BYTES} byte, dapat ${salt.length}`)
  }

  return sodium.crypto_pwhash(
    RECOVERY_KEY_BYTES,
    normalizeRecoveryWords(words),
    salt,
    ops,
    mem,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  )
}

/**
 * Buat envelope recovery untuk kunci utama.
 *
 * `ops`/`mem` sengaja tidak bisa diisi dari luar: parameter yang dipakai adalah preset libsodium
 * (`INTERACTIVE`), dan yang menyimpannya di envelope cuma untuk dibaca lagi saat membuka. Kalau
 * pemanggil boleh menurunkannya, "KDF mahal" jadi klaim yang tidak bisa diperiksa.
 */
export async function createRecoveryEnvelope(
  masterKey: Uint8Array,
  words: string,
): Promise<RecoveryEnvelope> {
  assertMasterKey(masterKey)

  if (!isValidRecoveryWords(words)) {
    throw new Error(
      `frasa recovery tidak valid: butuh ${RECOVERY_WORD_COUNT} kata BIP39 dengan checksum benar`,
    )
  }

  const sodium = await loadSodium()
  const salt = sodium.randombytes_buf(RECOVERY_SALT_BYTES)
  const ops = sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE
  const mem = sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE

  const key = deriveRecoveryKey(sodium, words, salt, ops, mem)
  const wrappedKey = sealWithKey(sodium, key, RECOVERY_AAD, masterKey)

  return {
    kdf: RECOVERY_KDF,
    alg: 'xchacha20poly1305',
    ver: 1,
    salt: sodium.to_base64(salt, sodium.base64_variants.ORIGINAL),
    ops,
    mem,
    wrappedKey,
  }
}

/**
 * Buka kunci utama dari frasa recovery + envelope.
 *
 * Urutan pemeriksaannya penting: frasa divalidasi (jumlah kata + checksum) SEBELUM Argon2id dijalankan.
 * Kalau tidak, frasa yang jelas salah tetap membayar 64 MB dan ratusan milidetik - dan jalur ini ada di
 * layar yang dihadapi user yang sedang kehilangan akses.
 *
 * Frasa yang sah tapi salah tetap gagal di pembukaan envelope (auth tag), dan itu memang yang
 * dihitung oleh `recovery-guard.ts` sebagai percobaan gagal.
 */
export async function unwrapMasterKeyWithRecovery(
  words: string,
  envelope: RecoveryEnvelope,
): Promise<Uint8Array> {
  if (envelope.ver !== 1 || envelope.kdf !== RECOVERY_KDF) {
    throw new Error(`envelope recovery tidak dikenal: ${envelope.kdf} v${String(envelope.ver)}`)
  }

  if (!isValidRecoveryWords(words)) {
    throw new Error(
      `frasa recovery tidak valid: butuh ${RECOVERY_WORD_COUNT} kata BIP39 dengan checksum benar`,
    )
  }

  const sodium = await loadSodium()
  const salt = sodium.from_base64(envelope.salt, sodium.base64_variants.ORIGINAL)
  const key = deriveRecoveryKey(sodium, words, salt, envelope.ops, envelope.mem)

  const masterKey = openWithKey(sodium, key, RECOVERY_AAD, envelope.wrappedKey)
  assertMasterKey(masterKey)

  return masterKey
}
