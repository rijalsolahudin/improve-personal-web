#!/usr/bin/env node
/**
 * Generator vektor uji byte-identik web <-> mobile (#181).
 *
 *   node apps/mobile/modules/sodium/test-vectors/generate.mjs           # tulis vectors.json
 *   node apps/mobile/modules/sodium/test-vectors/generate.mjs --check   # bandingkan dengan yang ada
 *
 * Sumber kebenaran = `libsodium-wrappers-sumo` yang dipakai web (dimuat dari workspace `apps/web`,
 * tidak ditambahkan sebagai dependency mobile). Semua input deterministik (pola byte, bukan acak),
 * jadi `--check` bisa dijalankan di CI: kalau web menaikkan versi libsodium dan hasilnya berubah,
 * job ini merah sebelum data user lama rusak.
 *
 * Secretstream: header-nya acak di `init_push`, jadi vektor memakai header TETAP lalu state push
 * diambil dari `init_pull(header, key)`. Di libsodium kedua init menurunkan state yang sama
 * (hchacha20(key, header[0..16]), counter 1, inonce = header[16..24]) - generator membuktikannya
 * dengan membuka ciphertext itu lewat pull dan dengan satu putaran init_push sungguhan.
 *
 * Silang-cek ke implementasi lain (bukan libsodium) di Node: SHA-256, Ed25519 (= WebCrypto yang
 * dipakai web untuk Device Sign Key & lisensi), BLAKE2b-512 tanpa kunci.
 */
import { Buffer } from 'node:buffer'
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as opensslSign,
  verify as opensslVerify,
} from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const webRequire = createRequire(new URL('../../../../web/package.json', import.meta.url))
const sodium = webRequire('libsodium-wrappers-sumo')
// `exports` paket tidak membuka `./package.json`; versi dibaca dari berkasnya langsung.
const sumoEntry = webRequire.resolve('libsodium-wrappers-sumo')
const sumoVersion = JSON.parse(
  readFileSync(new URL('../../package.json', pathToFileURL(sumoEntry)), 'utf8'),
).version
await sodium.ready

const OUTPUT = new URL('./vectors.json', import.meta.url)
const BACKUP_CHUNK_BYTES = 64 * 1024
const RECORD_PAD_BLOCK_BYTES = 256

const hex = (bytes) => Buffer.from(bytes).toString('hex')
const utf8 = (text) => new TextEncoder().encode(text)

/** Pola byte deterministik: b[i] = (start + i * step) & 0xff. Direplikasi di test Kotlin/Swift/TS. */
function pattern(length, start, step = 31) {
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) out[i] = (start + i * step) & 0xff
  return out
}

function assert(condition, message) {
  if (!condition) throw new Error(`generator: ${message}`)
}

function throws(fn) {
  try {
    const result = fn()
    return result === false
  } catch {
    return true
  }
}

const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

// -----------------------------------------------------------------------------------------------

