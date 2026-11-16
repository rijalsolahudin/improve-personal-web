import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto'

import {
  licenseTokenPayloadSchema,
  splitLicenseToken,
  type LicenseTokenPayload,
} from '@improve-personal/contracts'

/**
 * Penanda tangan token lisensi (ADR 15, ARCHITECTURE.md §8) - Ed25519 dari `node:crypto`.
 *
 * Kunci privat disimpan di env sebagai SEED 32 byte (base64), bukan PEM: satu baris, gampang disalin
 * ke secret manager, dan public key-nya bisa diturunkan ulang kapan saja. Public key itulah yang
 * ditanam di build app (`runtimeConfig.public.licensePublicKey`) untuk verifikasi offline.
 *
 * Token tidak memuat data pribadi; lihat `packages/contracts/src/license.ts`.
 */

/** Ed25519 seed = 32 byte. */
export const LICENSE_SEED_BYTES = 32

/** Prefix DER PKCS#8 untuk kunci privat Ed25519 (RFC 8410); seed 32 byte menyusul di belakangnya. */
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

export type LicenseSigner = {
  /** Public key mentah 32 byte, base64 - nilai yang harus sama dengan yang ditanam di app. */
  readonly publicKey: string
  readonly sign: (payload: LicenseTokenPayload) => string
  /** Payload token yang tanda tangannya sah dan bentuknya sesuai versi sekarang; selain itu `null`. */
  readonly verify: (token: string) => LicenseTokenPayload | null
}

/** Seed base64 -> kunci privat. Melempar kalau bukan tepat 32 byte (pesan tanpa nilai kunci). */
function privateKeyFromSeed(seedBase64: string): KeyObject {
  const seed = Buffer.from(seedBase64, 'base64')
  if (seed.length !== LICENSE_SEED_BYTES || seed.toString('base64') !== seedBase64.trim()) {
    throw new Error('kunci lisensi harus base64 dari 32 byte')
  }

  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  })
}

/** Public key mentah (32 byte, base64). */
function rawPublicKey(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: 'jwk' })
  if (typeof jwk.x !== 'string') throw new Error('public key lisensi tidak bisa diturunkan')
  return Buffer.from(jwk.x, 'base64url').toString('base64')
}

export function createLicenseSigner(seedBase64: string): LicenseSigner {
  const privateKey = privateKeyFromSeed(seedBase64)
  const publicKey = createPublicKey(privateKey)

  return {
    publicKey: rawPublicKey(publicKey),
    sign(payload) {
      const signed = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
      // Ed25519 di node: algoritma `null` (hash sudah bagian dari skema tanda tangannya).
      const signature = sign(null, Buffer.from(signed, 'utf8'), privateKey).toString('base64url')
      return `${signed}.${signature}`
    },
    verify(token) {
      const parts = splitLicenseToken(token)
      if (parts === null) return null
      const signature = Buffer.from(parts.signature, 'base64url')
      if (!verify(null, Buffer.from(parts.signed, 'utf8'), publicKey, signature)) return null

      try {
        const json: unknown = JSON.parse(Buffer.from(parts.signed, 'base64url').toString('utf8'))
        const parsed = licenseTokenPayloadSchema.safeParse(json)
        return parsed.success ? parsed.data : null
      } catch {
        return null
      }
    },
  }
}

/** `true` kalau seed valid dan public key turunannya sama dengan yang dikonfigurasi untuk app. */
export function isLicenseKeyPair(seedBase64: string, publicKeyBase64: string): boolean {
  try {
    return createLicenseSigner(seedBase64).publicKey === publicKeyBase64.trim()
  } catch {
    return false
  }
}
