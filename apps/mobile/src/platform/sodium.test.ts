import vectors from '../../modules/sodium/test-vectors/vectors.json'
import {
  aeadDecrypt,
  aeadEncrypt,
  AEAD_XCHACHA20POLY1305_IETF_ABYTES,
  AEAD_XCHACHA20POLY1305_IETF_KEYBYTES,
  AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES,
  encodePassword,
  fromBase64,
  genericHash,
  GENERICHASH_BYTES,
  GENERICHASH_BYTES_MAX,
  GENERICHASH_BYTES_MIN,
  GENERICHASH_KEYBYTES_MAX,
  GENERICHASH_KEYBYTES_MIN,
  hashSha256,
  HASH_SHA256_BYTES,
  kdfDeriveFromKey,
  KDF_BYTES_MAX,
  KDF_BYTES_MIN,
  KDF_CONTEXTBYTES,
  KDF_KEYBYTES,
  memzero,
  pad,
  pwhash,
  PWHASH_ALG_ARGON2ID13,
  PWHASH_BYTES_MIN,
  PWHASH_MEMLIMIT_MIN,
  PWHASH_MEMLIMIT_MODERATE,
  PWHASH_OPSLIMIT_MIN,
  PWHASH_OPSLIMIT_MODERATE,
  PWHASH_SALTBYTES,
  randomBytes,
  secretstreamDispose,
  secretstreamInitPull,
  secretstreamInitPush,
  secretstreamPull,
  secretstreamPush,
  SECRETSTREAM_ABYTES,
  SECRETSTREAM_HEADERBYTES,
  SECRETSTREAM_KEYBYTES,
  SECRETSTREAM_TAG_FINAL,
  SECRETSTREAM_TAG_MESSAGE,
  SECRETSTREAM_TAG_PUSH,
  SECRETSTREAM_TAG_REKEY,
  signDetached,
  signKeypair,
  signSeedKeypair,
  signVerifyDetached,
  SIGN_BYTES,
  SIGN_PUBLICKEYBYTES,
  SIGN_SECRETKEYBYTES,
  SIGN_SEEDBYTES,
  toBase64,
  unpad,
  type SecretstreamTag,
} from './sodium'

/*
 * Native di Jest = tiruan berbasis vectors.json (modules/sodium/__mocks__). Test ini membuktikan
 * wrapper TS memanggil native dengan argumen & ukuran yang menghasilkan byte web. Kesamaan byte
 * libsodium native dibuktikan terpisah: `verify-host.mjs` (host) dan androidTest/XCTest (perangkat).
 */

function fromHex(text: string | null): Uint8Array | null {
  if (text === null) return null
  const out = new Uint8Array(text.length / 2)
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(text.slice(2 * i, 2 * i + 2), 16)
  return out
}

function hex(text: string): Uint8Array {
  return fromHex(text) ?? new Uint8Array(0)
}

const asTag = (tag: number) => tag as SecretstreamTag