const constants = {
  aeadXChaCha20Poly1305IetfABytes: sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES,
  aeadXChaCha20Poly1305IetfKeyBytes: sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
  aeadXChaCha20Poly1305IetfNpubBytes: sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  kdfBytesMin: sodium.crypto_kdf_BYTES_MIN,
  kdfBytesMax: sodium.crypto_kdf_BYTES_MAX,
  kdfContextBytes: sodium.crypto_kdf_CONTEXTBYTES,
  kdfKeyBytes: sodium.crypto_kdf_KEYBYTES,
  pwhashAlgArgon2id13: sodium.crypto_pwhash_ALG_ARGON2ID13,
  pwhashSaltBytes: sodium.crypto_pwhash_SALTBYTES,
  pwhashOpslimitModerate: sodium.crypto_pwhash_OPSLIMIT_MODERATE,
  pwhashMemlimitModerate: sodium.crypto_pwhash_MEMLIMIT_MODERATE,
  pwhashOpslimitMin: sodium.crypto_pwhash_OPSLIMIT_MIN,
  pwhashMemlimitMin: sodium.crypto_pwhash_MEMLIMIT_MIN,
  pwhashBytesMin: sodium.crypto_pwhash_BYTES_MIN,
  secretstreamABytes: sodium.crypto_secretstream_xchacha20poly1305_ABYTES,
  secretstreamHeaderBytes: sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES,
  secretstreamKeyBytes: sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES,
  secretstreamTagMessage: sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE,
  secretstreamTagPush: sodium.crypto_secretstream_xchacha20poly1305_TAG_PUSH,
  secretstreamTagRekey: sodium.crypto_secretstream_xchacha20poly1305_TAG_REKEY,
  secretstreamTagFinal: sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL,
  signBytes: sodium.crypto_sign_BYTES,
  signPublicKeyBytes: sodium.crypto_sign_PUBLICKEYBYTES,
  signSecretKeyBytes: sodium.crypto_sign_SECRETKEYBYTES,
  signSeedBytes: sodium.crypto_sign_SEEDBYTES,
  generichashBytes: sodium.crypto_generichash_BYTES,
  generichashBytesMin: sodium.crypto_generichash_BYTES_MIN,
  generichashBytesMax: sodium.crypto_generichash_BYTES_MAX,
  generichashKeyBytesMin: sodium.crypto_generichash_KEYBYTES_MIN,
  generichashKeyBytesMax: sodium.crypto_generichash_KEYBYTES_MAX,
  hashSha256Bytes: sodium.crypto_hash_sha256_BYTES,
}

// -- AEAD XChaCha20-Poly1305 (record lokal, `provider.ts`) ---------------------------------------

function aeadVector(name, message, ad, keyStart, nonceStart) {
  const key = pattern(32, keyStart)
  const nonce = pattern(24, nonceStart)
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    message,
    ad,
    null,
    nonce,
    key,
  )
  const opened = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, ad, nonce, key)
  assert(isDeepStrictEqual(Buffer.from(opened), Buffer.from(message)), `aead ${name} roundtrip`)
  return {
    name,
    key: hex(key),
    nonce: hex(nonce),
    ad: ad === null ? null : hex(ad),
    message: hex(message),
    ciphertext: hex(ciphertext),
  }
}

const recordAad = utf8('ipr|kid|user-1|record-1|hlc|0')
const aead = [
  aeadVector('empty-message-no-ad', new Uint8Array(0), null, 1, 2),
  aeadVector('short-with-ad', utf8('halo dunia'), utf8('aad'), 3, 4),
  aeadVector(
    'record-v2-padded-256',
    sodium.pad(utf8('{"title":"tugas","done":false}'), RECORD_PAD_BLOCK_BYTES),
    recordAad,
    5,
    6,
  ),
]

const aeadTampered = aead.map((vector) => {
  const ciphertext = Buffer.from(vector.ciphertext, 'hex')
  ciphertext[ciphertext.length - 1] ^= 0x01
  const ad = vector.ad === null ? null : Buffer.from(vector.ad, 'hex')
  assert(
    throws(() =>
      sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        ciphertext,
        ad,
        Buffer.from(vector.nonce, 'hex'),
        Buffer.from(vector.key, 'hex'),
      ),
    ),
    `aead ${vector.name} tamper harus gagal`,
  )
  return { ...vector, name: `${vector.name}-tampered`, ciphertext: ciphertext.toString('hex') }
})

// -- KDF (ip-data- / ip-keyid / ip-sync-) --------------------------------------------------------

function kdfVector(name, context, subkeyId, length, keyStart) {
  const key = pattern(32, keyStart)
  return {
    name,
    key: hex(key),
    context,
    subkeyId,
    length,
    subkey: hex(sodium.crypto_kdf_derive_from_key(length, subkeyId, context, key)),
  }
}

