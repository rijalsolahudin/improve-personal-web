import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LocalDataState } from '~/composables/useLocalData'

import PasskeyOnboarding from './PasskeyOnboarding.vue'

/**
 * Onboarding "aktifkan Face ID/passkey": yang diuji adalah sifat yang diminta - dialognya TIDAK BISA
 * ditutup, dan ia hanya hilang setelah pembukanya ada.
 *
 * Test ini menyalakan state bersama yang dibaca komponen (`useState('localData')` dan
 * `useState('accountPasskey')`), bukan mem-mock composable internalnya. Komponen tetap mencoba membuka
 * data lokal sungguhan (dan gagal di environment test karena tidak ada IndexedDB), jadi state-nya
 * disetel ulang SETELAH mount untuk memeriksa perilaku tampilannya.
 *
 * Yang TIDAK diuji di sini: cerita WebAuthn-nya sendiri (butuh authenticator nyata). Di environment
 * test, `isWebAuthnAvailable()` false - dan justru itu jalur penting yang ikut terverifikasi: dialog
 * tidak boleh jadi jalan buntu.
 */
let mounted: VueWrapper | null = null

async function mount(): Promise<VueWrapper> {
  mounted = await mountSuspended(PasskeyOnboarding)
  return mounted
}

function setLocalDataState(state: LocalDataState): void {
  useState<LocalDataState>('localData').value = state
}

function setPasskey(status: 'set' | 'unset'): void {
  useState<'set' | 'unset'>('accountPasskey').value = status
}

const READY_STATE: LocalDataState = {
  status: 'ready',
  isFreshKey: true,
  deviceId: '018f2c4e-0000-7000-8000-0000000000d1',
  userId: '018f2c4e-0000-7000-8000-00000000000a',
  error: null,
}

beforeEach(() => {
  clearNuxtState(['localData', 'accountPasskey', 'accountStatus', 'accountError'])
  localStorage.removeItem('ip.passkeySetupSkipped')
})

afterEach(async () => {
  // Unmount sebelum state dibersihkan: wrapper yang masih hidup akan re-render dengan state yang sudah
  // hilang, dan itu muncul sebagai unhandled error (gerbang gagal) walaupun assertion-nya lulus.
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('onboarding passkey', () => {
  it('muncul saat sesi siap dan passkey belum ada', async () => {
    const wrapper = await mount()
    setLocalDataState(READY_STATE)
    setPasskey('unset')
    await nextTick()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Face ID/passkey')
  })

  it('TIDAK punya cara untuk ditutup: tanpa tombol tutup, Esc & klik latar tidak menghilangkannya', async () => {
    const wrapper = await mount()
    setLocalDataState(READY_STATE)
    setPasskey('unset')
    await nextTick()

    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')

    const labels = wrapper.findAll('button').map((button) => button.text().toLowerCase())
    expect(labels.join(' | ')).not.toMatch(/tutup|batal|nanti|close|cancel|later/)

    await dialog.trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)

    await wrapper.find('.backdrop').trigger('click')
    await nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  })

  it('hilang setelah passkey ada', async () => {
    const wrapper = await mount()
    setLocalDataState(READY_STATE)
    setPasskey('unset')
    await nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)

    setPasskey('set')
    await nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('tidak jadi jalan buntu saat perangkat tidak mendukung WebAuthn (tombol lanjut muncul)', async () => {
    const wrapper = await mount()
    setLocalDataState(READY_STATE)
    setPasskey('unset')
    await nextTick()

    // Environment test tidak punya authenticator, jadi jalur inilah yang aktif - dan itu memang yang
    // harus terjadi di perangkat yang tidak mendukung: user bisa keluar dari dialog, dengan peringatan.
    expect(wrapper.text()).toContain('belum bisa dipakai untuk passkey')
    expect(
      wrapper
        .findAll('button')
        .map((button) => button.text())
        .join(' | '),
    ).toContain('Lanjut tanpa passkey')
  })

  it('tidak menahan user saat data lokal belum bisa dibuka', async () => {
    const wrapper = await mount()
    setLocalDataState({
      status: 'error',
      isFreshKey: false,
      deviceId: null,
      userId: null,
      error: 'gagal',
    })
    setPasskey('unset')
    await nextTick()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
})
