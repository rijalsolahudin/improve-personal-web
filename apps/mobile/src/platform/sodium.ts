import native from '../../modules/sodium'

/**
 * libsodium untuk app mobile - SATU-SATUNYA pintu ke modul native `modules/sodium` (ADR 8:
 * primitive identik dengan `libsodium-wrappers-sumo` di web, dibuktikan vektor
 * `modules/sodium/test-vectors/vectors.json`).
 *
 * Bentuk API:
 * - Semua byte = `Uint8Array`; kunci/kata sandi tidak pernah diterima sebagai string. Kata sandi
 *   diubah ke byte lewat `encodePassword` (NFC, sama dengan web) lalu dihapus pemanggil.
 * - Data rusak / kunci salah = `null` (atau `false` untuk verifikasi tanda tangan), bukan exception:
 *   tipe memaksa pemanggil menangani kasus itu. Exception hanya untuk bug pemanggil (ukuran salah).
 * - Temporari yang memuat material rahasia dihapus `memzero` di sini; hasil yang dikembalikan
 *   menjadi tanggung jawab pemanggil (`memzero` setelah dipakai).
 * - Fungsi ini tidak mencatat apa pun (tanpa log, tanpa isi buffer di pesan error).
 */

export const AEAD_XCHACHA20POLY1305_IETF_ABYTES = 16
export const AEAD_XCHACHA20POLY1305_IETF_KEYBYTES = 32
export const AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES = 24

export const KDF_BYTES_MIN = 16
export const KDF_BYTES_MAX = 64
export const KDF_CONTEXTBYTES = 8
export const KDF_KEYBYTES = 32

export const PWHASH_ALG_ARGON2ID13 = 2
export const PWHASH_SALTBYTES = 16
export const PWHASH_OPSLIMIT_MODERATE = 3
export const PWHASH_MEMLIMIT_MODERATE = 268_435_456
export const PWHASH_OPSLIMIT_MIN = 1
export const PWHASH_MEMLIMIT_MIN = 8192
export const PWHASH_BYTES_MIN = 16

export const SECRETSTREAM_ABYTES = 17
export const SECRETSTREAM_HEADERBYTES = 24
export const SECRETSTREAM_KEYBYTES = 32
export const SECRETSTREAM_TAG_MESSAGE = 0
export const SECRETSTREAM_TAG_PUSH = 1
export const SECRETSTREAM_TAG_REKEY = 2
export const SECRETSTREAM_TAG_FINAL = 3

export const SIGN_BYTES = 64
export const SIGN_PUBLICKEYBYTES = 32
export const SIGN_SECRETKEYBYTES = 64
export const SIGN_SEEDBYTES = 32

export const GENERICHASH_BYTES = 32
export const GENERICHASH_BYTES_MIN = 16
export const GENERICHASH_BYTES_MAX = 64
export const GENERICHASH_KEYBYTES_MIN = 16
export const GENERICHASH_KEYBYTES_MAX = 64

export const HASH_SHA256_BYTES = 32

const ASCII_MAX = 0x7f
const BASE64_GROUP_CHARS = 4
const BASE64_GROUP_BYTES = 3

export type SecretstreamTag =
  | typeof SECRETSTREAM_TAG_MESSAGE
  | typeof SECRETSTREAM_TAG_PUSH
  | typeof SECRETSTREAM_TAG_REKEY
  | typeof SECRETSTREAM_TAG_FINAL

const SECRETSTREAM_TAGS: readonly number[] = [
  SECRETSTREAM_TAG_MESSAGE,
  SECRETSTREAM_TAG_PUSH,
  SECRETSTREAM_TAG_REKEY,
  SECRETSTREAM_TAG_FINAL,
]

/**
 * State secretstream (kunci turunan + nonce + counter) milik pemanggil. Opaque: jangan dibaca atau
 * disalin; panggil `secretstreamDispose` setelah stream selesai atau gagal.
 */