const kdf = [
  kdfVector('data-key', 'ip-data-', 1, 32, 7),
  kdfVector('kid', 'ip-keyid', 1, 16, 7),
  kdfVector('sync-subkey', 'ip-sync-', 1, 32, 8),
  kdfVector('sync-subkey-id-2-max-len', 'ip-sync-', 2, 64, 8),
]

// -- Argon2id (backup, `backup-cipher.ts`: password.normalize('NFC')) ----------------------------

function pwhashVector(name, passwordText, opslimit, memlimit, saltStart) {
  const salt = pattern(16, saltStart)
  const nfc = passwordText.normalize('NFC')
  const key = sodium.crypto_pwhash(
    32,
    nfc,
    salt,
    opslimit,
    memlimit,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  )
  return {
    name,
    // Teks asli BELUM dinormalisasi (NFD) - wrapper mobile yang wajib menormalisasi ke NFC.
    passwordText: passwordText.normalize('NFD'),
    passwordNfc: hex(utf8(nfc)),
    salt: hex(salt),
    opslimit,
    memlimit,
    alg: sodium.crypto_pwhash_ALG_ARGON2ID13,
    length: 32,
    key: hex(key),
  }
}

const pwhash = [
  pwhashVector(
    'backup-moderate-nfc',
    'kata-sandi-café-123',
    sodium.crypto_pwhash_OPSLIMIT_MODERATE,
    sodium.crypto_pwhash_MEMLIMIT_MODERATE,
    9,
  ),
  pwhashVector(
    'min-cost',
    'kata-sandi-cepat',
    sodium.crypto_pwhash_OPSLIMIT_MIN,
    sodium.crypto_pwhash_MEMLIMIT_MIN,
    10,
  ),
]

// -- Secretstream XChaCha20-Poly1305 (backup / transfer / segmen sync) ---------------------------

const { TAG_MESSAGE, TAG_FINAL } = {
  TAG_MESSAGE: sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE,
  TAG_FINAL: sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL,
}

function pushChunks(key, header, chunks) {
  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, key)
  return chunks.map(({ message, ad, tag }) =>
    sodium.crypto_secretstream_xchacha20poly1305_push(state, message, ad, tag),
  )
}

function pullChunks(key, header, ciphertexts, ads) {
  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, key)
  return ciphertexts.map((ciphertext, index) => {
    const result = sodium.crypto_secretstream_xchacha20poly1305_pull(
      state,
      ciphertext,
      ads[index] ?? null,
    )
    assert(result !== false, 'pull gagal untuk ciphertext yang baru dibuat')
    return result
  })
}

function secretstreamVector(name, keyStart, headerStart, chunks) {
  const key = pattern(32, keyStart)
  const header = pattern(24, headerStart)
  const ciphertexts = pushChunks(key, header, chunks)
  const pulled = pullChunks(
    key,
    header,
    ciphertexts,
    chunks.map((chunk) => chunk.ad),
  )
  pulled.forEach((result, index) => {
    assert(isDeepStrictEqual(Buffer.from(result.message), Buffer.from(chunks[index].message)), name)
    assert(result.tag === chunks[index].tag, `${name} tag`)
  })
  return {
    name,
    key: hex(key),
    header: hex(header),
    chunks: chunks.map((chunk, index) => ({
      message: hex(chunk.message),
      ad: chunk.ad === null ? null : hex(chunk.ad),
      tag: chunk.tag,
      ciphertext: hex(ciphertexts[index]),
    })),
  }
}

const backupHeaderLine = utf8(
  '{"format":"ip-backup-enc","version":1,"kdf":{"alg":"argon2id13","opslimit":3,' +
    '"memlimit":268435456,"salt":"CRgnNkVUY3KBkJ+uvczb6g=="},"createdAt":1767225600000}',
)

