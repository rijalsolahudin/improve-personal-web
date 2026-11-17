import { z } from 'zod'

import { emailSchema } from './auth.ts'

/**
 * Paket lisensi prabayar (ADR 16, PRD F15 "Pembelian & Lisensi").
 *
 * Satu sumber harga & masa aktif untuk semua platform, supaya halaman beli, landing, dan server tidak
 * bisa menampilkan/menagih angka yang berbeda. Server tetap yang menentukan nominal tagihan dari
 * `plan` (lihat `NUXT_PRICE_OVERRIDE_IDR` untuk uji di non-production).
 */
export const LICENSE_PLAN_IDS = ['monthly', 'yearly', 'lifetime'] as const

export type LicensePlanId = (typeof LICENSE_PLAN_IDS)[number]

export const licensePlanSchema = z.enum(LICENSE_PLAN_IDS)

export type LicensePlan = {
  readonly priceIdr: number
  /** Masa aktif yang ditambahkan per pembelian. `null` = selamanya. */
  readonly durationDays: number | null
}

export const LICENSE_PLANS: Readonly<Record<LicensePlanId, LicensePlan>> = {
  monthly: { priceIdr: 19_000, durationDays: 30 },
  yearly: { priceIdr: 99_000, durationDays: 365 },
  lifetime: { priceIdr: 249_000, durationDays: null },
}

/** Paket yang dipilih di halaman beli bila tidak ada pilihan lain (paket utama). */
export const DEFAULT_LICENSE_PLAN: LicensePlanId = 'yearly'

export const BUYER_NAME_MAX_LENGTH = 80

/**
 * Nomor HP/WA: Mayar mewajibkannya. Hanya diteruskan ke Mayar, tidak disimpan server.
 *
 * Form web mengirim E.164 (`+<kode negara><nomor>`, 8-15 digit) dari pemilih kode negara. Format
 * Indonesia lama (`08…`, `628…`) tetap diterima untuk klien yang belum diperbarui.
 */
export const buyerMobileSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(
    z.string().regex(/^(?:(?:\+62|62|0)8\d{7,12}|\+(?!62)[1-9]\d{7,14})$/, 'nomor HP tidak valid'),
  )

/** `POST /v1/purchase/checkout` - publik, tanpa sesi. */
export const checkoutInputSchema = z
  .object({
    name: z.string().trim().min(1).max(BUYER_NAME_MAX_LENGTH),
    email: emailSchema,
    mobile: buyerMobileSchema,
    plan: licensePlanSchema,
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
