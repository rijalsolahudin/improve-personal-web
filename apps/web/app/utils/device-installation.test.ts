import { uuidSchema } from '@improve-personal/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  INSTALLATION_ID_STORAGE_KEY,
  currentInstallationId,
  resetInstallationIdForTest,
} from './device-installation'

/** Nilai sah yang "sudah ada" di perangkat (bentuk UUIDv7 seperti generator repo). */
const STORED_ID = '018f2b3c-4d5e-7f80-9abc-def012345678'

beforeEach(() => {
  localStorage.clear()
  resetInstallationIdForTest()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('currentInstallationId', () => {
  it('storage kosong: membuat UUID yang sah lalu menyimpannya', () => {
    const id = currentInstallationId()

    expect(uuidSchema.safeParse(id).success).toBe(true)
    expect(localStorage.getItem(INSTALLATION_ID_STORAGE_KEY)).toBe(id)
  })

  it('idempoten: panggilan berikutnya memakai id yang sama (request OTP + verify = satu instalasi)', () => {
    const first = currentInstallationId()

    expect(currentInstallationId()).toBe(first)
    expect(localStorage.getItem(INSTALLATION_ID_STORAGE_KEY)).toBe(first)
  })

  it('nilai tersimpan yang sah dipakai ulang, bukan diganti', () => {
    localStorage.setItem(INSTALLATION_ID_STORAGE_KEY, STORED_ID)

    expect(currentInstallationId()).toBe(STORED_ID)
    expect(localStorage.getItem(INSTALLATION_ID_STORAGE_KEY)).toBe(STORED_ID)
  })

  it.each([
    ['JSON terpotong', '{"id":"018f2b3c'],
    ['string bukan UUID', 'bukan-uuid'],
    ['string kosong', ''],
  ])('nilai rusak (%s): tetap menghasilkan id tanpa menimpa storage', (_label, raw) => {
    localStorage.setItem(INSTALLATION_ID_STORAGE_KEY, raw)

    const id = currentInstallationId()

    expect(uuidSchema.safeParse(id).success).toBe(true)
    // Sampahnya dibiarkan: id instalasi tidak cukup penting untuk menghapus jejak storage rusak.
    expect(localStorage.getItem(INSTALLATION_ID_STORAGE_KEY)).toBe(raw)
    // Stabil dalam satu sesi halaman walau tidak tersimpan.
    expect(currentInstallationId()).toBe(id)
  })

  it('storage melempar (mode privat): tetap menghasilkan id, bukan error', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage diblokir')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage diblokir')
    })

    expect(() => currentInstallationId()).not.toThrow()
    expect(uuidSchema.safeParse(currentInstallationId()).success).toBe(true)
  })

  it('SSR (tanpa window): tidak menyentuh storage', () => {
    vi.stubGlobal('window', undefined)

    const id = currentInstallationId()

    expect(uuidSchema.safeParse(id).success).toBe(true)
    expect(localStorage.getItem(INSTALLATION_ID_STORAGE_KEY)).toBeNull()
  })

  it('dua instalasi (storage berbeda) menghasilkan id berbeda', () => {
    const first = currentInstallationId()

    localStorage.clear()
    resetInstallationIdForTest()
    const second = currentInstallationId()

    expect(second).not.toBe(first)
  })

  it('key-nya memakai prefix penyimpanan app, jadi tidak tersembunyi dari pembersihan app', () => {
    expect(INSTALLATION_ID_STORAGE_KEY.startsWith('ip-')).toBe(true)
  })
})
