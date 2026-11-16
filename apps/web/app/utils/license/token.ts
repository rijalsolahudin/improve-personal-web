import {
  LICENSE_SIGNATURE_BYTES,
  licenseTokenPayloadSchema,
  splitLicenseToken,
  type LicenseTokenPayload,
} from '@improve-personal/contracts'

import { TECH_IDENTITY } from '#shared/tech-identity'

/**
 * Token lisensi di perangkat (ADR 15, ARCHITECTURE.md §8): verifikasi OFFLINE + simpan lokal.
 *
 * Verifikasi memakai WebCrypto Ed25519, bukan libsodium: gerbang `/app` berjalan sebelum halaman apa
 * pun, dan libsodium (~250 KB WASM) tidak boleh ikut ke jalur itu. Public key ditanam saat build
 * (`runtimeConfig.public.licensePublicKey`); token dari environment lain otomatis tidak lolos.
 *
 * Token disimpan di `localStorage`, bukan Keychain/IndexedDB terenkripsi: isinya bukan rahasia
 * (tidak memuat email, tidak memberi akses ke server) dan keasliannya dijamin tanda tangan, bukan
 * kerahasiaan. Memalsukan token butuh kunci privat server.
 */

export const LICENSE_STORAGE_KEY = `${TECH_IDENTITY.storagePrefix}license`

const ED25519_PUBLIC_KEY_BYTES = 32

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/**
 * Payload token kalau tanda tangannya sah untuk `publicKeyBase64`, selain itu `null`.
 *
 * Tidak pernah melempar: token rusak, public key kosong, atau browser tanpa Ed25519 semuanya berarti
 * "tidak berlisensi" (fail-closed) - user diarahkan aktivasi ulang, bukan melihat layar error.
 */
export async function verifyLicenseToken(
  token: string,
  publicKeyBase64: string,
): Promise<LicenseTokenPayload | null> {
  try {
    const parts = splitLicenseToken(token)
    if (parts === null) return null

    const publicKey = base64UrlToBytes(publicKeyBase64)
    const signature = base64UrlToBytes(parts.signature)
    if (publicKey.length !== ED25519_PUBLIC_KEY_BYTES) return null
    if (signature.length !== LICENSE_SIGNATURE_BYTES) return null

    const key = await crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, [
      'verify',
    ])
    const isValid = await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      signature,
      new TextEncoder().encode(parts.signed),
    )
    if (!isValid) return null

    const json = new TextDecoder().decode(base64UrlToBytes(parts.signed))
    const parsed = licenseTokenPayloadSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Token tersimpan, atau `null`. Storage yang diblokir (mode privat) dianggap kosong. */
export function readStoredLicenseToken(storage: Storage = localStorage): string | null {
  try {
    return storage.getItem(LICENSE_STORAGE_KEY)
  } catch {
    return null
  }
}

/** `false` kalau storage menolak (kuota/diblokir): lisensi tetap berlaku untuk tab ini saja. */
export function storeLicenseToken(token: string, storage: Storage = localStorage): boolean {
  try {
    storage.setItem(LICENSE_STORAGE_KEY, token)
    return true
  } catch {
    return false
  }
}