describe('konstanta', () => {
  it('sama dengan libsodium web', () => {
    const c = vectors.constants
    expect({
      aead: [
        AEAD_XCHACHA20POLY1305_IETF_ABYTES,
        AEAD_XCHACHA20POLY1305_IETF_KEYBYTES,
        AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES,
      ],
      kdf: [KDF_BYTES_MIN, KDF_BYTES_MAX, KDF_CONTEXTBYTES, KDF_KEYBYTES],
      pwhash: [
        PWHASH_ALG_ARGON2ID13,
        PWHASH_SALTBYTES,
        PWHASH_OPSLIMIT_MODERATE,
        PWHASH_MEMLIMIT_MODERATE,
        PWHASH_OPSLIMIT_MIN,
        PWHASH_MEMLIMIT_MIN,
        PWHASH_BYTES_MIN,
      ],
      secretstream: [
        SECRETSTREAM_ABYTES,
        SECRETSTREAM_HEADERBYTES,
        SECRETSTREAM_KEYBYTES,
        SECRETSTREAM_TAG_MESSAGE,
        SECRETSTREAM_TAG_PUSH,
        SECRETSTREAM_TAG_REKEY,
        SECRETSTREAM_TAG_FINAL,
      ],
      sign: [SIGN_BYTES, SIGN_PUBLICKEYBYTES, SIGN_SECRETKEYBYTES, SIGN_SEEDBYTES],
      hash: [
        GENERICHASH_BYTES,
        GENERICHASH_BYTES_MIN,
        GENERICHASH_BYTES_MAX,
        GENERICHASH_KEYBYTES_MIN,
        GENERICHASH_KEYBYTES_MAX,
        HASH_SHA256_BYTES,
      ],
    }).toEqual({
      aead: [
        c.aeadXChaCha20Poly1305IetfABytes,
        c.aeadXChaCha20Poly1305IetfKeyBytes,
        c.aeadXChaCha20Poly1305IetfNpubBytes,
      ],
      kdf: [c.kdfBytesMin, c.kdfBytesMax, c.kdfContextBytes, c.kdfKeyBytes],
      pwhash: [
        c.pwhashAlgArgon2id13,
        c.pwhashSaltBytes,
        c.pwhashOpslimitModerate,
        c.pwhashMemlimitModerate,
        c.pwhashOpslimitMin,
        c.pwhashMemlimitMin,
        c.pwhashBytesMin,
      ],
      secretstream: [
        c.secretstreamABytes,
        c.secretstreamHeaderBytes,
        c.secretstreamKeyBytes,
        c.secretstreamTagMessage,
        c.secretstreamTagPush,
        c.secretstreamTagRekey,
        c.secretstreamTagFinal,
      ],
      sign: [c.signBytes, c.signPublicKeyBytes, c.signSecretKeyBytes, c.signSeedBytes],
      hash: [
        c.generichashBytes,
        c.generichashBytesMin,
        c.generichashBytesMax,
        c.generichashKeyBytesMin,
        c.generichashKeyBytesMax,
        c.hashSha256Bytes,
      ],
    })
  })
})

describe('AEAD XChaCha20-Poly1305', () => {
  it.each(vectors.aead)('$name: enkripsi & dekripsi byte-identik dengan web', (v) => {
    const sealed = aeadEncrypt(hex(v.message), fromHex(v.ad), hex(v.nonce), hex(v.key))
    expect(sealed).toEqual(hex(v.ciphertext))
    expect(aeadDecrypt(sealed, fromHex(v.ad), hex(v.nonce), hex(v.key))).toEqual(hex(v.message))
  })

  it.each(vectors.aeadTampered)('$name: ciphertext diubah -> null', (v) => {
    expect(aeadDecrypt(hex(v.ciphertext), fromHex(v.ad), hex(v.nonce), hex(v.key))).toBeNull()
  })

  it('ciphertext lebih pendek dari tag -> null tanpa memanggil native', () => {
    const [v] = vectors.aead
    if (v === undefined) throw new Error('vektor aead kosong')
    expect(aeadDecrypt(new Uint8Array(15), null, hex(v.nonce), hex(v.key))).toBeNull()
  })

  it('menolak nonce/kunci salah ukuran sebagai bug pemanggil', () => {
    const key = new Uint8Array(AEAD_XCHACHA20POLY1305_IETF_KEYBYTES)
    expect(() => aeadEncrypt(new Uint8Array(1), null, new Uint8Array(12), key)).toThrow(RangeError)
    expect(() =>
      aeadDecrypt(new Uint8Array(32), null, new Uint8Array(24), new Uint8Array(16)),
    ).toThrow('kunci harus 32 byte')
  })
})

