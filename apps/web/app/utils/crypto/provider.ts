import type {
  CryptoProvider,
  OpenRecordInput,
  SealRecordInput,
  SecureKeyMaterial,
} from '@improve-personal/core'

import { openWithKey, sealWithKey } from './envelope'
import { loadSodium } from './sodium'

/**
 * `CryptoProvider` web: XChaCha20-Poly1305 lewat libsodium (ARCHITECTURE §5 & §6, ADR 4).
 *
 * Catatan tempat: §5 menaruh implementasi ini di `packages/crypto`. Untuk sekarang ia hidup di
 * `apps/web` (keputusan sadar: lebih cepat kelihatan hasilnya), dengan konsekuensi yang harus dibayar
 * saat mobile (T23) mulai: logika kunci ini harus dipindah ke paket bersama, JANGAN disalin.
 * Yang tidak boleh dikompromikan adalah perilakunya - karena itu kontraknya tetap `CryptoProvider`
 * dari core, bukan interface buatan sendiri.
 *
 * Bentuk `blob` (sama untuk web & native, supaya record bisa dibuka di perangkat lain nanti):
 *
 *   base64( nonce[24] || ciphertext||tag )
 *
 * - XChaCha20-Poly1305 IETF: nonce 24 byte, jadi nonce acak per record aman tanpa penghitung.
 * - AAD = `recordId`: blob tidak bisa dipindah ke record lain - dipindah = gagal dibuka, bukan
 *   terbuka dengan isi yang salah.
 * - Base64 standar (bukan URL-safe) supaya `blob` aman disimpan sebagai `text` di IndexedDB dan
 *   dikirim sebagai JSON ke server.
 * - DILARANG ada kunci, nonce, atau plaintext di log. Fungsi ini tidak mencatat apa pun.
 */

/** Jenis bahan kunci yang dipahami provider ini. Slot lain (passkey/recovery) belum diimplementasi. */
export const RAW_DATA_KEY_KIND = 'raw-32'

/** Panjang kunci data (byte) - XChaCha20-Poly1305 memakai kunci 32 byte. */
const DATA_KEY_BYTES = 32

/**
 * Bahan kunci berupa byte mentah.
 *
 * Dipakai setelah unlock (kunci utama sudah dibuka di memori) dan di test. Sengaja BUKAN bentuk yang
 * disimpan di perangkat: `SecureKeyStore` yang menyimpan handle non-extractable, dan kunci utama
 * tidak pernah ditulis mentah ke disk.
 */
export type RawDataKeyMaterial = SecureKeyMaterial & { readonly kind: typeof RAW_DATA_KEY_KIND }

/** Bungkus byte kunci jadi bahan kunci yang bisa dipakai `CryptoProvider`. */
export function rawDataKeyMaterial(bytes: Uint8Array): RawDataKeyMaterial {
  if (bytes.length !== DATA_KEY_BYTES) {
    throw new Error(`kunci data harus ${DATA_KEY_BYTES} byte, dapat ${bytes.length}`)
  }

  return { kind: RAW_DATA_KEY_KIND, handle: bytes }
}

/**
 * Baca byte kunci dari bahan kunci.
 *
 * Bahan kunci yang tidak dikenal DITOLAK dengan pesan jelas, bukan ditebak: slot passkey/recovery
 * belum ada implementasinya, dan "menganggap" sebuah handle sebagai byte kunci adalah cara paling
 * halus untuk merusak data user.
 */
function readDataKey(material: SecureKeyMaterial): Uint8Array {
  if (material.kind !== RAW_DATA_KEY_KIND) {
    throw new Error(`jenis bahan kunci "${material.kind}" belum didukung provider ini`)
  }

  const handle = material.handle
  if (!(handle instanceof Uint8Array) || handle.length !== DATA_KEY_BYTES) {
    throw new Error('bahan kunci rusak: handle bukan byte kunci 32')
  }

  return handle
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
      // AAD = `recordId`: blob terikat ke record-nya (ADR 4), dan bentuknya sama dengan envelope kunci
      // lain - lihat `envelope.ts`.
      return sealWithKey(
        sodium,
        readDataKey(input.dataKey),
        input.recordId,
        encode(input.plaintext),
      )
    },

    async openRecord(input: OpenRecordInput): Promise<string> {
      return decode(openWithKey(sodium, readDataKey(input.dataKey), input.recordId, input.blob))
    },
  }
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
