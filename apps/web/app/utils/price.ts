import {
  DEFAULT_LICENSE_PLAN,
  LICENSE_PLANS,
  licensePlanSchema,
  type LicensePlanId,
} from '@improve-personal/contracts'

/** `99000` -> `Rp99.000` (gaya penulisan harga di UI: tanpa spasi, titik ribuan). */
export function formatRupiah(amount: number): string {
  return `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(amount)}`
}

/** Harga satu paket untuk ditampilkan. Angkanya dari kontrak, sama dengan yang ditagih server. */
export function planPriceLabel(plan: LicensePlanId): string {
  return formatRupiah(LICENSE_PLANS[plan].priceIdr)
}

const MONTHS_PER_YEAR = 12

/** Hemat paket tahunan dibanding 12x bulanan, dibulatkan ke persen (ADR 16: 57). */
export const YEARLY_SAVING_PERCENT = Math.round(
  (1 - LICENSE_PLANS.yearly.priceIdr / (LICENSE_PLANS.monthly.priceIdr * MONTHS_PER_YEAR)) * 100,
)

/** Harga tahunan dibagi 12, untuk copy "sekitar Rp8.250 per bulan". */
export const YEARLY_PER_MONTH_LABEL = formatRupiah(
  Math.round(LICENSE_PLANS.yearly.priceIdr / MONTHS_PER_YEAR),
)

/** `?plan=` dari URL -> paket yang dikenal; selain itu paket default (tahunan). */
export function planFromQuery(value: unknown): LicensePlanId {
  const parsed = licensePlanSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_LICENSE_PLAN
}

/** Link ke halaman beli dengan paket terpilih. */
export function purchasePathFor(plan: LicensePlanId): string {
  return `${PURCHASE_PATH}?plan=${plan}`
}
