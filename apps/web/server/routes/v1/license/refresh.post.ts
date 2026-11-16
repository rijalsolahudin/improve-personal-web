import { licenseRefreshInputSchema } from '@improve-personal/contracts'

import { serviceContext } from '../../../services/context'
import { refreshLicenseToken } from '../../../services/license'
import { consumeRateLimit } from '../../../services/rate-limit'

/**
 * `POST /v1/license/refresh` - token lama -> token dengan `exp` terkini (ADR 16).
 *
 * Publik (tanpa sesi): bukti kepemilikannya tanda tangan token itu sendiri. App memanggilnya otomatis
 * saat online kalau masa aktif hampir/sudah habis, supaya perpanjangan dari perangkat lain terbawa
 * tanpa OTP ulang. Rate limit per IP menahan penyapuan dengan token palsu.
 */
export default defineApiHandler(async (event) => {
  const body = await readValidatedBody(event, (value) => licenseRefreshInputSchema.parse(value))
  const ctx = serviceContext(event)

  if (ctx.clientIp !== null) await consumeRateLimit(ctx, 'license:refresh', ctx.clientIp)

  setHeader(event, 'cache-control', 'no-store')

  return { token: await refreshLicenseToken(ctx, body.token) }
})
