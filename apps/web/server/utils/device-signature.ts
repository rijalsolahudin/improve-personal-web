import { createPublicKey, verify, type KeyObject } from 'node:crypto'

import {
  DEVICE_SIGN_PUBLIC_KEY_BYTES,
  LICENSE_SIGNATURE_BYTES,
  isBase64,
} from '@improve-personal/contracts'

/**
 * Verifikasi tanda tangan Ed25519 perangkat (Device Sign Key, ADR 17) - `node:crypto`, sama dengan
 * yang dipakai server untuk token lisensi (`license-signing.ts`). Hanya VERIFIKASI: server tidak
 * pernah memegang private key perangkat.
 */

/** Prefix DER SPKI untuk public key Ed25519 (RFC 8410); 32 byte kunci mentah menyusul di belakangnya. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

function publicKeyFromRaw(publicKeyBase64: string): KeyObject | null {
  if (!isBase64(publicKeyBase64)) return null

  const raw = Buffer.from(publicKeyBase64, 'base64')
  if (raw.length !== DEVICE_SIGN_PUBLIC_KEY_BYTES) return null

  try {
    return createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
      format: 'der',
      type: 'spki',
    })
  } catch {
    return null
  }
}

/**
 * `true` hanya kalau `signatureBase64` adalah tanda tangan sah atas `message` (UTF-8) oleh kunci
 * `publicKeyBase64`. Input rusak (base64 salah, panjang salah, kunci tidak valid) = `false`, tidak
 * pernah melempar: pemanggil memperlakukan semua kegagalan sama (`unauthenticated`).
 */
export function verifyDeviceSignature(
  publicKeyBase64: string,
  message: string,
  signatureBase64: string,
): boolean {
  if (!isBase64(signatureBase64)) return false

  const signature = Buffer.from(signatureBase64, 'base64')
  if (signature.length !== LICENSE_SIGNATURE_BYTES) return false

  const publicKey = publicKeyFromRaw(publicKeyBase64)
  if (publicKey === null) return false

  return verify(null, Buffer.from(message, 'utf8'), publicKey, signature)
}
