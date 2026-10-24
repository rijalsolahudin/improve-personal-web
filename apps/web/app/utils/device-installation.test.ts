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
    const blocked = (): never => {
      throw new Error('storage diblokir')
    }
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: blocked,
      setItem: blocked,
    } as unknown as Storage)

    expect(() => currentInstallationId()).not.toThrow()
    expect(uuidSchema.safeParse(currentInstallationId()).success).toBe(true)
  })

  it('storage getter melempar (WebView/mode privat lama): id stabil dalam satu halaman', () => {
    // Bukan `getItem` yang melempar, tapi akses properti `window.localStorage` itu sendiri - kondisi
    // asli Safari private-mode lama dan WebView yang mematikan DOM storage.
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('DOM storage dimatikan')
    })

    const first = currentInstallationId()
    const second = currentInstallationId()

    expect(uuidSchema.safeParse(first).success).toBe(true)
    // Regresi BUG-1 QA #80: dulu tiap panggilan menghasilkan id baru, sehingga OTP request dan
    // verify mengaku dua instalasi dan menghabiskan dua slot perangkat untuk satu login.
    expect(second).toBe(first)
  })

  it('penulisan gagal (setter melempar): id tetap stabil untuk halaman ini', () => {
    const setItem = vi.fn(() => {
      throw new Error('kuota penuh')
    })
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: () => null,
      setItem,
    } as unknown as Storage)

    const first = currentInstallationId()
    const second = currentInstallationId()

    expect(uuidSchema.safeParse(first).success).toBe(true)
    expect(second).toBe(first)
    // Hanya dicoba sekali (saat id dibuat), tidak diulang tiap panggilan.
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('SSR (tanpa window): tidak menyentuh storage dan tidak memakai cache lintas request', () => {
    vi.stubGlobal('window', undefined)

    const first = currentInstallationId()
    const second = currentInstallationId()

    expect(uuidSchema.safeParse(first).success).toBe(true)
    // Sengaja TIDAK stabil: modul ini hidup di proses server yang dipakai banyak request, jadi cache
    // level modul di sana akan membagikan satu id ke semua user. Login berjalan di client dan hanya
    // client yang mengirim id ini, jadi server tidak butuh id yang sama antar panggilan.
    expect(second).not.toBe(first)
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
