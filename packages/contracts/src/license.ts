import { z } from 'zod'

import { uuidSchema } from './protocol.ts'

/**
 * Token lisensi (ADR 15, ARCHITECTURE.md §8).
 *
 * Bentuk wire: `<payload>.<signature>` - keduanya base64url tanpa padding. `payload` adalah JSON
 * `LicenseTokenPayload`; `signature` adalah tanda tangan Ed25519 (64 byte) atas BYTE string
 * `<payload>` (bukan atas JSON hasil parse), jadi verifikasi tidak bergantung pada urutan key.
 *
 * Token sengaja TIDAK memuat email atau data pribadi: ia hanya bukti "perangkat ini sudah
 * diaktivasi untuk lisensi X". Ditandatangani server sekali, diverifikasi app secara offline dengan
 * public key yang ditanam saat build.
 */

export const LICENSE_TOKEN_VERSION = 1

export const LICENSE_EDITIONS = ['standard'] as const

export type LicenseEdition = (typeof LICENSE_EDITIONS)[number]

/** Batas panjang token di penyimpanan/wire; payload kecil + tanda tangan 64 byte jauh di bawahnya. */
export const LICENSE_TOKEN_MAX_LENGTH = 1024

/** Panjang tanda tangan Ed25519 dalam byte. */
export const LICENSE_SIGNATURE_BYTES = 64

export const licenseTokenPayloadSchema = z
  .object({
    v: z.literal(LICENSE_TOKEN_VERSION),
    /** Id lisensi (baris `licenses`). */
    lid: uuidSchema,
    /** Id perangkat yang diaktivasi (baris `devices`). */
    did: uuidSchema,
    /** Waktu terbit, epoch detik. */
    iat: z.number().int().positive(),
    ed: z.enum(LICENSE_EDITIONS),
  })
  .strict()

export type LicenseTokenPayload = z.infer<typeof licenseTokenPayloadSchema>

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

export const licenseTokenSchema = z
  .string()
  .max(LICENSE_TOKEN_MAX_LENGTH)
  .refine((value) => {
    const parts = value.split('.')
    return parts.length === 2 && parts.every((part) => BASE64URL_PATTERN.test(part))
  }, 'token lisensi harus `<payload>.<signature>` base64url')

/** `POST /v1/license/token` */
export const licenseTokenResultSchema = z.object({ token: licenseTokenSchema }).strict()

export type LicenseTokenResult = z.infer<typeof licenseTokenResultSchema>

/** Pecah token jadi bagian yang ditandatangani dan tanda tangannya. `null` = bentuknya salah. */
export function splitLicenseToken(
  token: string,
): { readonly signed: string; readonly signature: string } | null {
  if (!licenseTokenSchema.safeParse(token).success) return null
  const [signed, signature] = token.split('.')
  if (signed === undefined || signature === undefined) return null
  return { signed, signature }
}