const secretstream = [
  secretstreamVector('single-final-empty', 11, 12, [
    { message: new Uint8Array(0), ad: null, tag: TAG_FINAL },
  ]),
  secretstreamVector('multi-chunk-header-aad-final', 13, 14, [
    { message: pattern(100, 1), ad: backupHeaderLine, tag: TAG_MESSAGE },
    { message: pattern(37, 2), ad: null, tag: TAG_MESSAGE },
    { message: pattern(5, 3), ad: null, tag: TAG_FINAL },
  ]),
]

// Vektor besar dengan chunk 64 KB persis seperti backup: plaintext & ciphertext tidak disimpan utuh
// (ratusan KB), cukup resep pola + SHA-256 tiap chunk ciphertext.
function largeSecretstreamVector(name, keyStart, headerStart, totalBytes, plainStart) {
  const key = pattern(32, keyStart)
  const header = pattern(24, headerStart)
  const plaintext = pattern(totalBytes, plainStart)
  const chunks = []
  for (let offset = 0; offset < totalBytes; offset += BACKUP_CHUNK_BYTES) {
    const message = plaintext.subarray(offset, offset + BACKUP_CHUNK_BYTES)
    const isLast = offset + BACKUP_CHUNK_BYTES >= totalBytes
    chunks.push({
      message,
      ad: offset === 0 ? backupHeaderLine : null,
      tag: isLast ? TAG_FINAL : TAG_MESSAGE,
    })
  }
  const ciphertexts = pushChunks(key, header, chunks)
  const pulled = pullChunks(
    key,
    header,
    ciphertexts,
    chunks.map((chunk) => chunk.ad),
  )
  assert(
    isDeepStrictEqual(
      Buffer.concat(pulled.map((result) => Buffer.from(result.message))),
      Buffer.from(plaintext),
    ),
    `${name} roundtrip`,
  )
  return {
    name,
    key: hex(key),
    header: hex(header),
    plaintext: { length: totalBytes, start: plainStart, step: 31 },
    chunkBytes: BACKUP_CHUNK_BYTES,
    firstChunkAd: hex(backupHeaderLine),
    chunks: ciphertexts.map((ciphertext, index) => ({
      tag: chunks[index].tag,
      ciphertextLength: ciphertext.length,
      ciphertextSha256: createHash('sha256').update(ciphertext).digest('hex'),
    })),
  }
}

const secretstreamLarge = [
  largeSecretstreamVector('backup-64k-chunks', 15, 16, BACKUP_CHUNK_BYTES * 2 + 1000, 4),
]

// Penyerang mengubah/memotong stream: pull WAJIB gagal di chunk yang disebut.
const multi = secretstream[1]
const swapped = {
  name: 'reordered-chunks',
  key: multi.key,
  header: multi.header,
  chunks: [multi.chunks[0], multi.chunks[2], multi.chunks[1]].map((chunk, index) => ({
    ad: index === 0 ? chunk.ad : null,
    ciphertext: chunk.ciphertext,
  })),
  failsAtChunk: 1,
}
const wrongAd = {
  name: 'first-chunk-wrong-ad',
  key: multi.key,
  header: multi.header,
  chunks: [
    {
      ad: hex(utf8('{"format":"ip-backup-enc","version":2}')),
      ciphertext: multi.chunks[0].ciphertext,
    },
  ],
  failsAtChunk: 0,
}
const secretstreamInvalid = [swapped, wrongAd]
for (const vector of secretstreamInvalid) {
  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(
    Buffer.from(vector.header, 'hex'),
    Buffer.from(vector.key, 'hex'),
  )
  const failedAt = vector.chunks.findIndex((chunk) =>
    throws(() =>
      sodium.crypto_secretstream_xchacha20poly1305_pull(
        state,
        Buffer.from(chunk.ciphertext, 'hex'),
        chunk.ad === null ? null : Buffer.from(chunk.ad, 'hex'),
      ),
    ),
  )
  assert(
    failedAt === vector.failsAtChunk,
    `${vector.name} harus gagal di chunk ${vector.failsAtChunk}`,
  )
}

