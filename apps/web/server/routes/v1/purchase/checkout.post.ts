import { checkoutInputSchema } from '@improve-personal/contracts'

import { serviceContext } from '../../../services/context'
import { startCheckout } from '../../../services/purchase'

/**
 * `POST /v1/purchase/checkout` - mulai pembelian lisensi (ADR 15 + ADR 16). Publik: pembeli belum
 * login.
 *
 * Klien hanya memilih `plan`; nominal tidak pernah datang dari klien - server yang menentukan
 * (`licensePriceIdr`). Respons berisi
 * link bayar Mayar; klien berpindah ke sana dengan navigasi penuh.
 */
export default defineApiHandler(async (event) => {
  const body = await readValidatedBody(event, (value) => checkoutInputSchema.parse(value))
  const ctx = serviceContext(event)

  setHeader(event, 'cache-control', 'no-store')

  const paymentUrl = await startCheckout(ctx, { ...body, origin: getRequestURL(event).origin })
  return { paymentUrl }
})