describe('KDF', () => {
  it.each(vectors.kdf)('$name: subkey sama dengan web', (v) => {
    expect(kdfDeriveFromKey(v.length, v.subkeyId, v.context, hex(v.key))).toEqual(hex(v.subkey))
  })

  it('menolak konteks yang bukan 8 karakter ASCII dan panjang di luar batas', () => {
    const key = new Uint8Array(KDF_KEYBYTES)
    expect(() => kdfDeriveFromKey(32, 1, 'ip-sync', key)).toThrow('konteks KDF harus 8 byte')
    expect(() => kdfDeriveFromKey(32, 1, 'ip-syné-', key)).toThrow('ASCII')
    expect(() => kdfDeriveFromKey(KDF_BYTES_MAX + 1, 1, 'ip-sync-', key)).toThrow(RangeError)
    expect(() => kdfDeriveFromKey(32, -1, 'ip-sync-', key)).toThrow(RangeError)
  })
})

describe('Argon2id', () => {
  it.each(vectors.pwhash)('$name: kata sandi dinormalisasi ke byte NFC web', (v) => {
    expect(encodePassword(v.passwordText)).toEqual(hex(v.passwordNfc))
  })

  it('vektor NFC benar-benar memuat teks NFD (bukan kebetulan sama)', () => {
    const decomposed = vectors.pwhash.filter(
      (v) => v.passwordText !== v.passwordText.normalize('NFC'),
    )
    expect(decomposed.map((v) => v.name)).toEqual(['backup-moderate-nfc'])
  })

  it.each(vectors.pwhash)('$name: kunci sama dengan web', async (v) => {
    const key = await pwhash(
      v.length,
      encodePassword(v.passwordText),
      hex(v.salt),
      v.opslimit,
      v.memlimit,
    )
    expect(key).toEqual(hex(v.key))
  })

  it('menolak salt dan biaya di bawah minimum libsodium', () => {
    const password = encodePassword('kata-sandi-panjang')
    const salt = new Uint8Array(PWHASH_SALTBYTES)
    expect(() => pwhash(32, password, new Uint8Array(8), 3, PWHASH_MEMLIMIT_MODERATE)).toThrow(
      'salt harus 16 byte',
    )
    expect(() => pwhash(32, password, salt, 0, PWHASH_MEMLIMIT_MODERATE)).toThrow(RangeError)
    expect(() => pwhash(32, password, salt, 3, PWHASH_MEMLIMIT_MIN - 1)).toThrow(RangeError)
  })
})

describe('secretstream', () => {
  it.each(vectors.secretstream)('$name: push menghasilkan chunk web', (v) => {
    const { state, header } = secretstreamInitPush(hex(v.key))
    expect(header).toEqual(hex(v.header))
    for (const chunk of v.chunks) {
      expect(
        secretstreamPush(state, hex(chunk.message), fromHex(chunk.ad), asTag(chunk.tag)),
      ).toEqual(hex(chunk.ciphertext))
    }
    secretstreamDispose(state)
    expect(state.bytes.every((byte) => byte === 0)).toBe(true)
  })

  it.each(vectors.secretstream)('$name: pull membuka chunk web + tag FINAL', (v) => {
    const state = secretstreamInitPull(hex(v.header), hex(v.key))
    if (state === null) throw new Error('init_pull gagal')
    const pulled = v.chunks.map((chunk) =>
      secretstreamPull(state, hex(chunk.ciphertext), fromHex(chunk.ad)),
    )
    expect(pulled).toEqual(
      v.chunks.map((chunk) => ({ message: hex(chunk.message), tag: chunk.tag })),
    )
    expect(pulled.at(-1)?.tag).toBe(SECRETSTREAM_TAG_FINAL)
  })

  it.each(vectors.secretstreamInvalid)('$name: gagal di chunk yang diubah', (v) => {
    const state = secretstreamInitPull(hex(v.header), hex(v.key))
    if (state === null) throw new Error('init_pull gagal')
    const results = v.chunks.map((chunk) =>
      secretstreamPull(state, hex(chunk.ciphertext), fromHex(chunk.ad)),
    )
    expect(results.findIndex((result) => result === null)).toBe(v.failsAtChunk)
  })

  it('header/ciphertext terlalu pendek -> null; tag tak dikenal -> error', () => {
    const key = new Uint8Array(SECRETSTREAM_KEYBYTES)
    expect(secretstreamInitPull(new Uint8Array(10), key)).toBeNull()

    const [v] = vectors.secretstream
    if (v === undefined) throw new Error('vektor secretstream kosong')
    const state = secretstreamInitPull(hex(v.header), hex(v.key))
    if (state === null) throw new Error('init_pull gagal')
    expect(secretstreamPull(state, new Uint8Array(SECRETSTREAM_ABYTES - 1), null)).toBeNull()

    const pushed = secretstreamInitPush(hex(v.key))
    expect(() => secretstreamPush(pushed.state, new Uint8Array(0), null, asTag(9))).toThrow(
      'tag secretstream tidak dikenal',
    )
  })
})

