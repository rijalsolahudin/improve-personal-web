import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AccountDevice } from '~/composables/useAccount'

import SecurityPanel from './SecurityPanel.vue'

// Jaringan di-mock di BATAS (`$fetch`), bukan composable-nya: halaman memakai `useAccount` asli.
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

async function mount(): Promise<VueWrapper> {
  mounted = await mountSuspended(SecurityPanel)
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
  ])
  // Sesi dibaca dari state bersama, jadi halaman tidak perlu request tambahan saat mount.
  useState('auth-session').value = SESSION
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('halaman Akun & perangkat', () => {
  it('menampilkan daftar perangkat: nama, waktu aktif terakhir, dan lokasi dari IP', async () => {
    const wrapper = await mount()
    await setAccountState([device(), device({ id: CURRENT_DEVICE_ID, isCurrent: true })])

    const rows = wrapper.findAll('.device')
    expect(rows).toHaveLength(2)

    const text = wrapper.text()
    expect(text).toContain('Pixel di Jakarta')
    // Waktu tampil dalam bahasa sehari-hari; nilai persisnya tetap ada di atribut `datetime`.
    expect(wrapper.find('time[datetime="2026-10-22T09:15:00.000Z"]').exists()).toBe(true)
    expect(text).not.toContain('2026-10-22T09:15:00.000Z')
    expect(text).toContain('Jakarta')
    expect(text).toContain('perangkat ini')
  })

  it('logout jarak jauh: tombol cabut hanya untuk perangkat lain dan memanggil DELETE perangkat itu', async () => {
    const wrapper = await mount()
    await setAccountState([device(), device({ id: CURRENT_DEVICE_ID, isCurrent: true })])

    const revokeButtons = wrapper
      .findAll('button')
      .filter((button) => button.text() === 'Cabut akses')
    expect(revokeButtons).toHaveLength(1)

    await revokeButtons[0]?.trigger('click')
    await flushPromises()

    expect(fetchSpy).toHaveBeenCalledWith(`/v1/devices/${OTHER_DEVICE_ID}`, { method: 'DELETE' })
  })

  it('perangkat yang sudah dicabut tidak ditampilkan seolah masih login', async () => {
    // Server mengembalikan perangkat yang sudah di-revoke sebagai jejak audit (kontrak `DeviceDto`
    // sengaja tidak memfilternya). PRD F15: daftar ini adalah "perangkat yang login sekarang" - jadi
    // baris yang dicabut harus ditandai, bukan tampil sama seperti perangkat aktif.
    const wrapper = await mount()
    await setAccountState([
      device({ revokedAt: '2026-10-20T08:00:00.000Z', lastSeenAt: '2026-10-19T08:00:00.000Z' }),
    ])

    const row = wrapper.find('.device')
    expect(row.text()).toMatch(/dicabut|tidak aktif|sudah keluar/i)
  })
})

describe('acceptance criteria T22 yang belum terlihat di UI', () => {
  it('halaman Akun menyediakan "Tambah perangkat" lewat QR (kedaluwarsa ≤ 2 menit, sekali pakai)', async () => {
    const wrapper = await mount()
    await setAccountState([])

    expect(wrapper.text()).toMatch(/tambah perangkat/i)
    expect(wrapper.text()).toMatch(/pindai|scan|qr/i)
  })

  it('halaman Akun menyediakan hapus akun dengan konfirmasi email + OTP ulang', async () => {
    const wrapper = await mount()
    await setAccountState([])

    const deleteButton = wrapper
      .findAll('button')
      .find((button) => /hapus akun/i.test(button.text()))

    expect(deleteButton, 'tombol "Hapus akun" tidak ada di halaman Akun').toBeDefined()
  })
})
