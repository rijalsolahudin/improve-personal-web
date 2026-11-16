import {
  apiDataEnvelopeSchema,
  apiErrorBodySchema,
  checkoutInputSchema,
  checkoutResultSchema,
} from '@improve-personal/contracts'

/**
 * Form beli lisensi (ADR 15): nama, email, nomor WA -> `POST /v1/purchase/checkout` -> halaman bayar
 * Mayar. Nominal tidak dikirim dari sini; server yang menentukan.
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

  return { name, email, mobile, fieldErrors, error, isSubmitting, submit }
}
