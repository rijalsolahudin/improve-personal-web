import { and, desc, eq, gt, inArray, isNotNull, ne } from 'drizzle-orm'

import { LICENSE_PRICE_IDR, type CheckoutInput } from '@improve-personal/contracts'

import { purchases } from '../db/schema'
import { apiProblem } from '../utils/api-error'
import { safeEqualHex, sha256Hex } from '../utils/crypto'
import type { ServerEnv } from '../utils/env'
import {
  MayarApiError,
  classifyMayarEvent,
  createMayarPayment,
  mayarGatewayTag,
  type MayarFetch,
  type MayarWebhookData,
} from '../utils/mayar'
import { uuidv7 } from '../utils/uuid'
import type { ServiceContext } from './context'
import { grantLicense } from './license'
import { consumeRateLimit } from './rate-limit'

/**
 * Pembelian lisensi lewat Mayar (ADR 15, PRD F15 "Pembelian & Lisensi").
 *
 * Alur: halaman beli -> `startCheckout` (baris `purchases` + payment request Mayar) -> pembeli bayar
 * di Mayar -> webhook `handleMayarWebhook` -> `purchases.status = paid` + `grantLicense`. Pembeli lalu
 * login dengan email yang sama dan app menerbitkan token lisensi (`services/license.ts`).
 */

/** Umur link bayar (dikirim ke Mayar sebagai `expiredAt`). */
export const CHECKOUT_EXPIRY_HOURS = 24

const MS_PER_HOUR = 60 * 60 * 1000

/** Link yang tinggal kurang dari ini tidak dipakai ulang - pembeli bisa kehabisan waktu di tengah. */
const REUSE_MIN_REMAINING_MS = 5 * 60 * 1000

/** Path tujuan setelah bayar (di origin app sendiri). */
export const CHECKOUT_RETURN_PATH = '/beli/selesai'

/**
 * Nominal yang ditagih. Override hanya berlaku di non-production (Mayar tidak punya sandbox, jadi uji
 * bayar = uang sungguhan); production selalu `LICENSE_PRICE_IDR`.
 */
export function licensePriceIdr(env: ServerEnv): number {
  if (env.isProduction || env.priceOverrideIdr === null) return LICENSE_PRICE_IDR
  return env.priceOverrideIdr
}

export type StartCheckoutInput = CheckoutInput & {
  /** Origin app (`https://domain`) untuk `redirectUrl` setelah bayar. */
  readonly origin: string
}

/**
 * Buat (atau pakai ulang) link bayar untuk email ini.
 *
 * Link yang masih berlaku untuk email + harga yang sama dipakai ulang, supaya klik berulang tidak
 * menumpuk tagihan di Mayar. Rate limit per email & per IP menutup penyalahgunaan endpoint publik ini
 * sebagai pengirim email Mayar ke alamat orang lain.
 */
export async function startCheckout(
  ctx: ServiceContext,
  input: StartCheckoutInput,
  request?: MayarFetch,
): Promise<string> {
  if (ctx.env.mayarApiKey === '') throw apiProblem('INTERNAL')

  await consumeRateLimit(ctx, 'purchase:email', input.email)
  if (ctx.clientIp !== null) await consumeRateLimit(ctx, 'purchase:ip', ctx.clientIp)

  const amount = licensePriceIdr(ctx.env)

  const [open] = await ctx.db
    .select({ paymentUrl: purchases.paymentUrl })
    .from(purchases)
    .where(
      and(
        eq(purchases.email, input.email),
        eq(purchases.status, 'pending'),
        eq(purchases.amount, amount),
        isNotNull(purchases.paymentUrl),
        gt(purchases.expiresAt, new Date(ctx.now.getTime() + REUSE_MIN_REMAINING_MS)),
      ),
    )
    .orderBy(desc(purchases.createdAt))
    .limit(1)
  if (open?.paymentUrl) return open.paymentUrl

  const id = uuidv7(ctx.now.getTime())
  const expiresAt = new Date(ctx.now.getTime() + CHECKOUT_EXPIRY_HOURS * MS_PER_HOUR)
  await ctx.db.insert(purchases).values({
    id,
    email: input.email,
    amount,
    expiresAt,
    createdAt: ctx.now,
  })

  try {
    const payment = await createMayarPayment(
      {
        apiKey: ctx.env.mayarApiKey,
        name: input.name,
        email: input.email,
        mobile: input.mobile,
        amount,
        redirectUrl: `${input.origin}${CHECKOUT_RETURN_PATH}`,
        description: `Lisensi Improve Personal - ${id} ${mayarGatewayTag(ctx.env.mayarEnvironment)}`,
        expiredAt: expiresAt,
      },
      request,
    )

    await ctx.db
      .update(purchases)
      .set({ mayarId: payment.mayarId, paymentUrl: payment.link })
      .where(eq(purchases.id, id))

    return payment.link
  } catch (error) {
    // Baris tanpa link Mayar tidak bisa dibayar; tandai gagal supaya tidak terlihat "menunggu".
    await ctx.db.update(purchases).set({ status: 'failed' }).where(eq(purchases.id, id))
    // Status Mayar boleh masuk log; body-nya sudah dipotong dan tidak memuat data pembeli kita.
    const detail = error instanceof MayarApiError ? `status ${error.status}` : 'transport'
    console.error(`[purchase] Mayar checkout gagal (${detail}) purchase=${id}`)
    throw apiProblem('INTERNAL')
  }
}

