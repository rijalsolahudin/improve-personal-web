import { serviceContext } from '../../../../services/context'
import { handleMayarWebhook } from '../../../../services/purchase'

/**
 * Semua tempat token webhook bisa dibawa. Webhook bisa datang langsung dari Mayar atau diteruskan
 * webhook-gateway, dan nama header-nya tidak tetap - jadi dikumpulkan semua, dan cukup SATU yang
 * cocok: `?token=`, `Authorization: Bearer <token>`, atau header apa pun yang namanya memuat "token"
 * (pola Ergonio).
 */
function webhookTokens(event: H3Event): string[] {
  const tokens: string[] = []

  const query = getQuery(event).token
  if (typeof query === 'string' && query !== '') tokens.push(query)

  const authorization = getHeader(event, 'authorization')
  if (authorization) tokens.push(authorization.replace(/^Bearer\s+/i, ''))

  for (const [name, value] of Object.entries(getHeaders(event))) {
    if (name.toLowerCase().includes('token') && typeof value === 'string' && value !== '') {
      tokens.push(value)
    }
  }

  return tokens
}

/**
 * `POST /v1/payments/webhook/mayar` - notifikasi pembayaran (ADR 15). Publik; diautentikasi token
 * rahasia `NUXT_MAYAR_WEBHOOK_TOKEN`. Body tidak di-log (memuat data pembeli).
 */
export default defineApiHandler(async (event) => {
  const tokens = webhookTokens(event)
  const body: unknown = await readBody(event)

  return handleMayarWebhook(serviceContext(event), body, tokens)
})
