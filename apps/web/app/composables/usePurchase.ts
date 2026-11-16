import {
  apiDataEnvelopeSchema,
  apiErrorBodySchema,
  checkoutInputSchema,
  checkoutResultSchema,
  type LicensePlanId,
} from '@improve-personal/contracts'

import { planFromQuery } from '~/utils/price'

/**
 * Form beli lisensi (ADR 15 + ADR 16): paket, nama, email, nomor WA -> `POST /v1/purchase/checkout`
 * -> halaman bayar Mayar. Hanya `plan` yang dikirim; nominal ditentukan server.
 *
 * Paket awal diambil dari `?plan=` (tombol paket di landing), selain itu paket default (tahunan).
 *
 * Validasi di client memakai schema kontrak yang SAMA dengan server, jadi pesan field muncul tanpa
 * request; server tetap memvalidasi ulang.
 */

export type PurchaseField = 'name' | 'email' | 'mobile'

/** Kunci i18n `purchase.error.*`. */
export type PurchaseError = 'rateLimited' | 'unavailable' | 'generic'

const CHECKOUT_PATH = '/v1/purchase/checkout'

const checkoutEnvelopeSchema = apiDataEnvelopeSchema(checkoutResultSchema)

function purchaseErrorOf(caught: unknown): PurchaseError {
  if (typeof caught !== 'object' || caught === null) return 'generic'
  const { status, data } = caught as { status?: unknown; data?: unknown }
  if (typeof status !== 'number') return 'unavailable'

  const parsed = apiErrorBodySchema.safeParse(data)
  return parsed.success && parsed.data.error.code === 'RATE_LIMITED' ? 'rateLimited' : 'generic'
}

export function usePurchase() {
  const plan = ref<LicensePlanId>(planFromQuery(useRoute().query.plan))
  const name = ref('')
  const email = ref('')
  const mobile = ref('')
  const fieldErrors = ref<PurchaseField[]>([])
  const error = ref<PurchaseError | null>(null)
  const isSubmitting = ref(false)

  async function submit(): Promise<void> {
    if (isSubmitting.value) return
    error.value = null

    const input = checkoutInputSchema.safeParse({
      name: name.value,
      email: email.value,
      mobile: mobile.value,
      plan: plan.value,
    })
    if (!input.success) {
      fieldErrors.value = input.error.issues
        .map((issue) => issue.path[0])
        .filter((field): field is PurchaseField =>
          ['name', 'email', 'mobile'].includes(String(field)),
        )
      return
    }
    fieldErrors.value = []

    isSubmitting.value = true
    try {
      const response = await $fetch(CHECKOUT_PATH, { method: 'POST', body: input.data })
      const parsed = checkoutEnvelopeSchema.safeParse(response)
      if (!parsed.success) {
        error.value = 'generic'
        return
      }
      // Navigasi PENUH ke Mayar (domain lain); link sudah dijamin https oleh kontrak.
      window.location.assign(parsed.data.data.paymentUrl)
    } catch (caught) {
      error.value = purchaseErrorOf(caught)
    } finally {
      isSubmitting.value = false
    }
  }

  return { plan, name, email, mobile, fieldErrors, error, isSubmitting, submit }
}
