import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LoginPage from './login.vue'

/**
 * Langkah "lupa OTP" di halaman login (AC T22):
 * email -> "Pakai passkey atau kode pemulihan?" -> pembuka kunci.
 *
 * Dua hal yang dibuktikan di sini, karena `login.qa.test.ts` (milik putaran 1) hanya memeriksa
 * keberadaan tautannya:
 * 1. Kalau perangkat ini TIDAK punya sesi, UI mengatakannya jujur dan tidak menampilkan form yang
 *    seolah-olah bisa membuka kunci tanpa bukti kepemilikan (server tetap sumber keputusan).
 * 2. Kalau sesi ada, form pembuka kunci benar-benar tersedia: kode `iprk1.*`, berkas, dan passkey.
 */

const { fetchSpy } = vi.hoisted(() => ({ fetchSpy: vi.fn() }))
mockNuxtImport('$fetch', () => fetchSpy)

const SESSION = {
  user: { id: '018f2c4e-0000-7000-8000-00000000000a', email: 'kamu@email.com' },
  device: { id: '018f2c4e-0000-7000-8000-0000000000d1', name: 'Chrome di Linux' },
  expiresAt: '2026-12-31T09:00:00.000Z',
}

let mounted: VueWrapper | null = null

async function mount(): Promise<VueWrapper> {
  mounted = await mountSuspended(LoginPage)
  return mounted
}

async function openRecovery(wrapper: VueWrapper): Promise<void> {
  const link = wrapper
    .findAll('button')
    .find((button) => /pakai passkey atau kode pemulihan/i.test(button.text()))
  expect(link, 'tautan lupa OTP tidak ada di langkah email').toBeDefined()

  await link?.trigger('click')
  // Langkah pemulihan adalah komponen async (chunk sendiri, supaya JS awal `/login` tetap di bawah
  // budget 170 KB). Satu `flushPromises` tidak cukup: modul + komponen anaknya baru selesai dimuat
  // beberapa tick kemudian, jadi tunggu sampai tombol "kembali" milik langkah itu muncul.
  await vi.waitFor(
    () => {
      expect(wrapper.text()).toMatch(/kembali ke email/i)
    },
    { timeout: 5000 },
  )
  await flushPromises()
  await nextTick()
}

/** Langkah OTP juga komponen async: tunggu sampai kotak kode 6 digit benar-benar ter-render. */
async function waitForOtpStep(wrapper: VueWrapper): Promise<void> {
  await vi.waitFor(
    () => {
      expect(wrapper.findAll('input.box')).toHaveLength(6)
    },
    { timeout: 5000 },
  )
  await flushPromises()
}

beforeEach(() => {
  fetchSpy.mockReset()
  // Default: belum login. `useAuthSession.load()` memetakan 401 menjadi sesi `null`.
  fetchSpy.mockRejectedValue({
    status: 401,
    data: { error: { code: 'UNAUTHENTICATED', message: 'generik' } },
  })
  clearNuxtState(['auth-session', 'auth-session-pending', 'auth-session-error', 'now'])
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('lupa OTP: pilihan passkey / kode pemulihan', () => {
  it('dari langkah email masuk ke "Pakai passkey atau kode pemulihan?"', async () => {
    const wrapper = await mount()
    await openRecovery(wrapper)

    expect(wrapper.text()).toContain('Pakai passkey atau kode pemulihan?')
    expect(wrapper.find('#login-email').exists()).toBe(false)
  })

  it('jujur saat perangkat ini tidak punya sesi: tidak menampilkan form pembuka kunci', async () => {
    const wrapper = await mount()
    await openRecovery(wrapper)

    // Server hanya mengirim envelope kunci ke user yang sudah punya sesi. Tanpa sesi, UI tidak boleh
    // berpura-pura bisa membuka data - cukup jelaskan jalan keluarnya.
    expect(wrapper.text()).toMatch(/belum punya sesi aktif/i)
    expect(wrapper.find('#recovery-code').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/buka dengan kode pemulihan/i)
  })

  it('dengan sesi aktif: tersedia kode pemulihan (`iprk1.*`) dan berkas, plus passkey bila didukung', async () => {
    useState('auth-session').value = SESSION
    const wrapper = await mount()
    await openRecovery(wrapper)

    expect(wrapper.find('#recovery-code').exists()).toBe(true)
    expect(wrapper.find('input[type="file"]').exists()).toBe(true)
    // Di environment test WebAuthn tidak tersedia, jadi tombol passkey memang tidak dirender.
    expect(wrapper.text()).toContain('atau pakai kode pemulihan')
    expect(wrapper.text()).toContain('Buka dengan kode pemulihan')
  })

  it('tautan juga ada di langkah OTP - saat user sadar kodenya tidak bisa diterima', async () => {
    fetchSpy.mockResolvedValue(undefined)
    const wrapper = await mount()

    await wrapper.find('#login-email').setValue('kamu@email.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    await nextTick()
    await waitForOtpStep(wrapper)

    expect(wrapper.findAll('input.box')).toHaveLength(6)
    expect(
      wrapper
        .findAll('button')
        .some((button) => /pakai passkey atau kode pemulihan/i.test(button.text())),
    ).toBe(true)
  })

  it('tombol kembali mengembalikan user ke langkah email tanpa kehilangan alamat', async () => {
    const wrapper = await mount()
    const input = wrapper.find('#login-email')
    await input.setValue('kamu@email.com')

    await openRecovery(wrapper)
    const back = wrapper.findAll('button').find((button) => /kembali/i.test(button.text()))
    expect(back).toBeDefined()
    await back?.trigger('click')
    await flushPromises()

    expect(wrapper.find('#login-email').exists()).toBe(true)
    expect((wrapper.find('#login-email').element as HTMLInputElement).value).toBe('kamu@email.com')
  })
})
