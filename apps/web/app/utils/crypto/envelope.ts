import type { SodiumModule } from './sodium'

/**
 * Bentuk `blob` untuk semua envelope kunci (ARCHITECTURE §7).
 *
 *   base64( nonce[24] || ciphertext||tag )
 *
 * Panjang nonce 24 byte: XChaCha20-Poly1305 memakai nonce besar, jadi nonce acak per envelope aman
 * tanpa penghitung - dan itu yang membuat envelope tidak perlu menyimpan state apa pun.
 *
 * AAD (`additionalData`) di sini adalah **nama tujuan**, bukan data user. Gunanya memisahkan domain:
 * blob record tidak bisa dipakai sebagai envelope kunci, dan envelope recovery tidak bisa dipakai
 * sebagai envelope passkey, walau ketiganya memakai algoritma dan bahkan kunci yang sama. Tanpa itu,
 * "memindahkan" blob antar tujuan akan berhasil dan tidak ada yang tahu.
 */

/** Panjang nonce XChaCha20-Poly1305 IETF (byte). */
const NONCE_BYTES = 24

/** Awalan AAD. Tujuan konkretnya ditambahkan pemanggil (mis. `'recovery'`). */
export const AAD_PREFIX = 'ip-envelope:'

/**
 * Segel `plaintext` dengan kunci ini.
 *
 * Sengaja tidak menangkap error enkripsi: kegagalan mengenkripsi berarti ada yang salah dengan kunci
 * atau argumennya, dan itu harus terlihat - bukan dikembalikan sebagai blob kosong.
 */
export function sealWithKey(
  sodium: SodiumModule,
  key: Uint8Array,
  aad: string,
  plaintext: Uint8Array,
): string {
  const nonce = sodium.randombytes_buf(NONCE_BYTES)

  const sealed = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, aad, null, nonce, key)

  const combined = new Uint8Array(nonce.length + sealed.length)
  combined.set(nonce)
  combined.set(sealed, nonce.length)

  return sodium.to_base64(combined, sodium.base64_variants.ORIGINAL)
}

/**
 * Buka blob yang disegel `sealWithKey`.
 *
 * Kegagalan autentikasi (kunci salah, AAD berbeda, atau blob diubah) dilempar sebagai `Error` biasa
 * dengan pesan kita sendiri: libsodium melempar nilai yang bentuknya tidak dijamin `Error`, dan pesan
 * internalnya tidak perlu bocor ke pemanggil. Yang penting: TIDAK dikembalikan sebagai byte kosong -
 * data yang tidak bisa dibuka harus terlihat.
 */
export function openWithKey(
  sodium: SodiumModule,
  key: Uint8Array,
  aad: string,
  blob: string,
): Uint8Array {
  const raw = sodium.from_base64(blob, sodium.base64_variants.ORIGINAL)

  if (raw.length <= NONCE_BYTES) {
    throw new Error('blob tidak valid: terlalu pendek untuk memuat nonce')
  }

  const nonce = raw.subarray(0, NONCE_BYTES)
  const ciphertext = raw.subarray(NONCE_BYTES)

  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, aad, nonce, key)
  } catch (error) {
    throw new Error('blob tidak bisa dibuka: kunci atau tujuan tidak cocok', { cause: error })
  }
}

/** AAD untuk tujuan tertentu - dipakai semua modul supaya penulisannya konsisten. */
export function aadFor(purpose: string): string {
  return `${AAD_PREFIX}${purpose}`
}
