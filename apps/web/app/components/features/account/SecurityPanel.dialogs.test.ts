import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AccountDevice } from '~/composables/useAccount'

import SecurityPanel from './SecurityPanel.vue'

/**
 * Dialog di halaman Akun: yang diuji adalah "benar-benar muncul dan berisi", bukan sekadar tombolnya ada.
 * Nama komponen auto-import TIDAK diverifikasi typecheck - salah nama hanya jadi elemen tak dikenal -
 * jadi halaman ini dibuka sungguhan lalu dialognya diklik.
 */

const { fetchSpy } = vi.hoisted(() => ({ fetchSpy: vi.fn() }))
mockNuxtImport('$fetch', () => fetchSpy)

const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const CURRENT_DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d1'
const OTHER_DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d2'

const SESSION = {
  user: { id: USER_ID, email: 'kamu@email.com' },
  device: { id: CURRENT_DEVICE_ID, name: 'Chrome di Linux' },
  expiresAt: '2026-12-31T09:00:00.000Z',
}

function device(overrides: Partial<AccountDevice> = {}): AccountDevice {
  return {
    id: OTHER_DEVICE_ID,
    name: 'Pixel di Jakarta',
    platform: 'android',
    createdAt: '2026-10-01T00:00:00.000Z',
    lastSeenAt: '2026-10-22T09:15:00.000Z',
    lastIpCity: 'Jakarta',
    revokedAt: null,
    isCurrent: false,
    ...overrides,
  }
}

let mounted: VueWrapper | null = null

async function open(devices: AccountDevice[]): Promise<VueWrapper> {
  mounted = await mountSuspended(SecurityPanel)
  useState<'set' | 'unset'>('accountPasskey').value = 'set'
  useState<'set' | 'unset'>('accountRecovery').value = 'unset'
  useState<'idle' | 'loading' | 'ready' | 'error'>('accountStatus').value = 'ready'
  useState<string | null>('accountError').value = null
  useState<AccountDevice[]>('accountDevices').value = devices
  await nextTick()

  return mounted
}

function button(wrapper: VueWrapper, label: RegExp): ReturnType<VueWrapper['find']> {
  return wrapper.findAll('button').find((item) => label.test(item.text()))!
}

beforeEach(() => {
  fetchSpy.mockReset()
  fetchSpy.mockResolvedValue(undefined)
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
  ])
  useState('auth-session').value = SESSION
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('dialog halaman Akun', () => {
  it('"Tambah perangkat" membuka pilihan peran perangkat', async () => {
    const wrapper = await open([])

    await button(wrapper, /^tambah perangkat$/i).trigger('click')
    await nextTick()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toMatch(/perangkat ini yang baru/i)
    expect(wrapper.text()).toMatch(/sudah punya kunci/i)
  })

  it('"Hapus akun" membuka konfirmasi email + kode, dan tombol hapus mati sampai cocok', async () => {
    const wrapper = await open([])

    await button(wrapper, /^hapus akun$/i).trigger('click')
    await nextTick()

    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toMatch(/tidak bisa dibatalkan/i)

    const submit = dialog.findAll('button').find((item) => /hapus akun permanen/i.test(item.text()))
    expect(submit?.attributes('disabled')).toBeDefined()
  })

  it('perangkat yang sudah dicabut tidak menawarkan "Cabut akses" lagi', async () => {
    const wrapper = await open([
      device({ revokedAt: '2026-10-20T08:00:00.000Z' }),
      device({ id: CURRENT_DEVICE_ID, isCurrent: true }),
    ])

    const revoke = wrapper.findAll('button').filter((item) => item.text() === 'Cabut akses')
    expect(revoke).toHaveLength(0)

    // Perangkat aktif tetap di atas; baris yang dicabut ditandai, bukan disembunyikan (jejak audit).
    const rows = wrapper.findAll('.device').map((row) => row.text())
    expect(rows.some((text) => /sudah dicabut/i.test(text))).toBe(true)
  })
})
