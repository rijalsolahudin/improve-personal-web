import { z } from 'zod'

import { emailSchema } from './auth.ts'

/**
 * Pembelian lisensi sekali beli (ADR 15, PRD F15 "Pembelian & Lisensi").
 *
 * Satu harga untuk semua platform. Angkanya di kontrak supaya halaman beli dan server tidak bisa
 * menampilkan/menagih angka yang berbeda; server tetap yang menentukan nominal tagihan (lihat
 * `NUXT_PRICE_OVERRIDE_IDR` untuk uji di non-production).
 */
export const LICENSE_PRICE_IDR = 99_000

export const BUYER_NAME_MAX_LENGTH = 80

/** Nomor HP/WA: Mayar mewajibkannya. Hanya diteruskan ke Mayar, tidak disimpan server. */
export const buyerMobileSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^(\+62|62|0)8\d{7,12}$/, 'nomor HP Indonesia tidak valid'))

/** `POST /v1/purchase/checkout` - publik, tanpa sesi. */
export const checkoutInputSchema = z
  .object({
    name: z.string().trim().min(1).max(BUYER_NAME_MAX_LENGTH),
    email: emailSchema,
    mobile: buyerMobileSchema,
  })
  .strict()

export type CheckoutInput = z.infer<typeof checkoutInputSchema>

export const checkoutResultSchema = z
  .object({
    /** Halaman bayar Mayar. Selalu https. */
    paymentUrl: z.url({ protocol: /^https$/ }),
  })
  .strict()

export type CheckoutResult = z.infer<typeof checkoutResultSchema>