// Bukti state init_push == init_pull: stream dengan header ACAK dari init_push terbuka lewat pull.
{
  const key = pattern(32, 17)
  const { state, header } = sodium.crypto_secretstream_xchacha20poly1305_init_push(key)
  const sealed = sodium.crypto_secretstream_xchacha20poly1305_push(
    state,
    pattern(9, 5),
    null,
    TAG_FINAL,
  )
  const replayed = pushChunks(key, header, [
    { message: pattern(9, 5), ad: null, tag: TAG_FINAL },
  ])[0]
  assert(
    isDeepStrictEqual(Buffer.from(sealed), Buffer.from(replayed)),
    'init_push != init_pull state',
  )
}

// -- Ed25519 (Device Sign Key, verifikasi lisensi) -----------------------------------------------

function signVector(name, seed, message) {
  const { publicKey, privateKey } = sodium.crypto_sign_seed_keypair(seed)
  const signature = sodium.crypto_sign_detached(message, privateKey)
  // Silang-cek OpenSSL (= jalur WebCrypto di web): Ed25519 deterministik, byte tanda tangan sama.
  const nodePrivate = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(seed)]),
    format: 'der',
    type: 'pkcs8',
  })
  const nodePublic = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey)]),
    format: 'der',
    type: 'spki',
  })
  assert(
    hex(opensslSign(null, message, nodePrivate)) === hex(signature),
    `${name} beda dengan OpenSSL`,
  )
  assert(opensslVerify(null, message, nodePublic, signature), `${name} verifikasi OpenSSL`)
  return {
    name,
    seed: hex(seed),
    publicKey: hex(publicKey),
    secretKey: hex(privateKey),
    message: hex(message),
    signature: hex(signature),
  }
}

const rfc8032Seed = Buffer.from(
  '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
  'hex',
)
const sign = [
  signVector('rfc8032-test-1', rfc8032Seed, new Uint8Array(0)),
  signVector(
    'sync-auth-challenge',
    pattern(32, 18),
    utf8(
      'ip-sync-auth|v1|AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=|' +
        '6f9619ff-8b86-4011-b42d-00c04fc964ff|7c9e6679-7425-40de-944b-e07fc1f90ae7',
    ),
  ),
]
assert(
  sign[0].signature ===
    'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
  'RFC 8032 test 1',
)
const signInvalid = sign.map((vector) => {
  const signature = Buffer.from(vector.signature, 'hex')
  signature[0] ^= 0x01
  assert(
    !sodium.crypto_sign_verify_detached(
      signature,
      Buffer.from(vector.message, 'hex'),
      Buffer.from(vector.publicKey, 'hex'),
    ),
    `${vector.name} tamper`,
  )
  return {
    name: `${vector.name}-tampered`,
    publicKey: vector.publicKey,
    message: vector.message,
    signature: signature.toString('hex'),
  }
})

// -- BLAKE2b (kode verifikasi transfer) & SHA-256 ------------------------------------------------

function generichashVector(name, message, key, length) {
  const digest = sodium.crypto_generichash(length, message, key)
  if (key === null && length === 64) {
    assert(
      createHash('blake2b512').update(message).digest('hex') === hex(digest),
      `${name} OpenSSL`,
    )
  }
  return {
    name,
    message: hex(message),
    key: key === null ? null : hex(key),
    length,
    digest: hex(digest),
  }
}

const generichash = [
  generichashVector('empty-unkeyed-32', new Uint8Array(0), null, 32),
  generichashVector('sas-keyed-32', utf8('ip-sas'), pattern(32, 19), 32),
  generichashVector('min-len-keyed-16', utf8('ip-sas'), pattern(16, 20), 16),
  generichashVector('unkeyed-64-openssl', pattern(1000, 21), null, 64),
]