export type SecretstreamState = { readonly bytes: Uint8Array; readonly brand: 'SecretstreamState' }

export type SignKeyPair = { readonly publicKey: Uint8Array; readonly secretKey: Uint8Array }

function assertLength(name: string, bytes: Uint8Array, expected: number): void {
  if (bytes.length !== expected) {
    throw new RangeError(`${name} harus ${expected} byte, dapat ${bytes.length}`)
  }
}

function assertRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} harus bilangan bulat ${min}..${max}`)
  }
}

export function randomBytes(length: number): Uint8Array {
  assertRange('panjang', length, 0, Number.MAX_SAFE_INTEGER)
  const out = new Uint8Array(length)
  native.randombytesBuf(out)
  return out
}

/** Hapus isi buffer lewat `sodium_memzero` (tidak bisa dihilangkan optimizer). */
export function memzero(bytes: Uint8Array): void {
  native.memzero(bytes)
}

// -- AEAD XChaCha20-Poly1305 (record lokal) ------------------------------------------------------

export function aeadEncrypt(
  message: Uint8Array,
  ad: Uint8Array | null,
  nonce: Uint8Array,
  key: Uint8Array,
): Uint8Array {
  assertLength('nonce', nonce, AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES)
  assertLength('kunci', key, AEAD_XCHACHA20POLY1305_IETF_KEYBYTES)
  const out = new Uint8Array(message.length + AEAD_XCHACHA20POLY1305_IETF_ABYTES)
  native.aeadXChaCha20Poly1305IetfEncrypt(out, message, ad, nonce, key)
  return out
}

/** `null` = MAC tidak valid (kunci salah, AD tidak cocok, atau ciphertext diubah). */
export function aeadDecrypt(
  ciphertext: Uint8Array,
  ad: Uint8Array | null,
  nonce: Uint8Array,
  key: Uint8Array,
): Uint8Array | null {
  assertLength('nonce', nonce, AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES)
  assertLength('kunci', key, AEAD_XCHACHA20POLY1305_IETF_KEYBYTES)
  if (ciphertext.length < AEAD_XCHACHA20POLY1305_IETF_ABYTES) return null
  const out = new Uint8Array(ciphertext.length - AEAD_XCHACHA20POLY1305_IETF_ABYTES)
  return native.aeadXChaCha20Poly1305IetfDecrypt(out, ciphertext, ad, nonce, key) ? out : null
}

// -- KDF (BLAKE2b ber-konteks) -------------------------------------------------------------------

/** Konteks = 8 karakter ASCII protokol (`ip-data-`, `ip-keyid`, `ip-sync-`), bukan data user. */
function encodeContext(context: string): Uint8Array {
  const bytes = new Uint8Array(context.length)
  for (let i = 0; i < context.length; i += 1) {
    const code = context.charCodeAt(i)
    if (code > ASCII_MAX) throw new RangeError('konteks KDF harus ASCII')
    bytes[i] = code
  }
  assertLength('konteks KDF', bytes, KDF_CONTEXTBYTES)
  return bytes
}

export function kdfDeriveFromKey(
  length: number,
  subkeyId: number,
  context: string,
  key: Uint8Array,
): Uint8Array {
  assertRange('panjang subkey', length, KDF_BYTES_MIN, KDF_BYTES_MAX)
  assertRange('subkey id', subkeyId, 0, Number.MAX_SAFE_INTEGER)
  assertLength('kunci KDF', key, KDF_KEYBYTES)
  const out = new Uint8Array(length)
  native.kdfDeriveFromKey(out, subkeyId, encodeContext(context), key)
  return out
}

// -- Argon2id ------------------------------------------------------------------------------------

/**
 * Kata sandi -> byte UTF-8 setelah normalisasi NFC (sama dengan `deriveBackupKey` di web): "é" dari
 * keyboard iOS dan Android bisa berbeda byte-nya, dan backup yang tidak terbuka = data hilang.
 */
export function encodePassword(password: string): Uint8Array {
  return new TextEncoder().encode(password.normalize('NFC'))
}

/**
 * Argon2id13 di thread native latar (MODERATE = 256 MiB, beberapa detik di HP kelas bawah).
 * `password` milik pemanggil dan TIDAK dihapus di sini - pemanggil yang `memzero`.
 */
export function pwhash(
  length: number,
  password: Uint8Array,
  salt: Uint8Array,
  opslimit: number,
  memlimit: number,
): Promise<Uint8Array> {
  assertRange('panjang kunci', length, PWHASH_BYTES_MIN, Number.MAX_SAFE_INTEGER)
  assertLength('salt', salt, PWHASH_SALTBYTES)
  assertRange('opslimit', opslimit, PWHASH_OPSLIMIT_MIN, Number.MAX_SAFE_INTEGER)
  assertRange('memlimit', memlimit, PWHASH_MEMLIMIT_MIN, Number.MAX_SAFE_INTEGER)
  return native.pwhash(length, password, salt, opslimit, memlimit, PWHASH_ALG_ARGON2ID13)
}

// -- Secretstream XChaCha20-Poly1305 (backup, transfer, segmen sync) -----------------------------

let stateBytes: number | null = null

function newState(): SecretstreamState {
  stateBytes ??= native.secretstreamStateBytes()
  return { bytes: new Uint8Array(stateBytes), brand: 'SecretstreamState' }
}

export function secretstreamInitPush(key: Uint8Array): {
  state: SecretstreamState
  header: Uint8Array
} {
  assertLength('kunci secretstream', key, SECRETSTREAM_KEYBYTES)
  const state = newState()
  const header = new Uint8Array(SECRETSTREAM_HEADERBYTES)
  native.secretstreamInitPush(state.bytes, header, key)
  return { state, header }
}

export function secretstreamPush(
  state: SecretstreamState,
  message: Uint8Array,
  ad: Uint8Array | null,
  tag: SecretstreamTag,
): Uint8Array {
  if (!SECRETSTREAM_TAGS.includes(tag)) throw new RangeError('tag secretstream tidak dikenal')
  const out = new Uint8Array(message.length + SECRETSTREAM_ABYTES)
  native.secretstreamPush(state.bytes, out, message, ad, tag)
  return out
}

/** `null` = header tidak valid. */
export function secretstreamInitPull(
  header: Uint8Array,
  key: Uint8Array,
): SecretstreamState | null {
  assertLength('kunci secretstream', key, SECRETSTREAM_KEYBYTES)
  if (header.length !== SECRETSTREAM_HEADERBYTES) return null
  const state = newState()
  if (native.secretstreamInitPull(state.bytes, header, key)) return state
  secretstreamDispose(state)
  return null
}

/**
 * Buka satu chunk. `null` = chunk diubah, urutan salah, AD tidak cocok, atau kunci salah - stream
 * WAJIB dihentikan (state tidak dimajukan). Pemanggil juga wajib memastikan chunk terakhir bertag
 * FINAL; tanpa itu stream terpotong.
 */
export function secretstreamPull(
  state: SecretstreamState,
  ciphertext: Uint8Array,
  ad: Uint8Array | null,
): { message: Uint8Array; tag: SecretstreamTag } | null {
  if (ciphertext.length < SECRETSTREAM_ABYTES) return null
  const out = new Uint8Array(ciphertext.length - SECRETSTREAM_ABYTES)
  const tag = native.secretstreamPull(state.bytes, out, ciphertext, ad)
  if (!SECRETSTREAM_TAGS.includes(tag)) return null
  return { message: out, tag: tag as SecretstreamTag }
}

/** State memuat kunci turunan stream - hapus begitu stream selesai, berhasil maupun gagal. */
export function secretstreamDispose(state: SecretstreamState): void {
  native.memzero(state.bytes)
}

// -- Ed25519 (Device Sign Key, lisensi) ----------------------------------------------------------

export function signKeypair(): SignKeyPair {
  const publicKey = new Uint8Array(SIGN_PUBLICKEYBYTES)
  const secretKey = new Uint8Array(SIGN_SECRETKEYBYTES)
  native.signKeypair(publicKey, secretKey)
  return { publicKey, secretKey }
}

export function signSeedKeypair(seed: Uint8Array): SignKeyPair {
  assertLength('seed', seed, SIGN_SEEDBYTES)
  const publicKey = new Uint8Array(SIGN_PUBLICKEYBYTES)
  const secretKey = new Uint8Array(SIGN_SECRETKEYBYTES)
  native.signSeedKeypair(publicKey, secretKey, seed)
  return { publicKey, secretKey }
}

export function signDetached(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  assertLength('secret key', secretKey, SIGN_SECRETKEYBYTES)
  const signature = new Uint8Array(SIGN_BYTES)
  native.signDetached(signature, message, secretKey)
  return signature
}

export function signVerifyDetached(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  if (signature.length !== SIGN_BYTES || publicKey.length !== SIGN_PUBLICKEYBYTES) return false
  return native.signVerifyDetached(signature, message, publicKey)
}

// -- Hash ----------------------------------------------------------------------------------------

/** BLAKE2b (`crypto_generichash`); `key` opsional 16..64 byte. */
export function genericHash(
  length: number,
  message: Uint8Array,
  key: Uint8Array | null = null,
): Uint8Array {
  assertRange('panjang hash', length, GENERICHASH_BYTES_MIN, GENERICHASH_BYTES_MAX)
  if (key !== null) {
    assertRange(
      'panjang kunci hash',
      key.length,
      GENERICHASH_KEYBYTES_MIN,
      GENERICHASH_KEYBYTES_MAX,
    )
  }
  const out = new Uint8Array(length)
  native.genericHash(out, message, key)
  return out
}

export function hashSha256(message: Uint8Array): Uint8Array {
  const out = new Uint8Array(HASH_SHA256_BYTES)
  native.hashSha256(out, message)
  return out
}

// -- Padding ISO/IEC 7816-4 & base64 -------------------------------------------------------------

export function pad(message: Uint8Array, blockSize: number): Uint8Array {
  assertRange('ukuran blok', blockSize, 1, Number.MAX_SAFE_INTEGER)
  const buf = new Uint8Array((Math.floor(message.length / blockSize) + 1) * blockSize)
  buf.set(message)
  const length = native.pad(buf, message.length, blockSize)
  return buf.subarray(0, length)
}

/** `null` = padding tidak valid (data rusak). Hasil = view di atas `padded`, bukan salinan. */
export function unpad(padded: Uint8Array, blockSize: number): Uint8Array | null {
  assertRange('ukuran blok', blockSize, 1, Number.MAX_SAFE_INTEGER)
  const length = native.unpad(padded, blockSize)
  return length < 0 ? null : padded.subarray(0, length)
}

/** Base64 standar dengan `=` (varian ORIGINAL web), constant-time di native. */
export function toBase64(bytes: Uint8Array): string {
  return native.toBase64(bytes)
}

/** `null` = bukan base64 standar yang sah (karakter asing, padding salah, sisa karakter). */
export function fromBase64(text: string): Uint8Array | null {
  const capacity =
    Math.ceil(text.length / BASE64_GROUP_CHARS) * BASE64_GROUP_BYTES + BASE64_GROUP_BYTES
  const buf = new Uint8Array(capacity)
  const length = native.fromBase64(buf, text)
  if (length < 0) return null
  const out = buf.slice(0, length)
  // Teks base64 bisa berisi kunci (mis. salt/kunci backup tersimpan); buffer sementara dibersihkan.
  native.memzero(buf)
  return out
}
