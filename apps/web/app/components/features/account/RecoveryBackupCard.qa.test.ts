import 'fake-indexeddb/auto'

import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { keyDatabaseName } from '~/utils/storage/session'
import { createWebKeyStore } from '~/utils/crypto/key-store'
import { parseBackupCode } from '~/utils/account/backup-code'
import { resetLocalDataSessionForTest } from '~/composables/useLocalData'

import RecoveryBackupCard from './RecoveryBackupCard.vue'

/**
 * Kartu "Backup kode pemulihan" (AC T22). Yang dibuktikan di sini adalah yang bisa dilihat user:
 * kode yang tampil adalah SATU string `iprk1.*` berisi 24 kata + envelope, aksinya Salin / Bagikan
 * (share sheet OS, bukan OAuth) / Unduh .txt, dan "Sudah saya simpan" menaruh envelope di slot
 * `recovery` perangkat sehingga statusnya berubah.
 *
 * Sesi data lokal dibuka sungguhan (fake-indexeddb) supaya kriptonya asli - jaringan hanya di-mock di
 * batas `$fetch` (daftar envelope saat perangkat pertama).
 */

const { fetchSpy } = vi.hoisted(() => ({ fetchSpy: vi.fn() }))
mockNuxtImport('$fetch', () => fetchSpy)

const USER_ID = '018f2c4e-0000-7000-8000-0000000000aa'
const DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000dd'

const SESSION = {
  user: { id: USER_ID, email: 'kamu@email.com' },
  device: { id: DEVICE_ID, name: 'Chrome di Linux' },
  expiresAt: '2026-12-31T09:00:00.000Z',
}

// Runtime test tidak punya syarat browser yang diperiksa `openLocalDataSession`. Web Locks cukup
// diteruskan apa adanya: yang diuji adalah alur kartu, bukan implementasi kunci browser.
Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
Object.defineProperty(globalThis.navigator, 'locks', {
  value: { request: (_name: string, work: () => unknown) => work() },
  configurable: true,
})

const shareSpy = vi.fn(async (_data?: ShareData) => {})
const clipboardSpy = vi.fn(async () => {})
Object.defineProperty(globalThis.navigator, 'share', { value: shareSpy, configurable: true })
Object.defineProperty(globalThis.navigator, 'clipboard', {
  value: { writeText: clipboardSpy },
  configurable: true,
})

let mounted: VueWrapper | null = null

async function mount(): Promise<VueWrapper> {
  mounted = await mountSuspended(RecoveryBackupCard)
  return mounted
}

async function createCode(wrapper: VueWrapper): Promise<string> {
  const button = wrapper.findAll('button').find((item) => item.text() === 'Buat kode pemulihan')
  expect(button, 'tombol buat kode pemulihan tidak ada').toBeDefined()

  await button?.trigger('click')
  await vi.waitFor(
    () => {
      expect(wrapper.find('.code').exists()).toBe(true)
    },
    { timeout: 20_000, interval: 100 },
  )

  return wrapper.find('.code').text()
}

beforeEach(() => {
  fetchSpy.mockReset()
  fetchSpy.mockResolvedValue({ data: { envelopes: [] } })
  shareSpy.mockClear()
  clipboardSpy.mockClear()

  resetLocalDataSessionForTest()
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
  useState('auth-session').value = SESSION
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
  resetLocalDataSessionForTest()
})

describe('kartu backup kode pemulihan', () => {
  it('kode = 24 kata + envelope dalam satu string `iprk1.*`', async () => {
    const wrapper = await mount()
    const code = await createCode(wrapper)

    expect(code.startsWith('iprk1.')).toBe(true)

    const parsed = await parseBackupCode(code)
    expect(parsed.words.split(' ')).toHaveLength(24)
    expect(typeof parsed.envelope.wrappedKey).toBe('string')
    expect(parsed.envelope.wrappedKey.length).toBeGreaterThan(32)
  })

  it('menyediakan Salin, Bagikan (share sheet OS) dan Unduh .txt', async () => {
    const wrapper = await mount()
    const code = await createCode(wrapper)

    const labels = wrapper.findAll('button').map((button) => button.text())
    expect(labels).toContain('Salin')
    expect(labels).toContain('Unduh .txt')
    expect(labels).toContain('Bagikan')

    const copy = wrapper.findAll('button').find((button) => button.text() === 'Salin')
    await copy?.trigger('click')
    expect(clipboardSpy).toHaveBeenCalledWith(code)

    const share = wrapper.findAll('button').find((button) => button.text() === 'Bagikan')
    const callsBeforeShare = fetchSpy.mock.calls.length
    await share?.trigger('click')
    expect(shareSpy).toHaveBeenCalledTimes(1)
    // Isi share = kode itu sendiri; tidak ada OAuth dan tidak ada request tambahan ke server kita.
    expect(shareSpy.mock.calls[0]?.[0]).toMatchObject({ text: code })
    expect(fetchSpy).toHaveBeenCalledTimes(callsBeforeShare)
  })

  it('"Sudah saya simpan" menaruh envelope di slot recovery dan status jadi sudah disimpan', async () => {
    const wrapper = await mount()
    await createCode(wrapper)

    await wrapper.find('.confirm').trigger('click')
    const finish = wrapper.findAll('button').find((button) => button.text() === 'Selesai')
    expect(finish?.attributes('disabled')).toBeUndefined()

    await finish?.trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('sudah disimpan')
    })

    const keyStore = createWebKeyStore({ databaseName: keyDatabaseName(USER_ID) })
    const material = await keyStore.get('recovery')
    expect(material).not.toBeNull()
    expect(material?.kind).toBe('recovery-envelope')
  })

  it('kegagalan membuat kode diberitahukan ke user (bukan diam)', async () => {
    // Tanpa sesi, data lokal tidak bisa dibuka - persis kondisi "storage diblokir / konteks tidak aman".
    useState('auth-session').value = null
    const wrapper = await mount()

    const button = wrapper.findAll('button').find((item) => item.text() === 'Buat kode pemulihan')
    await button?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toMatch(/tidak bisa|gagal|error/i)
  })

  it('kode pemulihan tidak ikut masuk state SSR (`useState`)', async () => {
    const wrapper = await mount()
    const code = await createCode(wrapper)

    expect(JSON.stringify(wrapper.vm.$nuxt.payload.state)).not.toContain(code)
    expect(JSON.stringify(wrapper.vm.$nuxt.payload.state)).not.toContain('iprk1.')
  })
})
