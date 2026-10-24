import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TECH_IDENTITY } from '#shared/tech-identity'

import {
  AUTH_SESSION_CHANNEL_NAME,
  AUTH_SESSION_SIGNAL,
  AUTH_SESSION_SIGNAL_KEY,
  announceSessionChange,
  resetSessionSyncForTest,
  subscribeSessionChange,
} from './session-sync'

/**
 * Kanal antar-tab (sisa H1 security review #76).
 *
 * Yang dikunci di sini: pesannya TIDAK membawa data user, tab tidak memicu dirinya sendiri, transport
 * cadangan (`storage` event) bekerja di browser tanpa `BroadcastChannel`, dan seluruh jalur aman
 * dipanggil saat tidak ada `window` (SSR) maupun `BroadcastChannel`.
 */

const otherTabs: BroadcastChannel[] = []

/** "Tab lain": instance kanal lain di origin yang sama. */
function otherTab(): BroadcastChannel {
  const channel = new BroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
  otherTabs.push(channel)
  return channel
}

beforeEach(() => {
  resetSessionSyncForTest()
  localStorage.clear()
})

afterEach(() => {
  resetSessionSyncForTest()
  for (const channel of otherTabs.splice(0)) channel.close()
  vi.unstubAllGlobals()
})

describe('kanal identitas sesi: BroadcastChannel', () => {
  it('nama kanal & key memakai prefix teknis ip-, bukan nama brand', () => {
    expect(AUTH_SESSION_CHANNEL_NAME.startsWith(TECH_IDENTITY.storagePrefix)).toBe(true)
    expect(AUTH_SESSION_SIGNAL_KEY.startsWith(TECH_IDENTITY.storagePrefix)).toBe(true)
  })

  it('sinyal yang dikirim tidak membawa data user - hanya penanda', async () => {
    const receiver = otherTab()
    const received: unknown[] = []
    receiver.addEventListener('message', (event) => received.push(event.data))

    announceSessionChange()

    await vi.waitFor(() => expect(received).toHaveLength(1))
    expect(received[0]).toBe(AUTH_SESSION_SIGNAL)
  })

  it('sinyal dari tab lain diteruskan ke pendengar', async () => {
    const listener = vi.fn()
    subscribeSessionChange(listener)

    otherTab().postMessage(AUTH_SESSION_SIGNAL)

    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
  })

  it('tab tidak memicu dirinya sendiri saat ia yang mengubah sesi', async () => {
    const listener = vi.fn()
    subscribeSessionChange(listener)

    announceSessionChange()

    // Beri kesempatan pesan terkirim; instance yang mem-posting tidak boleh menerima pesannya sendiri.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(listener).not.toHaveBeenCalled()
  })

  it('berhenti mendengarkan setelah unsubscribe', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSessionChange(listener)
    unsubscribe()

    otherTab().postMessage(AUTH_SESSION_SIGNAL)

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('kanal identitas sesi: fallback storage event', () => {
  beforeEach(() => {
    // Browser lama: tidak ada BroadcastChannel, jadi transport-nya `storage` event.
    vi.stubGlobal('BroadcastChannel', undefined)
  })

  it('sinyal tab lain lewat `storage` diteruskan ke pendengar', () => {
    const listener = vi.fn()
    subscribeSessionChange(listener)

    window.dispatchEvent(storageEvent(AUTH_SESSION_SIGNAL_KEY, '1700000000000'))

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('key lain dan penghapusan key bukan sinyal', () => {
    const listener = vi.fn()
    subscribeSessionChange(listener)

    window.dispatchEvent(storageEvent('ip-tema', 'ungu'))
    window.dispatchEvent(storageEvent(AUTH_SESSION_SIGNAL_KEY, null))

    expect(listener).not.toHaveBeenCalled()
  })

  it('mengirim sinyal menulis penanda ke localStorage', () => {
    announceSessionChange()

    expect(localStorage.getItem(AUTH_SESSION_SIGNAL_KEY)).not.toBeNull()
  })

  it('unsubscribe melepas listener `storage`', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSessionChange(listener)
    unsubscribe()

    window.dispatchEvent(storageEvent(AUTH_SESSION_SIGNAL_KEY, '1700000000001'))

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('kanal identitas sesi: lingkungan tanpa dukungan', () => {
  it('tanpa `window` (SSR): semua jalur no-op, bukan error', () => {
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('BroadcastChannel', undefined)

    expect(() => announceSessionChange()).not.toThrow()
    expect(() => subscribeSessionChange(() => undefined)()).not.toThrow()
  })
})

/** `StorageEvent` tidak selalu bisa dikonstruksi di lingkungan test; bentuknya cukup dua field. */
function storageEvent(key: string, newValue: string | null): Event {
  const event = new Event('storage')
  Object.defineProperties(event, {
    key: { value: key },
    newValue: { value: newValue },
  })
  return event
}
