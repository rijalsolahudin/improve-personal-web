import type { IpSodiumNativeModule } from '../index'
import vectors from '../test-vectors/vectors.json'

/**
 * Native `IpSodium` TIRUAN untuk Jest (didaftarkan di `jest.setup.ts`).
 *
 * Bukan implementasi kripto: setiap panggilan dicocokkan dengan `vectors.json` (hasil libsodium web)
 * dan menulis output yang tercatat di sana. Input yang tidak ada di vektor = exception, supaya test
 * tidak diam-diam lulus dengan data karangan. Dengan begitu Jest menguji wrapper
 * `src/platform/sodium.ts` (ukuran output, urutan argumen, null/false, state stream) terhadap byte
 * web - sedangkan kesamaan byte native sendiri dibuktikan di host (`verify-host.mjs`) dan di
 * perangkat (androidTest/XCTest).
 */

const STATE_BYTES = 52
const STATE_PUSH = 1
const STATE_PULL = 2

function hex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

function bytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length / 2)
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(text.slice(2 * i, 2 * i + 2), 16)
  return out
}

function adHex(ad: Uint8Array | null): string | null {
  return ad === null || ad.length === 0 ? null : hex(ad)
}

function noVector(fn: string): Error {
  return new Error(`IpSodium tiruan: tidak ada vektor untuk ${fn}`)
}

function write(out: Uint8Array, value: string): void {
  const data = bytes(value)
  if (data.length !== out.length) throw noVector('ukuran output')
  out.set(data)
}

type StreamVector = { key: string; header: string; chunks: { ad: string | null }[] }

const streams: StreamVector[] = [...vectors.secretstream, ...vectors.secretstreamInvalid]

/**
 * State tiruan: [mode, indeks stream, posisi chunk]. Stream yang gagal di-pull TIDAK dimajukan,
 * sama dengan native.
 */
function readState(state: Uint8Array): { mode: number; stream: StreamVector; position: number } {
  const stream = streams[state[1] ?? -1]
  if (stream === undefined) throw noVector('state secretstream')
  return { mode: state[0] ?? 0, stream, position: state[2] ?? 0 }
}

function pushChunks(stream: StreamVector) {
  return vectors.secretstream.find((v) => v.key === stream.key && v.header === stream.header)
    ?.chunks
}