/** Token rahasia dibandingkan lewat hash dengan panjang tetap: waktu tidak bergantung isi token. */
function tokenMatches(candidate: string, expected: string): boolean {
  return safeEqualHex(sha256Hex(candidate), sha256Hex(expected))
}

export type MayarWebhookBody = {
  readonly event?: unknown
  readonly data?: MayarWebhookData | null
}

export type MayarWebhookResult = { readonly status: 'ok' | 'pending' | 'paid' | 'failed' }

function isWebhookBody(value: unknown): value is MayarWebhookBody {
  return typeof value === 'object' && value !== null
}

/**
 * Proses satu webhook Mayar.
 *
 * - Token wajib cocok; token server kosong = semua ditolak (fail-closed - konveksiin melewati
 *   pemeriksaan kalau token kosong, dan itu sengaja TIDAK ditiru).
 * - Pelunasan atomik (`status <> 'paid'` di klausa UPDATE): webhook yang dikirim ulang atau datang
 *   bersamaan hanya melunasi sekali. `grantLicense` sendiri idempoten per `order_ref`.
 * - Kurang bayar ditolak dan dicatat, tidak melunasi.
 */
export async function handleMayarWebhook(
  ctx: ServiceContext,
  body: unknown,
  tokens: readonly string[],
): Promise<MayarWebhookResult> {
  const expected = ctx.env.mayarWebhookToken
  if (expected === '' || !tokens.some((token) => tokenMatches(token, expected))) {
    throw apiProblem('UNAUTHENTICATED')
  }

  if (!isWebhookBody(body)) throw apiProblem('VALIDATION_FAILED')
  if (body.event === 'testing') return { status: 'ok' }

  const data = body.data
  if (typeof data !== 'object' || data === null) throw apiProblem('VALIDATION_FAILED')

  const mayarIds = [data.id, data.transactionId].filter(
    (value): value is string => typeof value === 'string' && value !== '',
  )
  if (mayarIds.length === 0) throw apiProblem('VALIDATION_FAILED')

  const [purchase] = await ctx.db
    .select()
    .from(purchases)
    .where(inArray(purchases.mayarId, mayarIds))
    .limit(1)
  if (purchase === undefined) throw apiProblem('NOT_FOUND')

  const outcome = classifyMayarEvent(body.event, data, purchase.amount)

  if (outcome === 'underpaid') {
    console.error(`[purchase] nominal kurang purchase=${purchase.id}`)
    throw apiProblem('VALIDATION_FAILED')
  }

  if (outcome === 'paid') {
    await ctx.db
      .update(purchases)
      .set({ status: 'paid', paidAt: ctx.now })
      .where(and(eq(purchases.id, purchase.id), ne(purchases.status, 'paid')))
    // Tetap dipanggil walau baris sudah `paid`: memulihkan lisensi kalau proses sebelumnya mati di
    // antara dua langkah ini. Idempoten per `order_ref`.
    await grantLicense(ctx, { email: purchase.email, orderRef: purchase.id })
    return { status: 'paid' }
  }

  if (outcome === 'failed' && purchase.status === 'pending') {
    await ctx.db
      .update(purchases)
      .set({ status: 'failed' })
      .where(and(eq(purchases.id, purchase.id), eq(purchases.status, 'pending')))
    return { status: 'failed' }
  }

  return { status: purchase.status }
}
