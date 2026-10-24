import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocalDataState } from '~/composables/useLocalData'
import { resetPomodoroHistoryForTest } from '~/composables/usePomodoro'

import KeyRecoveryGate from './KeyRecoveryGate.vue'

/**
 * QA T22 putaran 3 - BUG-9: alur dua QR harus bisa DIMULAI dari perangkat baru.
 *
 * Test `KeyRecoveryGate.qr.qa.test.ts` hanya memastikan tombolnya ada. Di sini tombolnya benar-benar
 * diklik, dan yang diperiksa adalah janji yang lebih kuat:
 *
 * 1. panel QR permintaan benar-benar tampil (SVG + judul + hitung mundur `m:ss`), bukan cuma teks tombol;
 * 2. layar pulih TETAP tidak bisa ditutup selama panel QR terbuka (Esc & klik latar diabaikan) - kalau
 *    gate bisa ditutup, perangkat baru kembali ke aplikasi kosong;
 * 3. tombol "Kembali ke pembukaan kunci" mengembalikan form kode/berkas tanpa menutup gate.
 *
 * Kripto pairing memakai libsodium asli; yang di-mock hanya sesi (state Nuxt), bukan composable internal.
 */

const LOCKED_STATE: LocalDataState = {
  status: 'locked',
  isFreshKey: false,
  deviceId: null,
  userId: '018f2c4e-0000-7000-8000-00000000000a',
  error: null,
}

const SESSION = {
  user: { id: '018f2c4e-0000-7000-8000-00000000000a', email: 'kamu@email.com' },
  device: { id: '018f2c4e-0000-7000-8000-0000000000d2', name: 'Perangkat baru' },
  expiresAt: '2026-12-31T09:00:00.000Z',
}

let mounted: VueWrapper | null = null

function buttonByText(wrapper: VueWrapper, pattern: RegExp) {
  return wrapper.findAll('button').find((button) => pattern.test(button.text()))
}

beforeEach(() => {
  // Pomodoro menghidrasi riwayat begitu `auth-session` terisi dan ikut membuka `localData`; di test,
  // lingkungan storage tidak lengkap sehingga status `locked` buatan test tertimpa `error`. Matikan
  // watcher app-level itu: yang diuji di sini alur pairing, bukan Pomodoro.
  resetPomodoroHistoryForTest()
  clearNuxtState(['localData', 'auth-session', 'auth-session-pending', 'auth-session-error', 'now'])
  useState('auth-session').value = SESSION
  useState<LocalDataState>('localData').value = LOCKED_STATE
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('layar pulih kunci: membuka alur QR dari perangkat baru', () => {
  it('menampilkan QR permintaan berformat m:ss, tetap tidak bisa ditutup, dan bisa kembali', async () => {
    const wrapper = await mountSuspended(KeyRecoveryGate)
    mounted = wrapper
    await nextTick()

    const addDevice = buttonByText(wrapper, /tambah perangkat lewat qr/i)
    expect(addDevice, 'opsi "tambah perangkat lewat QR" tidak ada di layar pemulih').toBeDefined()
    await addDevice?.trigger('click')

    await vi.waitFor(
      () => {
        expect(wrapper.find('svg.qr').exists()).toBe(true)
      },
      { timeout: 30_000, interval: 100 },
    )
    await flushPromises()

    // Panel QR menggantikan form pembuka kunci, bukan menumpuk di bawahnya.
    expect(wrapper.text()).toContain('Tampilkan QR ini di perangkat lama')
    expect(wrapper.find('#recovery-code').exists()).toBe(false)

    // Hitung mundur `m:ss` (2:00 .. 1:59 ..) - bukan `0:120` yang terbaca seperti angka rusak.
    const countdown = /berlaku (\d+):([0-5]\d)/i.exec(wrapper.text())
    expect(countdown, 'hitung mundur QR tidak berformat m:ss').not.toBeNull()
    const total = Number(countdown?.[1]) * 60 + Number(countdown?.[2])
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThanOrEqual(120)

    // Gate tetap non-dismissible selama panel QR terbuka.
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    await wrapper.find('.backdrop').trigger('click')
    await nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)

    // Kembali ke pilihan pembuka kunci; gate tidak ikut tertutup.
    const back = buttonByText(wrapper, /kembali ke pembukaan kunci/i)
    expect(back).toBeDefined()
    await back?.trigger('click')
    await nextTick()
    // Form pembuka kunci datang lewat `import()` (tidak lagi di bundel awal `/app`): tunggu chunk-nya.
    await vi.waitFor(
      () => {
        expect(wrapper.find('#recovery-code').exists()).toBe(true)
      },
      { timeout: 30_000, interval: 50 },
    )

    expect(wrapper.find('#recovery-code').exists()).toBe(true)
    expect(wrapper.find('svg.qr').exists()).toBe(false)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  })
})
