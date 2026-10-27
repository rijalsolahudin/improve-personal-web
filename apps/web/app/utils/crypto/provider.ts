import {
  KID_BYTES,
  RECORD_PAD_BLOCK_BYTES,
  RECORD_V2_CIPHERTEXT_OFFSET,
  RECORD_V2_NONCE_BYTES,
  RECORD_V2_NONCE_OFFSET,
  SEALED_RECORD_V2_MAX_PLAINTEXT_BYTES,
  encodeRecordAadV2,
  encodeSealedBlobHeaderV2,
  parseSealedBlobHeader,
} from '@improve-personal/contracts'
import type {
  CryptoProvider,
  OpenRecordInput,
  SealRecordInput,
  SecureKeyMaterial,
} from '@improve-personal/core'

import { loadSodium, type SodiumModule } from './sodium'

/**
 * `CryptoProvider` web: XChaCha20-Poly1305 lewat libsodium (ARCHITECTURE §5 & §6, ADR 4).
 *
 * Catatan tempat: §5 menaruh implementasi ini di `packages/crypto`. Untuk sekarang ia hidup di
 * `apps/web` (keputusan sadar: lebih cepat kelihatan hasilnya), dengan konsekuensi yang harus dibayar
 * saat mobile (T23) mulai: logika kunci ini harus dipindah ke paket bersama, JANGAN disalin.
 * Yang tidak boleh dikompromikan adalah perilakunya - karena itu kontraknya tetap `CryptoProvider`
 * dari core, bukan interface buatan sendiri.
 *
 * Provider ini hanya MEMPRODUKSI dan MEMBUKA blob v2 (spec #120 §2.1, §4.1-4.2). Layout, AAD, dan
 * konstanta berasal dari `@improve-personal/contracts` (dikunci vektor emas), bukan ditulis ulang:
 *
 *   "ipr" || 0x02 || KID[16] || nonce[24] || AEAD(pad(plaintext, 256))   -> base64 standar
 *
 * - AAD mengikat KID, akun, record, HLC, dan `deleted`: blob tidak bisa dipindah ke record/akun lain
 *   dan metadata sync tidak bisa diubah server tanpa membuat blob gagal dibuka.
 * - Padding 256 byte: panjang plaintext hanya bocor per bucket.
 * - DILARANG ada kunci, nonce, atau plaintext di log. Fungsi ini tidak mencatat apa pun.
 */

/** Jenis bahan kunci yang dipahami provider ini. Slot lain (passkey/recovery) belum diimplementasi. */
export const RAW_DATA_KEY_KIND = 'raw-32'

/** Panjang kunci data (byte) - XChaCha20-Poly1305 memakai kunci 32 byte. */
const DATA_KEY_BYTES = 32

/**
 * Identitas kunci yang melekat pada kunci data: KID (fingerprint non-rahasia turunan kunci utama) dan
 * akun pemilik. Keduanya masuk AAD, jadi dibawa BERSAMA kuncinya - tidak ada jalur untuk menyegel
 * dengan kunci milik akun A tetapi mengaku akun B.
 */
export type RecordKeyIdentity = {
  readonly kid: Uint8Array
  readonly userId: string
}

/**
 * Bahan kunci berupa byte mentah, terikat ke identitas kunci.
 *
 * Dipakai setelah unlock (kunci utama sudah dibuka di memori) dan di test. Sengaja BUKAN bentuk yang
 * disimpan di perangkat: `SecureKeyStore` yang menyimpan handle non-extractable, dan kunci utama
 * tidak pernah ditulis mentah ke disk.
 */
export type RawDataKeyMaterial = SecureKeyMaterial & {
  readonly kind: typeof RAW_DATA_KEY_KIND
  readonly identity: RecordKeyIdentity
}

/** Bungkus byte kunci + identitasnya jadi bahan kunci yang bisa dipakai `CryptoProvider`. */
export function rawDataKeyMaterial(
  bytes: Uint8Array,
  identity: RecordKeyIdentity,
): RawDataKeyMaterial {
  if (bytes.length !== DATA_KEY_BYTES) {
    throw new Error(`kunci data harus ${DATA_KEY_BYTES} byte, dapat ${bytes.length}`)
  }
  if (identity.kid.length !== KID_BYTES) {
    throw new Error(`KID harus ${KID_BYTES} byte, dapat ${identity.kid.length}`)
  }

  return { kind: RAW_DATA_KEY_KIND, handle: bytes, identity }
}

type ReadKey = { readonly key: Uint8Array; readonly identity: RecordKeyIdentity }

