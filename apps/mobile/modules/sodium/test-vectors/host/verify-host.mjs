#!/usr/bin/env node
/**
 * Uji byte-identik lapisan C (`cpp/ip_sodium.c` + libsodium hasil build-libsodium.sh) terhadap
 * vectors.json, di mesin host (gcc/clang). Membuktikan: libsodium versi pin + validasi/zeroize
 * di lapisan C menghasilkan byte yang SAMA dengan libsodium web.
 *
 *   node verify-host.mjs <prefix-libsodium-host>     # mis. modules/sodium/vendor/host
 *
 * Yang TIDAK dibuktikan di sini: lem JNI/Kotlin dan Swift, serta kompilasi silang NDK/Xcode. Itu
 * tugas test instrumented (androidTest / XCTest) yang membaca vectors.json yang sama.
 */
import { Buffer } from 'node:buffer'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const prefix = process.argv[2]
if (!prefix) {
  process.stderr.write('pemakaian: verify-host.mjs <prefix-libsodium-host>\n')
  process.exit(2)
}

const here = fileURLToPath(new URL('.', import.meta.url))
const cppDir = join(here, '..', '..', 'cpp')
const vectors = JSON.parse(readFileSync(join(here, '..', 'vectors.json'), 'utf8'))
const binary = join(mkdtempSync(join(tmpdir(), 'ip-sodium-')), 'ip_sodium_cli')

execFileSync(process.env.CC ?? 'cc', [
  '-std=c11',
  '-Wall',
  '-Wextra',
  '-Werror',
  '-O2',
  `-I${cppDir}`,
  `-I${join(prefix, 'include')}`,
  join(cppDir, 'ip_sodium.c'),
  join(here, 'ip_sodium_cli.c'),
  join(prefix, 'lib', 'libsodium.a'),
  '-o',
  binary,
])

const NULL_TOKEN = '-'
const EMPTY_TOKEN = '.'
const tok = (value) => (value === null ? NULL_TOKEN : value === '' ? EMPTY_TOKEN : value)
const textHex = (text) => tok(Buffer.from(text, 'utf8').toString('hex'))

const cases = []
const expect = (name, command, expected) => cases.push({ name, command, expected })

for (const v of vectors.aead) {
  expect(
    `aead enc ${v.name}`,
    ['aead_enc', v.key, v.nonce, tok(v.ad), tok(v.message)],
    v.ciphertext,
  )
  expect(
    `aead dec ${v.name}`,
    ['aead_dec', v.key, v.nonce, tok(v.ad), v.ciphertext],
    tok(v.message),
  )
}
for (const v of vectors.aeadTampered) {
  expect(`aead tamper ${v.name}`, ['aead_dec', v.key, v.nonce, tok(v.ad), v.ciphertext], 'ERR -1')
}
for (const v of vectors.kdf) {
  expect(
    `kdf ${v.name}`,
    ['kdf', v.key, textHex(v.context), String(v.subkeyId), String(v.length)],
    v.subkey,
  )
}
for (const v of vectors.pwhash) {
  const args = [v.salt, String(v.opslimit), String(v.memlimit), String(v.alg), String(v.length)]
  expect(`pwhash ${v.name}`, ['pwhash', v.passwordNfc, ...args], v.key)
}
for (const v of vectors.secretstream) {
  const pushArgs = v.chunks.flatMap((c) => [tok(c.ad), String(c.tag), tok(c.message)])
  expect(
    `secretstream push ${v.name}`,
    ['ss_push', v.key, v.header, ...pushArgs],
    v.chunks.map((c) => c.ciphertext).join(' '),
  )
  const pullArgs = v.chunks.flatMap((c) => [tok(c.ad), c.ciphertext])
  expect(
    `secretstream pull ${v.name}`,
    ['ss_pull', v.key, v.header, ...pullArgs],
    v.chunks.map((c) => `${c.tag}:${tok(c.message)}`).join(' '),
  )
}
for (const v of vectors.secretstreamLarge) {
  const { length, start, step } = v.plaintext
  const args = [v.key, v.header, String(length), String(start), String(step), String(v.chunkBytes)]
  const chunks = v.chunks.map((c) => `${c.tag}:${c.ciphertextLength}:${c.ciphertextSha256}`)
  expect(
    `secretstream large ${v.name}`,
    ['ss_large', ...args, v.firstChunkAd],
    [...chunks, 'roundtrip=ok'].join(' '),
  )
}
for (const v of vectors.secretstreamInvalid) {
  const pullArgs = v.chunks.flatMap((c) => [tok(c.ad), c.ciphertext])
  const run = ['ss_pull', v.key, v.header, ...pullArgs]
  cases.push({
    name: `secretstream invalid ${v.name}`,
    command: run,
    endsWith: `ERR@${v.failsAtChunk}`,
  })
}
for (const v of vectors.sign) {
  expect(`sign keypair ${v.name}`, ['sign_seed', v.seed], `${v.publicKey} ${v.secretKey}`)
  expect(`sign ${v.name}`, ['sign', v.secretKey, tok(v.message)], v.signature)
  expect(`verify ${v.name}`, ['verify', v.signature, tok(v.message), v.publicKey], 'OK')
}
for (const v of vectors.signInvalid) {
  expect(`verify ${v.name}`, ['verify', v.signature, tok(v.message), v.publicKey], 'ERR -1')
}
for (const v of vectors.generichash) {
  expect(`generichash ${v.name}`, ['gh', tok(v.message), tok(v.key), String(v.length)], v.digest)
}
for (const v of vectors.sha256) {
  expect(`sha256 ${v.name}`, ['sha256', tok(v.message)], v.digest)
}
for (const v of vectors.pad) {
  const size = v.unpadded.length / 2
  expect(`pad ${size}/${v.blockSize}`, ['pad', String(v.blockSize), tok(v.unpadded)], v.padded)
  expect(`unpad ${size}/${v.blockSize}`, ['unpad', String(v.blockSize), v.padded], tok(v.unpadded))
}
for (const v of vectors.unpadInvalid) {
  expect(`unpad invalid ${v.name}`, ['unpad', String(v.blockSize), v.padded], 'ERR -1')
}
for (const v of vectors.base64) {
  expect(`base64 enc ${v.bin.length / 2}`, ['b64enc', tok(v.bin)], tok(v.b64))
  expect(`base64 dec ${v.bin.length / 2}`, ['b64dec', textHex(v.b64)], tok(v.bin))
}
for (const text of vectors.base64Invalid) {
  expect(`base64 invalid ${JSON.stringify(text)}`, ['b64dec', textHex(text)], 'ERR -1')
}

const input = cases.map((c) => c.command.join(' ')).join('\n') + '\n'
const result = spawnSync(binary, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
if (result.status !== 0) {
  process.stderr.write(`CLI keluar ${result.status}\n${result.stderr}`)
  process.exit(1)
}

const lines = result.stdout.split('\n')
let failed = 0
cases.forEach((c, index) => {
  const actual = (lines[index] ?? '').trim()
  const ok = c.endsWith === undefined ? actual === c.expected : actual.endsWith(c.endsWith)
  if (!ok) {
    failed += 1
    process.stderr.write(`GAGAL ${c.name}\n`)
  }
})

process.stdout.write(`host: ${cases.length - failed}/${cases.length} vektor cocok\n`)
process.exit(failed === 0 ? 0 : 1)
