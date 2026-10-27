import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import type { KeySlotLocal, SecureKeyMaterial, SecureKeyStore } from '@improve-personal/core'

import type { JsonFetch } from '~/utils/http/json-fetch'

import { useDevicePairing } from './useDevicePairing'

/**
 * Alur tambah perangkat dua QR, diuji dengan KRIPTO ASLI (`libsodium`): perangkat lama membungkus kunci
 * utama ke public key perangkat baru, perangkat baru membukanya dengan private key yang tidak pernah
 * keluar. Jaringan di-mock di batas (`JsonFetch`), seperti gateway lain.
 *
 * Yang dibuktikan: kunci utama benar-benar berpindah, id perangkat yang dituju benar, dan klaim kedua
 * ditolak (sekali pakai) - bukan hanya "tombolnya ada".
 */

// happy-dom tidak punya Web Locks, padahal `saveDeviceUnlock` mewajibkannya (cek-lalu-tulis slot device
// atomik lintas tab, #113). Diteruskan apa adanya: yang diuji alur pairing, bukan lock browser.
Object.defineProperty(globalThis.navigator, 'locks', {
  value: { request: (_name: string, work: () => unknown) => work() },
  configurable: true,
})

const NOW = Date.parse('2026-10-23T09:00:00.000Z')
const TTL_MS = 120_000

const USER_ID = '018f2c4e-0000-7000-8000-0000000000aa'
const NEW_DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d2'
const MASTER_KEY = new Uint8Array(32).fill(7)

const SESSION = {
  user: { id: USER_ID, email: 'kamu@email.com' },
  device: { id: NEW_DEVICE_ID, name: 'Perangkat baru' },
  expiresAt: '2026-12-31T09:00:00.000Z',
}

function memoryKeyStore(): SecureKeyStore {
  const slots = new Map<KeySlotLocal, SecureKeyMaterial>()

  return {
    has: async (slot) => slots.has(slot),
    put: async (slot, material) => {
      slots.set(slot, material)
    },
    get: async (slot) => slots.get(slot) ?? null,
    remove: async (slot) => {
      slots.delete(slot)
    },
  }
}

type StoredTransfer = {
  readonly id: string
  readonly targetDeviceId: string
  readonly blob: string
  readonly expiresAt: string
  claimed: boolean
}

/** Relay palsu yang meniru aturan server: TTL 120 detik, klaim atomik, kegagalan `NOT_FOUND`. */
function createRelay() {
  const transfers = new Map<string, StoredTransfer>()

  const request: JsonFetch = async (path, init) => {
    if (path === '/v1/keys/transfer' && init.method === 'POST') {
      const body = init.body as { targetDeviceId: string; blob: string }
      const id = `${'A'.repeat(21)}${transfers.size}`

      transfers.set(id, {
        id,
        targetDeviceId: body.targetDeviceId,
        blob: body.blob,
        expiresAt: new Date(NOW + TTL_MS).toISOString(),
        claimed: false,
      })

      return { data: { id, expiresAt: new Date(NOW + TTL_MS).toISOString() } }
    }

    const claimPath = /^\/v1\/keys\/transfer\/(.+)$/.exec(path)
    if (claimPath !== null && init.method === 'POST') {
      const transfer = transfers.get(decodeURIComponent(claimPath[1] ?? ''))
      if (transfer === undefined || transfer.claimed) {
        throw { status: 404, data: { error: { code: 'NOT_FOUND', message: 'tidak ditemukan' } } }
      }

      transfer.claimed = true
      return { data: { blob: transfer.blob } }
    }

    throw new Error(`request tak terduga: ${init.method} ${path}`)
  }

  return { request, transfers }
}

beforeEach(() => {
  clearNuxtState(['auth-session', 'auth-session-pending', 'auth-session-error', 'now'])
  useState('auth-session').value = SESSION
  useState<number>('now').value = NOW
})

