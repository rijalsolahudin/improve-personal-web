import { KID_BYTES, KID_KDF_CONTEXT, KID_KDF_SUBKEY_ID } from '@improve-personal/contracts'

import { loadSodium, type SodiumModule } from './sodium'
import { rawDataKeyMaterial, type RawDataKeyMaterial } from './provider'

/**
 * Kunci PERANGKAT & turunannya - hanya untuk menyegel salinan lokal.
 *
 *   MK (32 byte acak, dibuat per perangkat)
 *    └─ KDF subkey 'data'  ->  Data Key  ->  enkripsi `record` di IndexedDB/SQLite
 *
 * Data yang dikirim ke server TIDAK memakai kunci ini: server menyegel `payload` dengan kuncinya
 * sendiri dari env (`server/utils/record-crypto.ts`). Konsekuensi yang disengaja: MK hilang = salinan
 * lokal tidak terbaca, tapi data tetap bisa dipulihkan dengan pull ulang dari server. Tidak ada
 * passkey/recovery key yang perlu dipulihkan.
 *
 * Aturan yang dipegang di modul ini:
 * - Kunci utama TIDAK PERNAH ditulis ke disk dalam bentuk polos, tidak pernah di-log, dan tidak pernah
 *   dikirim ke mana pun. Yang ada di disk hanya bungkusnya (WebCrypto non-extractable).
 * - Turunan memakai KDF libsodium (`crypto_kdf_derive_from_key`, BLAKE2b ber-konteks), bukan hash
 *   biasa: konteks 8 karakter + `subkey_id` memisahkan pemakaian.
 */

/** Panjang kunci utama (byte). */
export const MASTER_KEY_BYTES = 32

/** Panjang kunci data (byte) - sama dengan yang dibutuhkan XChaCha20-Poly1305. */
export const DATA_KEY_BYTES = 32

/**
 * Konteks KDF - WAJIB tepat 8 karakter (`crypto_kdf_CONTEXTBYTES`).
 *
 * Nilainya ikut menentukan hasil turunan: mengubahnya berarti semua data lama tidak bisa dibuka lagi.
 * Jadi ini konstanta protokol, bukan konstanta bebas.
 */
const DATA_KEY_CONTEXT = 'ip-data-'

/** `subkey_id` untuk data key. Id lain disediakan untuk pemakaian berikutnya (mis. kunci manifest). */
const DATA_KEY_ID = 1

/** Kunci utama baru: 32 byte acak dari CSPRNG. */
export function createMasterKey(sodium: SodiumModule): Uint8Array {
  return sodium.randombytes_buf(MASTER_KEY_BYTES)
}

/**
 * Turunkan kunci data dari kunci utama.
 *
 * Hasilnya berbentuk bahan kunci yang siap dipakai `CryptoProvider.sealRecord`/`openRecord`, sehingga
 * tidak ada tempat lain yang perlu tahu bagaimana kunci data dibuat.
 */
export function deriveDataKey(
  sodium: SodiumModule,
  masterKey: Uint8Array,
  userId: string,
): RawDataKeyMaterial {
  assertMasterKey(masterKey)

  const derived = sodium.crypto_kdf_derive_from_key(
    DATA_KEY_BYTES,
    DATA_KEY_ID,
    DATA_KEY_CONTEXT,
    masterKey,
  )

  return rawDataKeyMaterial(derived, { kid: deriveKid(sodium, masterKey), userId })
}

/**
 * KID lokal: fingerprint 16 byte turunan kunci perangkat.
 *
 * Hanya dipakai sebagai bagian AAD blob LOKAL - tidak pernah dikirim ke server dan tidak lagi menjadi
 * identitas akun. Deterministik untuk kunci yang sama, jadi blob lama tetap bisa dibuka setelah reload.
 */
export function deriveKid(sodium: SodiumModule, masterKey: Uint8Array): Uint8Array {
  assertMasterKey(masterKey)

  return sodium.crypto_kdf_derive_from_key(KID_BYTES, KID_KDF_SUBKEY_ID, KID_KDF_CONTEXT, masterKey)
}

/**
 * Kosongkan isi kunci di memori.
 *
 * Bukan jaminan (salinan lain bisa ada di GC/register), tapi mengurangi jendela waktu kunci hidup
 * setelah dipakai. Dipanggil setelah kunci data diturunkan, bukan setelah dipakai sekali saja.
 */
export function zeroKey(bytes: Uint8Array): void {
  bytes.fill(0)
}

export function assertMasterKey(bytes: Uint8Array): void {
  if (bytes.length !== MASTER_KEY_BYTES) {
    throw new Error(`kunci utama harus ${MASTER_KEY_BYTES} byte, dapat ${bytes.length}`)
  }
}

/** Muat libsodium lalu siapkan turunan - dipakai pemanggil yang tidak mau mengurus modul sodium. */
export async function deriveDataKeyFromMaster(
  masterKey: Uint8Array,
  userId: string,
): Promise<RawDataKeyMaterial> {
  return deriveDataKey(await loadSodium(), masterKey, userId)
}
