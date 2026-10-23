import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AccountDevice } from '~/composables/useAccount'

import AkunPage from './akun.vue'

/**
 * Bukti UI untuk dua AC T22 yang sebelumnya hanya diperiksa lewat teks halaman:
 *
 * - Tambah perangkat: dialog dua peran, QR permintaan benar-benar digambar (SVG, bukan `v-html`),
 *   hitung mundur ≤ 2 menit, dan QR asing ditolak TANPA mengirim apa pun ke server.
 * - Hapus akun: dialog konfirmasi email + OTP ulang mengirim kode ke email SESI lewat endpoint yang
 *   benar, dan tombol destruktif mati selama bukti kepemilikan belum lengkap.
 *
 * Jaringan di-mock di batas (`$fetch`); kripto pairing memakai libsodium asli seperti di browser.
 */

const { fetchSpy } = vi.hoisted(() => ({ fetchSpy: vi.fn() }))
mockNuxtImport('$fetch', () => fetchSpy)

const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const CURRENT_DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d1'

const SESSION = {
  user: { id: USER_ID, email: 'kamu@email.com' },
  device: { id: CURRENT_DEVICE_ID, name: 'Chrome di Linux' },
  expiresAt: '2026-12-31T09:00:00.000Z',
}

const DEVICE: AccountDevice = {
  id: CURRENT_DEVICE_ID,
  name: 'Chrome di Linux',
  platform: 'web',
  createdAt: '2026-10-01T00:00:00.000Z',
  lastSeenAt: '2026-10-22T09:15:00.000Z',
  lastIpCity: 'Jakarta',
  revokedAt: null,
  isCurrent: true,
}

let mounted: VueWrapper | null = null

async function mount(): Promise<VueWrapper> {
  mounted = await mountSuspended(AkunPage)
  return mounted
}

async function setAccountState(devices: AccountDevice[]): Promise<void> {
  useState<'set' | 'unset'>('accountPasskey').value = 'set'
  useState<'set' | 'unset'>('accountRecovery').value = 'unset'
  useState<'idle' | 'loading' | 'ready' | 'error'>('accountStatus').value = 'ready'
  useState<string | null>('accountError').value = null
  useState<AccountDevice[]>('accountDevices').value = devices
  await nextTick()
}

function buttonByText(wrapper: VueWrapper, pattern: RegExp) {
  return wrapper.findAll('button').find((button) => pattern.test(button.text()))
}

async function openPairing(wrapper: VueWrapper): Promise<void> {
  await buttonByText(wrapper, /^tambah perangkat$/i)?.trigger('click')
  await flushPromises()
  await nextTick()
}

/** `Berlaku 0:120` -> 120. Nilai mentahnya dipakai supaya format tampilan tidak memengaruhi AC. */
function countdownSeconds(wrapper: VueWrapper): number {
  const match = /berlaku (\d+):(\d+)/i.exec(wrapper.text())
  expect(match, 'hitung mundur QR tidak ditemukan').not.toBeNull()

  const minutes = Number(match?.[1])
  const seconds = Number(match?.[2])
  return minutes * 60 + seconds
}