describe('Ed25519', () => {
  it.each(vectors.sign)('$name: keypair, tanda tangan, verifikasi sama dengan web', (v) => {
    const pair = signSeedKeypair(hex(v.seed))
    expect(pair).toEqual({ publicKey: hex(v.publicKey), secretKey: hex(v.secretKey) })
    const signature = signDetached(hex(v.message), pair.secretKey)
    expect(signature).toEqual(hex(v.signature))
    expect(signVerifyDetached(signature, hex(v.message), pair.publicKey)).toBe(true)
  })

  it.each(vectors.signInvalid)('$name: tanda tangan diubah -> false', (v) => {
    expect(signVerifyDetached(hex(v.signature), hex(v.message), hex(v.publicKey))).toBe(false)
  })

  it('ukuran tanda tangan/public key salah -> false; keypair baru berukuran benar', () => {
    expect(signVerifyDetached(new Uint8Array(10), new Uint8Array(0), new Uint8Array(32))).toBe(
      false,
    )
    const pair = signKeypair()
    expect([pair.publicKey.length, pair.secretKey.length]).toEqual([32, 64])
    expect(() => signDetached(new Uint8Array(0), new Uint8Array(32))).toThrow(RangeError)
  })
})

describe('hash', () => {
  it.each(vectors.generichash)('$name: BLAKE2b sama dengan web', (v) => {
    expect(genericHash(v.length, hex(v.message), fromHex(v.key))).toEqual(hex(v.digest))
  })

  it.each(vectors.sha256)('$name: SHA-256 sama dengan web', (v) => {
    expect(hashSha256(hex(v.message))).toEqual(hex(v.digest))
  })

  it('menolak panjang hash/kunci di luar batas', () => {
    expect(() => genericHash(8, new Uint8Array(0))).toThrow(RangeError)
    expect(() => genericHash(32, new Uint8Array(0), new Uint8Array(8))).toThrow(RangeError)
  })
})

describe('padding & base64', () => {
  it.each(vectors.pad)('pad $blockSize: sama dengan sodium.pad web', (v) => {
    expect(pad(hex(v.unpadded), v.blockSize)).toEqual(hex(v.padded))
    expect(unpad(hex(v.padded), v.blockSize)).toEqual(hex(v.unpadded))
  })

  it.each(vectors.unpadInvalid)('$name: padding rusak -> null', (v) => {
    expect(unpad(hex(v.padded), v.blockSize)).toBeNull()
  })

  it.each(vectors.base64)('base64 "$b64" dua arah', (v) => {
    expect(toBase64(hex(v.bin))).toBe(v.b64)
    expect(fromBase64(v.b64)).toEqual(hex(v.bin))
  })

  it.each(vectors.base64Invalid)('base64 tidak sah %j -> null', (text) => {
    expect(fromBase64(text)).toBeNull()
  })

  it('menolak ukuran blok bukan bilangan bulat positif', () => {
    expect(() => pad(new Uint8Array(1), 0)).toThrow(RangeError)
    expect(() => unpad(new Uint8Array(16), 1.5)).toThrow(RangeError)
  })
})

describe('acak & memzero', () => {
  it('randomBytes memberi panjang yang diminta dan memzero mengosongkan buffer', () => {
    const bytes = randomBytes(32)
    expect(bytes).toHaveLength(32)
    memzero(bytes)
    expect(bytes.every((byte) => byte === 0)).toBe(true)
    expect(() => randomBytes(-1)).toThrow(RangeError)
  })
})
