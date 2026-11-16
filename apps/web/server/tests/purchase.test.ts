// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { LICENSE_PRICE_IDR } from '@improve-personal/contracts'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { licenses, purchases } from '../db/schema'
import { handleMayarWebhook, licensePriceIdr, startCheckout } from '../services/purchase'
import type { MayarFetch } from '../utils/mayar'
import { closeTestDb, makeEnv, testDb, type Fixture } from './helpers/harness'
import { captureProblem, testScope } from './helpers/scope'

const scope = testScope()

afterAll(async () => {
  await scope.dispose()
  await closeTestDb()
})

const WEBHOOK_TOKEN = 'qa-mayar-webhook-token'
const MAYAR_ENV = { mayarApiKey: 'qa-mayar-key', mayarWebhookToken: WEBHOOK_TOKEN }

function mayarFixture(prefix: string, overrides: Record<string, unknown> = {}): Fixture {
  return scope.fixture({ prefix, env: makeEnv({ ...MAYAR_ENV, ...overrides }) })
}

/** Mayar palsu di batas jaringan: setiap panggilan membuat transaksi baru. */
function fakeMayar(): MayarFetch & { readonly ids: string[] } {
  const ids: string[] = []
  const request = vi.fn(async () => {
    const id = `qa-trx-${randomUUID()}`
    ids.push(id)
    return new Response(JSON.stringify({ data: { id, link: `https://mayar.link/${id}` } }), {
      status: 200,
    })
  })
  return Object.assign(request, { ids })
}

function checkoutOf(fixture: Fixture) {
  return {
    name: 'QA Pembeli',
    email: fixture.email,
    mobile: '081234567890',
    origin: 'https://app.test',
  }
}

async function purchaseOf(email: string) {
  const [row] = await testDb().select().from(purchases).where(eq(purchases.email, email))
  if (row === undefined) throw new Error('baris pembelian tidak ada')
  return row
}

async function licensesOf(email: string) {
  return testDb().select().from(licenses).where(eq(licenses.email, email))
}