beforeEach(() => {
  fetchSpy.mockReset()
  // Satu-satunya request yang wajar terjadi saat halaman dimuat: daftar perangkat.
  fetchSpy.mockResolvedValue({ data: { devices: [DEVICE] } })
  clearNuxtState([
    'auth-session',
    'auth-session-pending',
    'auth-session-error',
    'localData',
    'accountPasskey',
    'accountRecovery',
    'accountStatus',
    'accountError',
    'accountBusy',
    'accountDevices',
    'accountDeletionSendingCode',
    'accountDeletionBusy',
    'accountDeletionError',
    'accountDeletionResendAt',
    'now',
  ])
  useState('auth-session').value = SESSION
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('tambah perangkat via QR (UI)', () => {
  it('dua peran ditawarkan sebelum ada QR - arah transfer tidak ditebak', async () => {
    const wrapper = await mount()
    await setAccountState([DEVICE])
    await openPairing(wrapper)

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Perangkat ini yang baru (butuh kunci)')
    expect(wrapper.text()).toContain('Perangkat ini sudah punya kunci')
    // Belum ada QR sebelum peran dipilih.
    expect(wrapper.find('svg.qr').exists()).toBe(false)
  })

  it('perangkat baru: QR digambar sebagai SVG dan hitung mundur ≤ 2 menit', async () => {
    const wrapper = await mount()
    await setAccountState([DEVICE])
    await openPairing(wrapper)

    await buttonByText(wrapper, /perangkat ini yang baru/i)?.trigger('click')
    await vi.waitFor(
      () => {
        expect(wrapper.find('svg.qr').exists()).toBe(true)
      },
      { timeout: 30_000, interval: 100 },
    )

    // QR = elemen SVG sungguhan (satu `<path>`), bukan markup HTML yang disuntik lewat `v-html`.
    expect(wrapper.find('svg.qr path').exists()).toBe(true)
    expect(wrapper.find('svg.qr').attributes('aria-label')).toContain('QR permintaan')

    const remaining = countdownSeconds(wrapper)
    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThanOrEqual(120)
  })

  it('QR asing ditolak di UI tanpa satu pun request ke server', async () => {
    const wrapper = await mount()
    await setAccountState([DEVICE])
    await openPairing(wrapper)

    await buttonByText(wrapper, /perangkat ini sudah punya kunci/i)?.trigger('click')
    await flushPromises()

    const manual = wrapper.find('#pairing-manual')
    expect(manual.exists()).toBe(true)
    await manual.setValue('{"v":1,"publicKey":"bukan-dari-aplikasi-ini"}')

    const callsBefore = fetchSpy.mock.calls.length
    await wrapper.find('form.manual').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toMatch(/QR tidak dikenali/i)
    expect(fetchSpy).toHaveBeenCalledTimes(callsBefore)
  })
})

describe('perangkat yang sudah dicabut', () => {
  it('ditandai tidak aktif dan tidak menawarkan "Cabut akses" lagi', async () => {
    const wrapper = await mount()
    await setAccountState([
      DEVICE,
      {
        ...DEVICE,
        id: '018f2c4e-0000-7000-8000-0000000000d9',
        name: 'Pixel lama',
        isCurrent: false,
        revokedAt: '2026-10-20T08:00:00.000Z',
      },
    ])

    expect(wrapper.text()).toMatch(/sudah dicabut/i)
    const revokeButtons = wrapper
      .findAll('button')
      .filter((button) => button.text() === 'Cabut akses')
    // Perangkat aktif lain (DEVICE = perangkat ini) juga tidak punya tombol; yang dicabut jelas tidak.
    expect(revokeButtons).toHaveLength(0)
  })
})

describe('hapus akun (UI)', () => {
  it('dialog meminta konfirmasi email + OTP, dan tombol hapus mati sebelum bukti lengkap', async () => {
    const wrapper = await mount()
    await setAccountState([DEVICE])

    await buttonByText(wrapper, /^hapus akun$/i)?.trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('Hapus akun permanen')
    expect(wrapper.text()).toContain('Email akun')
    expect(wrapper.text()).toContain('Kode konfirmasi')

    const destructive = buttonByText(wrapper, /hapus akun permanen/i)
    expect(destructive?.attributes('disabled')).toBeDefined()

    // Email yang diketik tidak boleh langsung dianggap sah hanya karena kolomnya terisi.
    const emailInput = wrapper.find('input[type="email"]')
    await emailInput.setValue('orang@lain.com')
    expect(destructive?.attributes('disabled')).toBeDefined()
  })

  it('mengirim kode konfirmasi ke email sesi lewat POST /v1/account/deletion-otp', async () => {
    const wrapper = await mount()
    await setAccountState([DEVICE])

    await buttonByText(wrapper, /^hapus akun$/i)?.trigger('click')
    await flushPromises()
    await nextTick()

    const callsBefore = fetchSpy.mock.calls.length
    await buttonByText(wrapper, /kirim kode ke email/i)?.trigger('click')
    await flushPromises()

    const deletionCalls = fetchSpy.mock.calls.slice(callsBefore)
    expect(deletionCalls).toEqual([['/v1/account/deletion-otp', { method: 'POST' }]])
  })
})