function sha256Vector(name, message) {
  const digest = sodium.crypto_hash_sha256(message)
  assert(createHash('sha256').update(message).digest('hex') === hex(digest), `${name} OpenSSL`)
  return { name, message: hex(message), digest: hex(digest) }
}

const sha256 = [
  sha256Vector('empty', new Uint8Array(0)),
  sha256Vector('abc', utf8('abc')),
  sha256Vector('pattern-1000', pattern(1000, 22)),
]

// -- Padding ISO/IEC 7816-4 & base64 ORIGINAL ----------------------------------------------------

const pad = [0, 1, 255, 256, 300].map((length) => {
  const message = pattern(length, 23)
  return {
    blockSize: RECORD_PAD_BLOCK_BYTES,
    unpadded: hex(message),
    padded: hex(sodium.pad(message, RECORD_PAD_BLOCK_BYTES)),
  }
})
pad.push({
  blockSize: 16,
  unpadded: hex(pattern(16, 24)),
  padded: hex(sodium.pad(pattern(16, 24), 16)),
})

const unpadInvalid = [
  { name: 'no-marker', blockSize: 16, padded: hex(new Uint8Array(16)) },
  { name: 'not-block-multiple', blockSize: 16, padded: hex(Uint8Array.of(1, 0x80)) },
]
for (const vector of unpadInvalid) {
  assert(
    throws(() => sodium.unpad(Buffer.from(vector.padded, 'hex'), vector.blockSize)),
    vector.name,
  )
}

const ORIGINAL = sodium.base64_variants.ORIGINAL
const base64 = [0, 1, 2, 3, 32].map((length) => {
  const bin = pattern(length, 25)
  return { bin: hex(bin), b64: sodium.to_base64(bin, ORIGINAL) }
})
const base64Invalid = ['QQ', 'QQ==x', '####', 'Q Q==']
for (const text of base64Invalid) {
  assert(
    throws(() => sodium.from_base64(text, ORIGINAL)),
    `base64 "${text}" harus ditolak`,
  )
}

// -----------------------------------------------------------------------------------------------

const vectors = {
  meta: {
    description: 'Vektor byte-identik web <-> mobile. Dibuat generate.mjs - JANGAN diedit manual.',
    source: 'libsodium-wrappers-sumo',
    sourceVersion: sumoVersion,
    libsodiumVersion: sodium.SODIUM_VERSION_STRING,
    pattern: 'b[i] = (start + i * step) & 0xff',
  },
  constants,
  aead,
  aeadTampered,
  kdf,
  pwhash,
  secretstream,
  secretstreamLarge,
  secretstreamInvalid,
  sign,
  signInvalid,
  generichash,
  sha256,
  pad,
  unpadInvalid,
  base64,
  base64Invalid,
}

if (process.argv.includes('--check')) {
  const committed = JSON.parse(readFileSync(OUTPUT, 'utf8'))
  if (!isDeepStrictEqual(committed, JSON.parse(JSON.stringify(vectors)))) {
    process.stderr.write('vectors.json BERBEDA dari hasil libsodium web saat ini.\n')
    process.exit(1)
  }
  process.stdout.write(
    `vectors.json cocok (sumo ${sumoVersion}, libsodium ${vectors.meta.libsodiumVersion})\n`,
  )
} else {
  // Diformat Prettier repo (dependency root) supaya hasil regenerate langsung lolos `prettier --check`.
  const rootRequire = createRequire(new URL('../../../../../package.json', import.meta.url))
  const prettierModule = await import(pathToFileURL(rootRequire.resolve('prettier')).href)
  const prettier = prettierModule.default ?? prettierModule
  const options = await prettier.resolveConfig(fileURLToPath(OUTPUT))
  const formatted = await prettier.format(JSON.stringify(vectors), { ...options, parser: 'json' })
  writeFileSync(OUTPUT, formatted)
  process.stdout.write(
    `vectors.json ditulis (sumo ${sumoVersion}, libsodium ${vectors.meta.libsodiumVersion})\n`,
  )
}
