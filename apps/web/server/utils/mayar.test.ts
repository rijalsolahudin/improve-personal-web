// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import {
  MayarApiError,
  classifyMayarEvent,
  createMayarPayment,
  mayarGatewayTag,
  normalizeMayarEnvironment,
  type MayarFetch,
} from './mayar'

describe('tag gateway webhook', () => {
  it.each([
    [undefined, 'production'],
    ['', 'production'],
    ['Development', 'development'],
    ['  my local!! box ', 'my-local-box'],
    ['a'.repeat(40), 'a'.repeat(20)],
  ])('normalizeMayarEnvironment(%j) = %j', (raw, expected) => {
    expect(normalizeMayarEnvironment(raw)).toBe(expected)
  })

  it('tag memakai kunci produk yang terdaftar di gateway', () => {
    expect(mayarGatewayTag('development')).toBe('[wh:product=improve-personal;env=development]')
  })
})

describe('classifyMayarEvent', () => {
  const PRICE = 99_000

  it.each([
    [{ status: 'SUCCESS', transactionStatus: 'created', amount: PRICE }],
    [{ transactionStatus: 'paid', amount: PRICE }],
    [{ status: 'success', amount: PRICE + 2_500 }],
  ])('payment.received %j = paid', (data) => {
    expect(classifyMayarEvent('payment.received', data, PRICE)).toBe('paid')
  })

  it('payment.reminder dengan SUCCESS TIDAK melunasi (pembeli belum bayar)', () => {
    expect(classifyMayarEvent('payment.reminder', { status: 'SUCCESS' }, PRICE)).toBe('ignore')
  })

  it('nominal kurang dari harga = underpaid', () => {
    expect(
      classifyMayarEvent('payment.received', { status: 'SUCCESS', amount: 1_000 }, PRICE),
    ).toBe('underpaid')
  })

  it.each([
    ['payment.failed', {}],
    ['payment.received', { status: 'FAILED' }],
    ['payment.received', { status: 'SUCCESS', transactionStatus: 'failed' }],
  ])('%s %j = failed', (event, data) => {
    expect(classifyMayarEvent(event, data, PRICE)).toBe('failed')
  })
})

describe('createMayarPayment', () => {
  const input = {
    apiKey: 'qa-key',
    name: 'Rina',
    email: 'rina@email.com',
    mobile: '081234567890',
    amount: 99_000,
    redirectUrl: 'https://app.test/beli/selesai',
    description: 'Lisensi [wh:product=improve-personal;env=test]',
    expiredAt: new Date('2026-11-17T00:00:00.000Z'),
  }

  function respond(status: number, body: unknown): MayarFetch {
    return vi.fn(async () => new Response(JSON.stringify(body), { status }))
  }

  it('mengirim payload + Bearer, mengembalikan id & link', async () => {
    const request = respond(200, { data: { id: 'pay-1', link: 'https://mayar.link/pay-1' } })

    await expect(createMayarPayment(input, request)).resolves.toEqual({
      mayarId: 'pay-1',
      link: 'https://mayar.link/pay-1',
    })

    const [, init] = vi.mocked(request).mock.calls[0] ?? []
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer qa-key')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      amount: 99_000,
      expiredAt: '2026-11-17T00:00:00.000Z',
      mobile: '081234567890',
    })
  })

  it('transactionId lebih diutamakan daripada id', async () => {
    const request = respond(200, {
      data: { id: 'link-1', transactionId: 'trx-1', link: 'https://mayar.link/x' },
    })
    expect((await createMayarPayment(input, request)).mayarId).toBe('trx-1')
  })

  it('non-2xx -> MayarApiError dengan status', async () => {
    await expect(createMayarPayment(input, respond(401, { messages: 'x' }))).rejects.toBeInstanceOf(
      MayarApiError,
    )
  })

  it('link bukan https ditolak', async () => {
    const request = respond(200, { data: { id: 'pay-1', link: 'javascript:alert(1)' } })
    await expect(createMayarPayment(input, request)).rejects.toThrow()
  })
})
