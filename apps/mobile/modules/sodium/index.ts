import { requireNativeModule } from 'expo'

/**
 * Kontrak native modul `IpSodium` (Kotlin `IpSodiumModule.kt`, Swift `IpSodiumModule.swift`).
 *
 * Hanya `src/platform/sodium.ts` yang boleh mengimpor ini: di sana ukuran output dihitung, input
 * divalidasi, dan hasil "verifikasi gagal" diterjemahkan. Konvensi native:
 * - Output ditulis ke `Uint8Array` milik pemanggil (`out`, `state`, `pk`/`sk`/`sig`) - tidak ada
 *   salinan kunci/plaintext di heap JVM/Swift.
 * - Argumen salah ukuran = exception (`SodiumArgumentException`), libsodium gagal =
 *   `SodiumInternalException`. MAC/tanda tangan/padding/base64 tidak valid = `false` / `-1`.
 * - `pwhash` satu-satunya yang asinkron (Argon2id berjalan di thread latar) dan mengembalikan hasil.
 */
export type IpSodiumNativeModule = {
  randombytesBuf(out: Uint8Array): void
  memzero(buf: Uint8Array): void

  aeadXChaCha20Poly1305IetfEncrypt(
    out: Uint8Array,
    message: Uint8Array,
    ad: Uint8Array | null,
    nonce: Uint8Array,
    key: Uint8Array,
  ): void
  aeadXChaCha20Poly1305IetfDecrypt(
    out: Uint8Array,
    ciphertext: Uint8Array,
    ad: Uint8Array | null,
    nonce: Uint8Array,
    key: Uint8Array,
  ): boolean

  kdfDeriveFromKey(out: Uint8Array, subkeyId: number, context: Uint8Array, key: Uint8Array): void

  pwhash(
    outLength: number,
    password: Uint8Array,
    salt: Uint8Array,
    opslimit: number,
    memlimit: number,
    alg: number,
  ): Promise<Uint8Array>

  secretstreamStateBytes(): number
  secretstreamInitPush(state: Uint8Array, header: Uint8Array, key: Uint8Array): void
  secretstreamPush(
    state: Uint8Array,
    out: Uint8Array,
    message: Uint8Array,
    ad: Uint8Array | null,
    tag: number,
  ): void
  secretstreamInitPull(state: Uint8Array, header: Uint8Array, key: Uint8Array): boolean
  /** Tag (>= 0) bila chunk sah, -1 bila MAC/urutan/AD gagal. */
  secretstreamPull(
    state: Uint8Array,
    out: Uint8Array,
    ciphertext: Uint8Array,
    ad: Uint8Array | null,
  ): number

  signKeypair(pk: Uint8Array, sk: Uint8Array): void
  signSeedKeypair(pk: Uint8Array, sk: Uint8Array, seed: Uint8Array): void
  signDetached(sig: Uint8Array, message: Uint8Array, sk: Uint8Array): void
  signVerifyDetached(sig: Uint8Array, message: Uint8Array, pk: Uint8Array): boolean

  genericHash(out: Uint8Array, message: Uint8Array, key: Uint8Array | null): void
  hashSha256(out: Uint8Array, message: Uint8Array): void

  /** `buf` berisi `unpaddedLength` byte data + ruang padding; kembalian = panjang setelah pad. */
  pad(buf: Uint8Array, unpaddedLength: number, blockSize: number): number
  /** Panjang sebelum padding, atau -1 bila padding tidak valid. */
  unpad(buf: Uint8Array, blockSize: number): number

  toBase64(bin: Uint8Array): string
  /** Jumlah byte yang ditulis ke `out`, atau -1 bila teks bukan base64 standar yang sah. */
  fromBase64(out: Uint8Array, text: string): number
}

export default requireNativeModule<IpSodiumNativeModule>('IpSodium')
