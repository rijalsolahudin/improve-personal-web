import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { usePurchase } from './usePurchase'

/** Jaringan dimock di batas `$fetch`; navigasi ke Mayar di batas `window.location.assign`. */
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
mockNuxtImport('$fetch', () => fetchMock)

/** `?plan=` datang dari tombol paket di landing. */
const route = reactive<{ query: Record<string, unknown> }>({ query: {} })
mockNuxtImport('useRoute', () => () => route)

const assignMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  assignMock.mockReset()
  route.query = {}
  vi.stubGlobal('location', { ...window.location, assign: assignMock })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function filled() {
  const purchase = usePurchase()
  purchase.name.value = 'Rina'
  purchase.email.value = 'Rina@Email.com'
  purchase.mobile.value = '0812-3456-7890'
  return purchase
}

describe('usePurchase', () => {
  it('input tidak valid -> field ditandai, tanpa request', async () => {
    const purchase = usePurchase()
    purchase.email.value = 'bukan-email'

    await purchase.submit()

    expect(purchase.fieldErrors.value).toEqual(expect.arrayContaining(['name', 'email', 'mobile']))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('paket awal dari `?plan=`; nilai asing jatuh ke tahunan', () => {
    route.query = { plan: 'lifetime' }
    expect(usePurchase().plan.value).toBe('lifetime')

    route.query = { plan: 'gratis' }
    expect(usePurchase().plan.value).toBe('yearly')
  })

  it('paket yang dipilih ikut ke checkout', async () => {
    fetchMock.mockResolvedValue({ data: { paymentUrl: 'https://mayar.link/abc' } })
    const purchase = filled()
    purchase.plan.value = 'monthly'

    await purchase.submit()

    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/purchase/checkout',
      expect.objectContaining({ body: expect.objectContaining({ plan: 'monthly' }) }),
    )
  })

  it('sukses -> kirim data ternormalisasi (tanpa harga), lalu pindah ke Mayar', async () => {
    fetchMock.mockResolvedValue({ data: { paymentUrl: 'https://mayar.link/abc' } })
    const purchase = filled()

    await purchase.submit()

    expect(fetchMock).toHaveBeenCalledWith('/v1/purchase/checkout', {
      method: 'POST',
      body: { name: 'Rina', email: 'rina@email.com', mobile: '081234567890', plan: 'yearly' },
    })
    expect(assignMock).toHaveBeenCalledWith('https://mayar.link/abc')
  })

  it('respons dengan link bukan https -> tidak pindah halaman', async () => {
    fetchMock.mockResolvedValue({ data: { paymentUrl: 'javascript:alert(1)' } })
    const purchase = filled()

    await purchase.submit()

    expect(assignMock).not.toHaveBeenCalled()
    expect(purchase.error.value).toBe('generic')
  })

  it.each([
    [{ status: 429, data: { error: { code: 'RATE_LIMITED', message: 'x' } } }, 'rateLimited'],
    [{ status: 500, data: { error: { code: 'INTERNAL', message: 'x' } } }, 'generic'],
    [new TypeError('fetch failed'), 'unavailable'],
  ])('kegagalan %j -> %s', async (failure, expected) => {
    fetchMock.mockRejectedValue(failure)
    const purchase = filled()

    await purchase.submit()

    expect(purchase.error.value).toBe(expected)
    expect(purchase.isSubmitting.value).toBe(false)
  })
})