/**
 * Baca byte kunci + identitas dari bahan kunci.
 *
 * Bahan kunci yang tidak dikenal DITOLAK dengan pesan jelas, bukan ditebak: slot passkey/recovery
 * belum ada implementasinya, dan "menganggap" sebuah handle sebagai byte kunci adalah cara paling
 * halus untuk merusak data user.
 */
function readDataKey(material: SecureKeyMaterial): ReadKey {
  if (material.kind !== RAW_DATA_KEY_KIND) {
    throw new Error(`jenis bahan kunci "${material.kind}" belum didukung provider ini`)
  }

  const { handle, identity } = material as Partial<RawDataKeyMaterial>
  if (!(handle instanceof Uint8Array) || handle.length !== DATA_KEY_BYTES) {
    throw new Error('bahan kunci rusak: handle bukan byte kunci 32')
  }
  if (identity === undefined || identity.kid.length !== KID_BYTES) {
    throw new Error('bahan kunci rusak: identitas kunci (KID) tidak ada')
  }

  return { key: handle, identity }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index])
}

function aadOf(
  identity: RecordKeyIdentity,
  input: { recordId: string; hlc: string; deleted: boolean },
): Uint8Array {
  return encodeRecordAadV2({
    kid: identity.kid,
    userId: identity.userId,
    recordId: input.recordId,
    hlc: input.hlc,
    deleted: input.deleted,
  })
}

function sealV2(sodium: SodiumModule, input: SealRecordInput): string {
  const { key, identity } = readDataKey(input.dataKey)
  const plaintext = encode(input.plaintext)

  // Writer sudah memeriksa batas ini; di sini jaring pengaman, karena blob yang kelewat besar ditolak
  // server dan record-nya macet di outbox selamanya.
  if (plaintext.length > SEALED_RECORD_V2_MAX_PLAINTEXT_BYTES) {
    throw new RangeError('plaintext record melebihi batas blob v2')
  }

  const nonce = sodium.randombytes_buf(RECORD_V2_NONCE_BYTES)
  const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    sodium.pad(plaintext, RECORD_PAD_BLOCK_BYTES),
    aadOf(identity, input),
    null,
    nonce,
    key,
  )

  const blob = new Uint8Array(RECORD_V2_CIPHERTEXT_OFFSET + sealed.length)
  blob.set(encodeSealedBlobHeaderV2(identity.kid), 0)
  blob.set(nonce, RECORD_V2_NONCE_OFFSET)
  blob.set(sealed, RECORD_V2_CIPHERTEXT_OFFSET)

  return sodium.to_base64(blob, sodium.base64_variants.ORIGINAL)
}

function openV2(sodium: SodiumModule, input: OpenRecordInput): Uint8Array {
  const { key, identity } = readDataKey(input.dataKey)
  const raw = sodium.from_base64(input.blob, sodium.base64_variants.ORIGINAL)

  const header = parseSealedBlobHeader(raw)
  if (header === null) {
    throw new Error('blob tidak valid: bukan blob v2 atau terlalu pendek')
  }
  // KID di header bukan rahasia dan bukan bukti apa pun; pemeriksaan ini hanya memberi pesan yang
  // jelas sebelum AEAD. Yang menentukan tetap AAD (KID ikut di dalamnya).
  if (!sameBytes(header.kid, identity.kid)) {
    throw new Error('blob tidak bisa dibuka: kunci atau tujuan tidak cocok')
  }

  try {
    const padded = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      header.ciphertext,
      aadOf(identity, input),
      header.nonce,
      key,
    )

    return sodium.unpad(padded, RECORD_PAD_BLOCK_BYTES)
  } catch (error) {
    throw new Error('blob tidak bisa dibuka: kunci atau tujuan tidak cocok', { cause: error })
  }
}

/**
 * Provider kripto berbasis libsodium.
 *
 * `await` di sini bukan formalitas: libsodium WASM harus selesai dimuat sebelum satu pun fungsi
 * kripto bisa dipanggil. Karena itu pembuatannya asinkron - bukan karena menunggu jaringan.
 *
 * libsodium dimuat lewat pemuat bersama (`sodium.ts`) yang memakai `import()` DINAMIS: berkasnya
 * ~250 kB berisi WASM, dan menaruhnya di bundle awal membuat halaman login menunggu sesuatu yang baru
 * dibutuhkan setelah user punya kunci.
 */
export async function createSodiumCryptoProvider(): Promise<CryptoProvider> {
  const sodium = await loadSodium()

  return {
    async sealRecord(input: SealRecordInput): Promise<string> {
      return sealV2(sodium, input)
    },

    async openRecord(input: OpenRecordInput): Promise<string> {
      return decode(openV2(sodium, input))
    },
  }
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
