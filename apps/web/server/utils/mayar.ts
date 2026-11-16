/**
 * Klien tipis Mayar (https://docs.mayar.id) - pola yang sama dengan Ergonio & konveksiin.
 *
 * Modul ini tidak membaca env sendiri (konfigurasi disuntik pemanggil) dan `fetch` bisa diganti,
 * jadi bisa diuji tanpa jaringan dan tanpa API key sungguhan.
 *
 * Mayar hanya punya satu host dan HANYA meneruskan `description` pembayaran ke webhook (tanpa
 * metadata). Karena itu tujuan webhook ditulis sebagai tag di ujung description,
 * `[wh:product=<produk>;env=<env>]`, yang dibaca webhook-gateway untuk meneruskan ke app &
 * environment yang benar. Produk (`NUXT_MAYAR_PRODUCT`) harus sama dengan kunci yang terdaftar di
 * gateway.
 */

export const MAYAR_PAYMENT_ENDPOINT = 'https://api.mayar.id/hl/v1/payment/create'

export const DEFAULT_MAYAR_PRODUCT = 'improve-personal'

export const DEFAULT_MAYAR_ENVIRONMENT = 'production'

/** Batas panjang potongan body error Mayar yang boleh masuk log (tanpa data pembeli). */
const ERROR_BODY_LOG_LIMIT = 300

/** Slug huruf kecil (a-z, 0-9, strip; maks 20) supaya tidak pernah merusak sintaks tag. */
function toGatewaySlug(value: unknown, fallback: string): string {
  const slug = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
    .replace(/-+$/g, '')
  return slug || fallback
}

export function normalizeMayarProduct(value: unknown): string {
  return toGatewaySlug(value, DEFAULT_MAYAR_PRODUCT)
}

export function normalizeMayarEnvironment(value: unknown): string {
  return toGatewaySlug(value, DEFAULT_MAYAR_ENVIRONMENT)
}

export type MayarGatewayRoute = {
  readonly product: string
  readonly environment: string
}

export function mayarGatewayTag(route: MayarGatewayRoute): string {
  return `[wh:product=${route.product};env=${route.environment}]`
}

export type CreateMayarPaymentInput = {
  readonly apiKey: string
  readonly name: string
  readonly email: string
  readonly mobile: string
  readonly amount: number
  readonly redirectUrl: string
  /** Sudah memuat tag gateway di ujungnya (`mayarGatewayTag`). */
  readonly description: string
  readonly expiredAt: Date
}

export type MayarPayment = { readonly mayarId: string; readonly link: string }

export type MayarFetch = (input: string, init: RequestInit) => Promise<Response>

/** Mayar menjawab non-2xx. `body` dipotong dan hanya untuk log. */
export class MayarApiError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string) {
    super(`Mayar payment create gagal (${status})`)
    this.name = 'MayarApiError'
    this.status = status
    this.body = body
  }
}

function mayarIdOf(data: Record<string, unknown>): string {
  const id = data.transactionId ?? data.transaction_id ?? data.id
  return typeof id === 'string' ? id : ''
}

/** Buat payment request sekali bayar. Melempar untuk kegagalan transport/auth/respons tak dikenal. */
export async function createMayarPayment(
  input: CreateMayarPaymentInput,
  request: MayarFetch = fetch,
): Promise<MayarPayment> {
  const response = await request(MAYAR_PAYMENT_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      mobile: input.mobile,
      amount: input.amount,
      redirectUrl: input.redirectUrl,
      description: input.description,
      expiredAt: input.expiredAt.toISOString(),
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new MayarApiError(response.status, body.slice(0, ERROR_BODY_LOG_LIMIT))
  }

  const parsed = (await response.json()) as { data?: Record<string, unknown> }
  const data = parsed.data ?? {}
  const mayarId = mayarIdOf(data)
  const link = typeof data.link === 'string' ? data.link : ''
  if (!mayarId || !link.startsWith('https://')) {
    throw new Error('Mayar tidak mengembalikan link pembayaran yang sah')
  }

  return { mayarId, link }
}

export type MayarWebhookData = {
  readonly id?: unknown
  readonly transactionId?: unknown
  readonly status?: unknown
  readonly transactionStatus?: unknown
  readonly amount?: unknown
}

export type MayarWebhookOutcome = 'paid' | 'underpaid' | 'failed' | 'ignore'

/**
 * Arti satu webhook Mayar bagi pembelian yang menunggu.
 *
 * `payment.received` = uang masuk. Penandanya beragam: dokumen menyebut `transactionStatus: "paid"`,
 * tapi QRIS live datang sebagai `status: "SUCCESS"` + `transactionStatus: "created"` (temuan
 * Ergonio/docvibe), jadi keduanya dihitung. NAMA EVENT yang menyaring `payment.reminder` - event itu
 * juga membawa `SUCCESS` padahal pembeli BELUM bayar. `amount` bisa termasuk biaya kanal yang
 * ditanggung pembeli, jadi nominal >= harga dianggap lunas.
 */
export function classifyMayarEvent(
  event: unknown,
  data: MayarWebhookData,
  expectedAmount: number,
): MayarWebhookOutcome {
  const status = String(data.status ?? '').toUpperCase()
  const transactionStatus = String(data.transactionStatus ?? '').toLowerCase()
  const isFailed =
    event === 'payment.failed' || status === 'FAILED' || transactionStatus === 'failed'

  if (
    event === 'payment.received' &&
    !isFailed &&
    (transactionStatus === 'paid' || status === 'SUCCESS')
  ) {
    return typeof data.amount === 'number' && data.amount < expectedAmount ? 'underpaid' : 'paid'
  }

  return isFailed ? 'failed' : 'ignore'
}