describe('startCheckout', () => {
  it('membuat pembelian pending + link Mayar dengan tag gateway', async () => {
    const fixture = mayarFixture('purchase-checkout', {
      mayarProduct: 'jurnal-pro',
      mayarEnvironment: 'development',
    })
    const mayar = fakeMayar()

    const link = await startCheckout(fixture.ctx(), checkoutOf(fixture), mayar)

    const row = await purchaseOf(fixture.email)
    expect(link).toBe(`https://mayar.link/${mayar.ids[0]}`)
    expect(row).toMatchObject({
      status: 'pending',
      mayarId: mayar.ids[0],
      amount: LICENSE_PRICE_IDR,
    })

    const [, init] = vi.mocked(mayar).mock.calls[0] ?? []
    const sent = JSON.parse(String(init?.body)) as { description: string; redirectUrl: string }
    expect(sent.description).toContain(row.id)
    expect(sent.description.endsWith('[wh:product=jurnal-pro;env=development]')).toBe(true)
    expect(sent.redirectUrl).toBe('https://app.test/beli/selesai')
  })

  it('klik ulang selagi link masih berlaku -> link yang sama, tanpa tagihan baru', async () => {
    const fixture = mayarFixture('purchase-reuse')
    const mayar = fakeMayar()

    const first = await startCheckout(fixture.ctx(), checkoutOf(fixture), mayar)
    const second = await startCheckout(fixture.ctx(), checkoutOf(fixture), mayar)

    expect(second).toBe(first)
    expect(mayar).toHaveBeenCalledTimes(1)
  })

  it('API key kosong -> gagal tanpa memanggil Mayar', async () => {
    const fixture = mayarFixture('purchase-nokey', { mayarApiKey: '' })
    const mayar = fakeMayar()

    const problem = await captureProblem(startCheckout(fixture.ctx(), checkoutOf(fixture), mayar))

    expect(problem?.code).toBe('INTERNAL')
    expect(mayar).not.toHaveBeenCalled()
  })

  it('Mayar menolak -> pembelian ditandai gagal, bukan menggantung pending', async () => {
    const fixture = mayarFixture('purchase-mayar-down')
    const failing: MayarFetch = vi.fn(async () => new Response('down', { status: 503 }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const problem = await captureProblem(startCheckout(fixture.ctx(), checkoutOf(fixture), failing))

    expect(problem?.code).toBe('INTERNAL')
    expect((await purchaseOf(fixture.email)).status).toBe('failed')
  })
})

describe('licensePriceIdr', () => {
  it('override dipakai di non-production', () => {
    expect(licensePriceIdr(makeEnv({ priceOverrideIdr: 1_000 }))).toBe(1_000)
  })

  it('production mengabaikan override (tidak pernah menagih kurang)', () => {
    const env = { ...makeEnv({ priceOverrideIdr: 1_000 }), isProduction: true }
    expect(licensePriceIdr(env)).toBe(LICENSE_PRICE_IDR)
  })
})

describe('handleMayarWebhook', () => {
  async function pendingPurchase(prefix: string) {
    const fixture = mayarFixture(prefix)
    const mayar = fakeMayar()
    await startCheckout(fixture.ctx(), checkoutOf(fixture), mayar)
    return { fixture, mayarId: mayar.ids[0] ?? '' }
  }

  function paidBody(mayarId: string, amount = LICENSE_PRICE_IDR) {
    return {
      event: 'payment.received',
      data: { id: mayarId, status: 'SUCCESS', transactionStatus: 'created', amount },
    }
  }

  it('token salah / tidak ada -> UNAUTHENTICATED, pembelian tidak berubah', async () => {
    const { fixture, mayarId } = await pendingPurchase('purchase-wh-token')

    for (const tokens of [[], ['salah']]) {
      const problem = await captureProblem(
        handleMayarWebhook(fixture.ctx(), paidBody(mayarId), tokens),
      )
      expect(problem?.code).toBe('UNAUTHENTICATED')
    }
    expect((await purchaseOf(fixture.email)).status).toBe('pending')
  })

  it('token server belum dikonfigurasi -> semua webhook ditolak (fail-closed)', async () => {
    const fixture = mayarFixture('purchase-wh-notoken', { mayarWebhookToken: '' })

    const problem = await captureProblem(
      handleMayarWebhook(fixture.ctx(), { event: 'testing' }, ['']),
    )

    expect(problem?.code).toBe('UNAUTHENTICATED')
  })

  it('event `testing` dari dashboard Mayar -> ok', async () => {
    const fixture = mayarFixture('purchase-wh-testing')
    await expect(
      handleMayarWebhook(fixture.ctx(), { event: 'testing' }, [WEBHOOK_TOKEN]),
    ).resolves.toEqual({ status: 'ok' })
  })

  it('lunas -> pembelian paid + lisensi terbit; dikirim ulang tetap SATU lisensi', async () => {
    const { fixture, mayarId } = await pendingPurchase('purchase-wh-paid')

    await expect(
      handleMayarWebhook(fixture.ctx(), paidBody(mayarId), ['x', WEBHOOK_TOKEN]),
    ).resolves.toEqual({ status: 'paid' })
    await handleMayarWebhook(fixture.ctx(), paidBody(mayarId), [WEBHOOK_TOKEN])

    const purchase = await purchaseOf(fixture.email)
    const granted = await licensesOf(fixture.email)
    expect(purchase.status).toBe('paid')
    expect(granted).toHaveLength(1)
    expect(granted[0]?.orderRef).toBe(purchase.id)
  })

  it('kurang bayar -> ditolak, tidak ada lisensi', async () => {
    const { fixture, mayarId } = await pendingPurchase('purchase-wh-underpaid')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const problem = await captureProblem(
      handleMayarWebhook(fixture.ctx(), paidBody(mayarId, 1_000), [WEBHOOK_TOKEN]),
    )

    expect(problem?.code).toBe('VALIDATION_FAILED')
    expect(await licensesOf(fixture.email)).toHaveLength(0)
  })

  it('payment.reminder (SUCCESS tapi belum bayar) -> diabaikan', async () => {
    const { fixture, mayarId } = await pendingPurchase('purchase-wh-reminder')

    const result = await handleMayarWebhook(
      fixture.ctx(),
      { event: 'payment.reminder', data: { id: mayarId, status: 'SUCCESS' } },
      [WEBHOOK_TOKEN],
    )

    expect(result.status).toBe('pending')
    expect(await licensesOf(fixture.email)).toHaveLength(0)
  })

  it('payment.failed -> pembelian failed', async () => {
    const { fixture, mayarId } = await pendingPurchase('purchase-wh-failed')

    await handleMayarWebhook(fixture.ctx(), { event: 'payment.failed', data: { id: mayarId } }, [
      WEBHOOK_TOKEN,
    ])

    expect((await purchaseOf(fixture.email)).status).toBe('failed')
  })

  it('transaksi tidak dikenal -> NOT_FOUND', async () => {
    const fixture = mayarFixture('purchase-wh-unknown')
    const problem = await captureProblem(
      handleMayarWebhook(fixture.ctx(), paidBody(`tidak-ada-${randomUUID()}`), [WEBHOOK_TOKEN]),
    )
    expect(problem?.code).toBe('NOT_FOUND')
  })
})