const nativeMock: IpSodiumNativeModule = {
  randombytesBuf(out) {
    out.set(globalThis.crypto.getRandomValues(new Uint8Array(out.length)))
  },
  memzero(buf) {
    buf.fill(0)
  },

  aeadXChaCha20Poly1305IetfEncrypt(out, message, ad, nonce, key) {
    const v = vectors.aead.find(
      (c) =>
        c.key === hex(key) &&
        c.nonce === hex(nonce) &&
        c.ad === adHex(ad) &&
        c.message === hex(message),
    )
    if (v === undefined) throw noVector('aead encrypt')
    write(out, v.ciphertext)
  },
  aeadXChaCha20Poly1305IetfDecrypt(out, ciphertext, ad, nonce, key) {
    const match = (c: { key: string; nonce: string; ad: string | null; ciphertext: string }) =>
      c.key === hex(key) &&
      c.nonce === hex(nonce) &&
      c.ad === adHex(ad) &&
      c.ciphertext === hex(ciphertext)
    const v = vectors.aead.find(match)
    if (v !== undefined) {
      write(out, v.message)
      return true
    }
    if (vectors.aeadTampered.some(match)) return false
    throw noVector('aead decrypt')
  },

  kdfDeriveFromKey(out, subkeyId, context, key) {
    const v = vectors.kdf.find(
      (c) =>
        c.key === hex(key) &&
        c.subkeyId === subkeyId &&
        c.length === out.length &&
        hex(new TextEncoder().encode(c.context)) === hex(context),
    )
    if (v === undefined) throw noVector('kdf')
    write(out, v.subkey)
  },

  async pwhash(outLength, password, salt, opslimit, memlimit, alg) {
    const v = vectors.pwhash.find(
      (c) =>
        c.passwordNfc === hex(password) &&
        c.salt === hex(salt) &&
        c.opslimit === opslimit &&
        c.memlimit === memlimit &&
        c.alg === alg &&
        c.length === outLength,
    )
    if (v === undefined) throw noVector('pwhash')
    return bytes(v.key)
  },

  secretstreamStateBytes: () => STATE_BYTES,
  secretstreamInitPush(state, header, key) {
    const index = streams.findIndex((s) => s.key === hex(key))
    const stream = streams[index]
    if (stream === undefined) throw noVector('secretstream init_push')
    header.set(bytes(stream.header))
    state.set([STATE_PUSH, index, 0])
  },
  secretstreamPush(state, out, message, ad, tag) {
    const { mode, stream, position } = readState(state)
    const chunk = pushChunks(stream)?.[position]
    if (
      mode !== STATE_PUSH ||
      chunk === undefined ||
      chunk.message !== hex(message) ||
      chunk.ad !== adHex(ad) ||
      chunk.tag !== tag
    ) {
      throw noVector('secretstream push')
    }
    write(out, chunk.ciphertext)
    state[2] = position + 1
  },
  secretstreamInitPull(state, header, key) {
    const index = streams.findIndex((s) => s.key === hex(key) && s.header === hex(header))
    if (index === -1) throw noVector('secretstream init_pull')
    state.set([STATE_PULL, index, 0])
    return true
  },
  secretstreamPull(state, out, ciphertext, ad) {
    const { mode, stream, position } = readState(state)
    const chunk = pushChunks(stream)?.[position]
    if (mode !== STATE_PULL) throw noVector('secretstream pull')
    if (chunk === undefined || chunk.ciphertext !== hex(ciphertext) || chunk.ad !== adHex(ad)) {
      return -1
    }
    write(out, chunk.message)
    state[2] = position + 1
    return chunk.tag
  },

  signKeypair(pk, sk) {
    const [v] = vectors.sign
    if (v === undefined) throw noVector('sign keypair')
    write(pk, v.publicKey)
    write(sk, v.secretKey)
  },
  signSeedKeypair(pk, sk, seed) {
    const v = vectors.sign.find((c) => c.seed === hex(seed))
    if (v === undefined) throw noVector('sign seed keypair')
    write(pk, v.publicKey)
    write(sk, v.secretKey)
  },
  signDetached(sig, message, sk) {
    const v = vectors.sign.find((c) => c.secretKey === hex(sk) && c.message === hex(message))
    if (v === undefined) throw noVector('sign')
    write(sig, v.signature)
  },
  signVerifyDetached(sig, message, pk) {
    const match = (c: { signature: string; message: string; publicKey: string }) =>
      c.signature === hex(sig) && c.message === hex(message) && c.publicKey === hex(pk)
    if (vectors.sign.some(match)) return true
    if (vectors.signInvalid.some(match)) return false
    throw noVector('verify')
  },

  genericHash(out, message, key) {
    const v = vectors.generichash.find(
      (c) => c.message === hex(message) && c.key === adHex(key) && c.length === out.length,
    )
    if (v === undefined) throw noVector('generichash')
    write(out, v.digest)
  },
  hashSha256(out, message) {
    const v = vectors.sha256.find((c) => c.message === hex(message))
    if (v === undefined) throw noVector('sha256')
    write(out, v.digest)
  },

  pad(buf, unpaddedLength, blockSize) {
    const v = vectors.pad.find(
      (c) => c.blockSize === blockSize && c.unpadded === hex(buf.subarray(0, unpaddedLength)),
    )
    if (v === undefined) throw noVector('pad')
    const padded = bytes(v.padded)
    buf.set(padded)
    return padded.length
  },
  unpad(buf, blockSize) {
    const v = vectors.pad.find((c) => c.blockSize === blockSize && c.padded === hex(buf))
    if (v !== undefined) return v.unpadded.length / 2
    if (vectors.unpadInvalid.some((c) => c.blockSize === blockSize && c.padded === hex(buf))) {
      return -1
    }
    throw noVector('unpad')
  },

  toBase64(bin) {
    const v = vectors.base64.find((c) => c.bin === hex(bin))
    if (v === undefined) throw noVector('base64 encode')
    return v.b64
  },
  fromBase64(out, text) {
    const v = vectors.base64.find((c) => c.b64 === text)
    if (v !== undefined) {
      const decoded = bytes(v.bin)
      out.set(decoded)
      return decoded.length
    }
    if (vectors.base64Invalid.includes(text)) return -1
    throw noVector('base64 decode')
  },
}

export default nativeMock
