import { z } from 'zod'

import { uuidSchema } from './protocol.ts'
import { licensePlanSchema } from './purchase.ts'

/**
 * Token lisensi (ADR 15 + ADR 16, ARCHITECTURE.md §8).
 *
 * Bentuk wire: `<payload>.<signature>` - keduanya base64url tanpa padding. `payload` adalah JSON
 * `LicenseTokenPayload`; `signature` adalah tanda tangan Ed25519 (64 byte) atas BYTE string
 * `<payload>` (bukan atas JSON hasil parse), jadi verifikasi tidak bergantung pada urutan key.
 *
 * Token sengaja TIDAK memuat email atau data pribadi: ia hanya bukti "perangkat ini sudah
 * diaktivasi untuk lisensi X sampai `exp`". Ditandatangani server, diverifikasi app secara offline
 * dengan public key yang ditanam saat build, dan disegarkan lewat `POST /v1/license/refresh` saat
 * masa aktif hampir/sudah habis.
 *
 * v2 (ADR 16) menambah `plan` + `exp`; token v1 (sekali beli) tidak diterima lagi.
 */

export const LICENSE_TOKEN_VERSION = 2

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
    plan: licensePlanSchema,
    /** Akhir masa aktif, epoch detik. `null` = lifetime. */
    exp: z.number().int().positive().nullable(),
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

/** Panjang public key Ed25519 mentah dalam byte. */
export const DEVICE_SIGN_PUBLIC_KEY_BYTES = 32

/**
 * Base64 standar kanonik dari tepat 32 byte: 42 karakter bebas + satu karakter akhir yang 2 bit
 * terakhirnya nol (`AEIMQUYcgkosw048`) + `=`. Pola ini membedakan 32 byte dari 31/33 byte yang
 * sama-sama 44 karakter, dan menolak varian non-kanonik.
 */
const DEVICE_SIGN_PUBLIC_KEY_PATTERN = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/

/**
 * Public key Ed25519 perangkat (Device Sign Key, ADR 17) - base64 standar dari 32 byte mentah.
 * Dipakai server untuk memverifikasi challenge auth relay sync; private key-nya tidak pernah keluar
 * dari perangkat.
 */
export const deviceSignPublicKeySchema = z
  .string()
  .regex(DEVICE_SIGN_PUBLIC_KEY_PATTERN, 'public key Ed25519 harus base64 standar dari 32 byte')

/**
 * `POST /v1/license/token` - body OPSIONAL. Client lama (dan perangkat yang belum punya Device Sign
 * Key) mengirim tanpa body dan tetap mendapat token; perangkat itu hanya belum bisa memakai relay sync.
 */
export const licenseTokenRequestSchema = z
  .object({ deviceSignPk: deviceSignPublicKeySchema.optional() })
  .strict()

export type LicenseTokenRequest = z.infer<typeof licenseTokenRequestSchema>

/** `POST /v1/license/token` */
export const licenseTokenResultSchema = z.object({ token: licenseTokenSchema }).strict()

export type LicenseTokenResult = z.infer<typeof licenseTokenResultSchema>

/** `POST /v1/license/refresh` - token lama (bertanda tangan) sebagai bukti, tanpa sesi login. */
export const licenseRefreshInputSchema = z.object({ token: licenseTokenSchema }).strict()

export type LicenseRefreshInput = z.infer<typeof licenseRefreshInputSchema>

/** Pecah token jadi bagian yang ditandatangani dan tanda tangannya. `null` = bentuknya salah. */
export function splitLicenseToken(
  token: string,
): { readonly signed: string; readonly signature: string } | null {
  if (!licenseTokenSchema.safeParse(token).success) return null
  const [signed, signature] = token.split('.')
  if (signed === undefined || signature === undefined) return null
  return { signed, signature }
}
