#!/usr/bin/env node
/**
 * Verifier minisign tanpa dependency, dipakai build-libsodium.sh bila binary `minisign` tidak ada.
 *
 *   node verify-minisign.mjs <public-key-base64> <file> <file.minisig> <expected-file-name>
 *
 * Format minisign (https://jedisct1.github.io/minisign/):
 * - public key  = "Ed" || key_id[8] || ed25519_pk[32]
 * - signature   = "ED" || key_id[8] || ed25519(BLAKE2b-512(file))[64]   (mode "hashed"; "Ed" = legacy,
 *                 tanda tangan atas isi file mentah - DITOLAK karena rilis libsodium memakai mode hashed)
 * - global sig  = ed25519(signature[64] || trusted_comment)               (mengikat trusted comment)
 *
 * Trusted comment wajib menyebut `file:<expected-file-name>`: tanda tangan sah dari kunci yang sama
 * untuk berkas LAIN (mis. versi lama) tidak boleh diterima sebagai berkas ini.
 *
 * Primitif dari `node:crypto` (OpenSSL): Ed25519 + BLAKE2b-512. Tidak ada algoritma buatan sendiri.
 * Keluar 0 bila lulus, 1 bila gagal. Tidak mencetak isi file.
 */
import { Buffer } from 'node:buffer'
import { createHash, createPublicKey, verify } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { basename } from 'node:path'

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const KEY_ID_BYTES = 8
const PUBLIC_KEY_BYTES = 32
const SIGNATURE_BYTES = 64
const ALG_BYTES = 2
const TRUSTED_PREFIX = 'trusted comment: '

function fail(message) {
  process.stderr.write(`minisign: GAGAL - ${message}\n`)
  process.exit(1)
}

function decodePublicKey(base64) {
  const raw = Buffer.from(base64, 'base64')
  if (raw.length !== ALG_BYTES + KEY_ID_BYTES + PUBLIC_KEY_BYTES) fail('panjang public key salah')
  if (raw.subarray(0, ALG_BYTES).toString('latin1') !== 'Ed') fail('algoritma public key bukan Ed')
  const keyId = raw.subarray(ALG_BYTES, ALG_BYTES + KEY_ID_BYTES)
  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw.subarray(ALG_BYTES + KEY_ID_BYTES)]),
    format: 'der',
    type: 'spki',
  })
  return { keyId, key }
}

function parseSignatureFile(path) {
  const lines = readFileSync(path, 'utf8').split('\n')
  const [, sigLine, trustedLine, globalLine] = lines
  if (!sigLine || !trustedLine?.startsWith(TRUSTED_PREFIX) || !globalLine) {
    fail('format .minisig tidak dikenal')
  }
  const sig = Buffer.from(sigLine, 'base64')
  if (sig.length !== ALG_BYTES + KEY_ID_BYTES + SIGNATURE_BYTES) fail('panjang signature salah')
  const globalSig = Buffer.from(globalLine, 'base64')
  if (globalSig.length !== SIGNATURE_BYTES) fail('panjang global signature salah')
  return {
    alg: sig.subarray(0, ALG_BYTES).toString('latin1'),
    keyId: sig.subarray(ALG_BYTES, ALG_BYTES + KEY_ID_BYTES),
    signature: sig.subarray(ALG_BYTES + KEY_ID_BYTES),
    trustedComment: trustedLine.slice(TRUSTED_PREFIX.length),
    globalSig,
  }
}

function blake2b512(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('blake2b512')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest()))
  })
}

const [publicKeyBase64, filePath, signaturePath, expectedName] = process.argv.slice(2)
if (!publicKeyBase64 || !filePath || !signaturePath || !expectedName) {
  fail('pemakaian: verify-minisign.mjs <pubkey> <file> <file.minisig> <expected-file-name>')
}

const publicKey = decodePublicKey(publicKeyBase64)
const parsed = parseSignatureFile(signaturePath)

if (parsed.alg !== 'ED') fail(`mode signature "${parsed.alg}" ditolak (wajib "ED"/hashed)`)
if (!parsed.keyId.equals(publicKey.keyId)) fail('key id signature tidak cocok dengan public key')
if (!verify(null, await blake2b512(filePath), publicKey.key, parsed.signature)) {
  fail('signature berkas tidak valid')
}

const globalMessage = Buffer.concat([parsed.signature, Buffer.from(parsed.trustedComment, 'utf8')])
if (!verify(null, globalMessage, publicKey.key, parsed.globalSig)) {
  fail('global signature (trusted comment) tidak valid')
}

const fileField = parsed.trustedComment.split('\t').find((field) => field.startsWith('file:'))
if (fileField !== `file:${expectedName}` || basename(filePath) !== expectedName) {
  fail(`trusted comment menyebut "${fileField ?? '-'}", bukan file:${expectedName}`)
}

process.stdout.write(
  `minisign: OK key_id=${Buffer.from(parsed.keyId).reverse().toString('hex').toUpperCase()} ` +
    `${parsed.trustedComment}\n`,
)
