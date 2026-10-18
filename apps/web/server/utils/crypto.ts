import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Primitif kripto server - sengaja tipis dan tanpa "algoritma sendiri".
 *
 * Yang dipakai cuma dari `node:crypto`: HMAC-SHA256 untuk hash OTP/email/IP, SHA-256 untuk hash token
 * sesi, `randomBytes`/`randomInt` untuk nilai acak. Isi data user TIDAK pernah lewat sini - enkripsi
 * record hidup di client (`packages/crypto`), server cuma menyimpan ciphertext (ARCHITECTURE.md §7).
 *
 * Dua aturan yang dipegang di seluruh berkas ini:
 * - Tidak ada nilai rahasia yang pernah dikembalikan dalam bentuk yang bisa di-log: fungsi hash
 *   mengembalikan string hex, dan token mentah hanya keluar dari `createSessionToken()` ke handler
 *   yang langsung memasukkannya ke cookie/body.
 * - Perbandingan rahasia SELALU lewat `timingSafeEqual` dengan panjang yang sudah disamakan, supaya
 *   waktu eksekusi tidak membocorkan panjang atau awalan yang benar.
 */

/** Kode OTP: 6 digit (PRD F15). */
const OTP_DIGITS = 6

const OTP_MAX_EXCLUSIVE = 10 ** OTP_DIGITS

/**
 * Panjang token sesi: 32 byte = 256 bit. Kontrak `auth.ts` menuntut minimal 32 karakter
 * (`SESSION_TOKEN_MIN_LENGTH`), dan base64url 32 byte selalu 43 karakter.
 */
const SESSION_TOKEN_BYTES = 32

/** Panjang `state` OAuth dan `nonce` OIDC. 32 byte acak dari CSPRNG. */
const OAUTH_RANDOM_BYTES = 32

/** Panjang id transfer kunci: 128 bit (kontrak `KEY_TRANSFER_ID_BYTES`). */
const KEY_TRANSFER_ID_BYTES = 16

/** Hex dari HMAC-SHA256: selalu 64 karakter. Panjang tetap = aman untuk `timingSafeEqual`. */
const HMAC_HEX_LENGTH = 64

export function hmacSha256(value: string, pepper: string): string {
  return createHmac('sha256', pepper).update(value, 'utf8').digest('hex')
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Kode OTP 6 digit termasuk nol di depan (`'000123'`), karena kontrak mengirimnya sebagai string. */
export function randomOtpCode(): string {
  return String(randomInt(0, OTP_MAX_EXCLUSIVE)).padStart(OTP_DIGITS, '0')
}

/** Token sesi opaque: 32 byte acak, base64url. Token mentah hanya hidup di memori request ini. */
export function createSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url')
}

/** `state` OAuth (dikirim ke Google) dan `nonce` OIDC - dua-duanya acak, sekali pakai. */
export function createOAuthRandom(): string {
  return randomBytes(OAUTH_RANDOM_BYTES).toString('base64url')
}

/** PKCE `code_verifier`: 43..128 karakter base64url. 32 byte acak menghasilkan 43 karakter. */
export function createCodeVerifier(): string {
  return randomBytes(OAUTH_RANDOM_BYTES).toString('base64url')
}

/** PKCE S256: `base64url(sha256(verifier))`. */
export function codeChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url')
}

/**
 * Id transfer kunci: 128-bit acak, base64url tanpa padding (22 karakter).
 *
 * Sengaja BUKAN UUID: id yang berurut bisa dienumerasi, dan pemegang id bisa mengklaim envelope
 * kunci utama perangkat baru (`server.dbml` `key_transfers.id`).
 */
export function createKeyTransferId(): string {
  return randomBytes(KEY_TRANSFER_ID_BYTES).toString('base64url')
}

/**
 * Perbandingan dua nilai rahasia berformat hex tanpa membocorkan waktu.
 *
 * Panjang diperiksa lebih dulu: `timingSafeEqual` melempar kalau panjangnya beda, dan melempar error
 * untuk input dari jaringan berarti kegagalan yang tidak perlu. Nilai yang panjangnya bukan 64
 * (mis. hash yang rusak) langsung dianggap tidak cocok.
 */
export function safeEqualHex(left: string, right: string): boolean {
  if (left.length !== HMAC_HEX_LENGTH || right.length !== HMAC_HEX_LENGTH) return false
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

/** Base64 standar -> biner. Dipakai di boundaries wire; melempar kalau isinya bukan base64. */
export function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'))
}

/** Biner -> base64 standar, bentuk yang dipakai kontrak di transport JSON. */
export function bytesToBase64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64')
}

/**
 * Normalisasi nilai biner dari driver Postgres.
 *
 * `postgres.js` bisa mengembalikan `Buffer`, `Uint8Array`, atau (untuk jalur tertentu) string hex
 * `\x...`. Dua server instance tidak boleh berbeda perilaku hanya karena bentuknya beda, jadi
 * konversinya dikunci di satu tempat.
 */
export function toBytes(value: Uint8Array | string): Uint8Array {
  if (typeof value !== 'string') return value instanceof Uint8Array ? value : new Uint8Array(value)
  if (value.startsWith('\\x')) return new Uint8Array(Buffer.from(value.slice(2), 'hex'))
  return base64ToBytes(value)
}
