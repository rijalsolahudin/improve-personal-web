import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ENCRYPTED_BACKUP_FORMAT } from '~/utils/account/encrypted-backup'
import type { LocalDataState } from '~/composables/useLocalData'

import KeyRecoveryGate from './KeyRecoveryGate.vue'

/**
 * Layar "buka datamu di perangkat ini": muncul hanya saat perangkat terkunci, tidak bisa ditutup, dan
 * selalu punya jalan keluar (logout). Kripto pembukaannya diuji di `utils/account/unlock.test.ts`.
 */
let mounted: VueWrapper | null = null

const SESSION = {
  user: { id: '018f2c4e-0000-7000-8000-00000000000a', email: 'kamu@email.com' },
  device: { id: '018f2c4e-0000-7000-8000-0000000000d2', name: 'Perangkat baru' },
  expiresAt: '2026-12-31T09:00:00.000Z',
}

/**
 * Dialog pemulihan merender form lewat `import()` (bukan di bundel awal `/app`). `flushPromises` saja
 * tidak cukup: chunk-nya resolve di tick berikutnya, jadi tunggu sampai elemennya benar-benar ada.
 */
async function waitForForm(): Promise<void> {
  // Batas longgar: di suite penuh ada ~165 worker, dan chunk form bisa tertinggal jauh di belakang
  // antrean transform. Yang diuji isinya, bukan kecepatan unduhnya.
  await vi.waitFor(
    () => {
      expect(mounted?.find('textarea').exists()).toBe(true)
    },
    { timeout: 30_000, interval: 50 },
  )
}

function setStatus(status: LocalDataState['status']): void {
  useState<LocalDataState>('localData').value = {
    status,
    isFreshKey: false,
    deviceId: null,
    userId: null,
    error: null,
  }
}

beforeEach(() => {
  clearNuxtState(['localData', 'auth-session', 'auth-session-pending', 'auth-session-error', 'now'])
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('layar pulih kunci', () => {
  it('muncul saat perangkat terkunci, dan hanya saat itu', async () => {
    mounted = await mountSuspended(KeyRecoveryGate)

    setStatus('ready')
    await nextTick()
    expect(mounted.find('[role="dialog"]').exists()).toBe(false)

    setStatus('locked')
    await nextTick()
    await waitForForm()
    expect(mounted.find('[role="dialog"]').exists()).toBe(true)
    expect(mounted.find('textarea').exists()).toBe(true)
  })

  it('tidak bisa ditutup dengan Esc, dan punya jalan keluar lewat logout', async () => {
    mounted = await mountSuspended(KeyRecoveryGate)
    setStatus('locked')
    await nextTick()
    await waitForForm()

    await mounted.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(mounted.find('[role="dialog"]').exists()).toBe(true)
    expect(mounted.text()).toContain('Keluar dari akun')
  })

  it('tombol kode pemulihan mati selama kodenya kosong', async () => {
    mounted = await mountSuspended(KeyRecoveryGate)
    setStatus('locked')
    await nextTick()
    await waitForForm()

    const submit = mounted.find('button[type="submit"]')
    expect(submit.attributes('disabled')).toBeDefined()

    await mounted.find('textarea').setValue('iprk1.abc')
    expect(submit.attributes('disabled')).toBeUndefined()
  })

  it('bisa membuka QR tambah perangkat tanpa membuka kunci dulu, lalu kembali ke form', async () => {
    // Perangkat baru tidak punya kode pemulihan dan tidak bisa membuka kunci; satu-satunya jalan masuk
    // yang praktis adalah QR dari perangkat lama. Halaman /app/akun ada di belakang dialog ini, jadi
    // tombolnya harus ada DI SINI (PRD F15).
    useState('auth-session').value = SESSION
    const wrapper = await mountSuspended(KeyRecoveryGate)
    mounted = wrapper
    setStatus('locked')
    await nextTick()
    await waitForForm()

    const addDevice = wrapper
      .findAll('button')
      .find((button) => /tambah perangkat lewat qr/i.test(button.text()))
    expect(addDevice, 'opsi "tambah perangkat lewat QR" tidak ada di layar pemulihan').toBeDefined()

    await addDevice?.trigger('click')
    await flushPromises()

    await vi.waitFor(
      () => {
        expect(wrapper.text()).toContain('Tampilkan QR ini di perangkat lama')
        expect(wrapper.find('svg.qr').exists()).toBe(true)
      },
      { timeout: 30_000, interval: 100 },
    )

    // Kembali ke pilihan pembuka kunci: gate tetap tidak bisa ditutup, jadi jalur lain tidak berubah.
    const back = wrapper
      .findAll('button')
      .find((button) => /kembali ke pembukaan kunci/i.test(button.text()))
    await back?.trigger('click')
    await nextTick()
    await waitForForm()

    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  })
  it('berkas terenkripsi meminta kata sandinya, dan bisa kembali ke kode biasa', async () => {
    mounted = await mountSuspended(KeyRecoveryGate)
    setStatus('locked')
    await nextTick()
    await waitForForm()

    const input = mounted.find('input[type="file"]')
    const file = new File([JSON.stringify({ format: ENCRYPTED_BACKUP_FORMAT })], 'cadangan.json', {
      type: 'application/json',
    })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await flushPromises()

    expect(mounted.find('textarea').exists()).toBe(false)
    const passphrase = mounted.find('input[type="password"]')
    expect(passphrase.exists()).toBe(true)

    const submit = mounted.find('button[type="submit"]')
    expect(submit.attributes('disabled')).toBeDefined()
    await passphrase.setValue('kata-sandi-panjang')
    expect(submit.attributes('disabled')).toBeUndefined()

    await mounted.find('button[type="button"].file').trigger('click')
    expect(mounted.find('textarea').exists()).toBe(true)
  })
})