describe('tambah perangkat lewat QR', () => {
  it('memindahkan kunci utama dari perangkat lama ke perangkat baru (dua QR, kripto asli)', async () => {
    const relay = createRelay()
    const keyStore = memoryKeyStore()
    let paired = false

    const newDevice = useDevicePairing({
      request: relay.request,
      keyStore: () => keyStore,
      onPaired: async () => {
        paired = true
      },
    })

    await newDevice.startAsNewDevice()
    expect(newDevice.step.value).toBe('request')

    const requestQr = newDevice.qrValue.value ?? ''
    expect(JSON.parse(requestQr).deviceId).toBe(NEW_DEVICE_ID)

    const existingDevice = useDevicePairing({
      request: relay.request,
      masterKey: async (work) => work(MASTER_KEY),
    })
    await existingDevice.pairFromRequest(requestQr)
    expect(existingDevice.step.value).toBe('response')

    const stored = [...relay.transfers.values()][0]
    expect(stored?.targetDeviceId).toBe(NEW_DEVICE_ID)
    // Blob di server bukan kunci utama polos: yang lewat hanya sealed box.
    expect(stored?.blob).not.toBe('')

    await newDevice.claimResponse(existingDevice.qrValue.value ?? '')
    await flushPromises()

    expect(newDevice.error.value).toBeNull()
    expect(newDevice.step.value).toBe('done')
    expect(paired).toBe(true)
    expect(await keyStore.has('device')).toBe(true)
  })

  it('perangkat baru yang kuncinya dibuat otomatis boleh memakai kunci hasil transfer', async () => {
    // Kondisi nyata dari QA: akun belum punya envelope passkey, jadi `openLocalDataSession` membuat kunci
    // sendiri (slot `device` terisi) sebelum user sempat menekan "tambah perangkat". Tanpa pengecualian,
    // klaim selalu ditolak `alreadyPaired` dan alur QR tidak pernah bisa dipakai di perangkat baru.
    const relay = createRelay()
    const keyStore = memoryKeyStore()
    await keyStore.put('device', { kind: 'device-aes-kw', handle: {} })
    let result: { replacedKey: boolean } | null = null

    const newDevice = useDevicePairing({
      request: relay.request,
      keyStore: () => keyStore,
      canReplaceDeviceKey: async () => true,
      onPaired: async (paired) => {
        result = paired
      },
    })

    await newDevice.startAsNewDevice()
    const existingDevice = useDevicePairing({
      request: relay.request,
      masterKey: async (work) => work(MASTER_KEY),
    })
    await existingDevice.pairFromRequest(newDevice.qrValue.value ?? '')

    await newDevice.claimResponse(existingDevice.qrValue.value ?? '')
    await flushPromises()

    expect(newDevice.error.value).toBeNull()
    expect(newDevice.step.value).toBe('done')
    // Pemanggil perlu tahu kuncinya DIGANTI: sesi lokal yang hidup masih memegang kunci data yang lama.
    expect(result).toEqual({ replacedKey: true })
    expect(await keyStore.has('device')).toBe(true)
  })

  it('menolak menimpa kunci perangkat yang sudah menyimpan data', async () => {
    const relay = createRelay()
    const keyStore = memoryKeyStore()
    await keyStore.put('device', { kind: 'device-aes-kw', handle: {} })

    const newDevice = useDevicePairing({
      request: relay.request,
      keyStore: () => keyStore,
      canReplaceDeviceKey: async () => false,
    })

    await newDevice.startAsNewDevice()
    const existingDevice = useDevicePairing({
      request: relay.request,
      masterKey: async (work) => work(MASTER_KEY),
    })
    await existingDevice.pairFromRequest(newDevice.qrValue.value ?? '')

    await newDevice.claimResponse(existingDevice.qrValue.value ?? '')

    expect(newDevice.error.value).toBe('alreadyPaired')
    // Klaim itu sekali pakai: penolakan di sisi perangkat baru tidak boleh membakar kiriman perangkat lain.
    expect([...relay.transfers.values()][0]?.claimed).toBe(false)
  })

  it('menolak klaim kedua untuk QR yang sama (sekali pakai)', async () => {
    const relay = createRelay()
    const keyStore = memoryKeyStore()
    const newDevice = useDevicePairing({ request: relay.request, keyStore: () => keyStore })

    await newDevice.startAsNewDevice()
    const existingDevice = useDevicePairing({
      request: relay.request,
      masterKey: async (work) => work(MASTER_KEY),
    })
    await existingDevice.pairFromRequest(newDevice.qrValue.value ?? '')
    const responseQr = existingDevice.qrValue.value ?? ''

    await newDevice.claimResponse(responseQr)
    expect(newDevice.step.value).toBe('done')

    // Perangkat lain (instance baru) mencoba memakai QR yang sama.
    const second = useDevicePairing({ request: relay.request, keyStore: () => memoryKeyStore() })
    await second.startAsNewDevice()
    await second.claimResponse(responseQr)
    expect(second.error.value).toBe('expired')
  })

  it('menolak QR asing tanpa mengirim apa pun ke server', async () => {
    const relay = createRelay()
    const existingDevice = useDevicePairing({
      request: relay.request,
      masterKey: async (work) => work(MASTER_KEY),
    })

    await existingDevice.pairFromRequest('{"v":1,"publicKey":"","nonce":""}')
    expect(existingDevice.error.value).toBe('qr')
    expect(relay.transfers.size).toBe(0)
  })

  it('menjelaskan bahwa sesi belum aktif, bukan gagal diam-diam', async () => {
    useState('auth-session').value = null
    const pairing = useDevicePairing({ request: createRelay().request })

    await pairing.startAsNewDevice()
    expect(pairing.error.value).toBe('noSession')
    expect(pairing.qrValue.value).toBeNull()
  })

  it('QR kedaluwarsa setelah 2 menit dan tombolnya bisa membuat QR baru', async () => {
    const pairing = useDevicePairing({
      request: createRelay().request,
      keyStore: () => memoryKeyStore(),
    })

    await pairing.startAsNewDevice()
    const first = pairing.qrValue.value
    expect(pairing.isExpired.value).toBe(false)
    expect(pairing.secondsLeft.value).toBe(120)

    useState<number>('now').value = NOW + TTL_MS
    expect(pairing.isExpired.value).toBe(true)
    expect(pairing.secondsLeft.value).toBe(0)

    await pairing.startAsNewDevice()
    expect(pairing.isExpired.value).toBe(false)
    expect(pairing.qrValue.value).not.toBe(first)
  })
})
