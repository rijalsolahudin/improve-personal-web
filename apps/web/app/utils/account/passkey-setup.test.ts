// @vitest-environment node
//
// Aturan onboarding "aktifkan Face ID/passkey".
//
// Ini satu-satunya gerbang antara user dan aplikasi, jadi salah di sini berarti salah satu dari dua:
// user ditahan padahal pembukanya sudah ada (menyebalkan), atau user dilewatkan padahal tidak punya
// jalan pulih sama sekali (kehilangan data permanen).
import { describe, expect, it } from 'vitest'

import { TECH_IDENTITY } from '#shared/tech-identity'

import {
  PASSKEY_UNAVAILABLE_HINT,
  PASSKEY_SKIP_STORAGE_KEY,
  passkeySkipStorageKey,
  readPasskeySkip,
  shouldForcePasskeyOnboarding,
} from './passkey-setup'

describe('shouldForcePasskeyOnboarding', () => {
  it('dipaksa kalau sesi siap dan passkey belum ada', () => {
    expect(shouldForcePasskeyOnboarding({ localDataStatus: 'ready', hasPasskey: false })).toBe(true)
  })

  it('TIDAK dipaksa kalau passkey sudah ada', () => {
    expect(shouldForcePasskeyOnboarding({ localDataStatus: 'ready', hasPasskey: true })).toBe(false)
  })

  it('tidak dipaksa saat data lokal belum siap - dialog yang tidak bisa diselesaikan lebih buruk', () => {
    for (const localDataStatus of ['idle', 'loading', 'error'] as const) {
      expect(shouldForcePasskeyOnboarding({ localDataStatus, hasPasskey: false })).toBe(false)
    }
  })

  it('passkey adalah SATU-SATUNYA pembuka yang diakui sekarang', () => {
    // Dulu ada 24 kata sebagai bentuk lain; dihapus dari UI karena membingungkan user. Kalau nanti ada
    // bentuk pembuka baru (mis. kode cadangan), dia harus masuk ke fungsi ini - bukan ditambahkan
    // sebagai jalur sendiri di komponen, karena itu membuat dua tempat yang bisa berbeda pendapat soal
    // "user sudah aman atau belum".
    expect(shouldForcePasskeyOnboarding({ localDataStatus: 'ready', hasPasskey: true })).toBe(false)
    expect(PASSKEY_UNAVAILABLE_HINT).toMatch(/passkey/)
  })
})

describe('penanda "lanjut tanpa passkey"', () => {
  function storageWith(entries: Record<string, string>): Pick<Storage, 'getItem' | 'setItem'> {
    const values = new Map(Object.entries(entries))
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value)
      },
    }
  }

  const USER = '018f2c4e-0000-7000-8000-00000000000a'

  it('tidak dihormati kalau perangkat ini mendukung WebAuthn (nilai localStorage bisa dipaksa)', () => {
    const storage = storageWith({ [passkeySkipStorageKey(USER)]: '1' })

    expect(readPasskeySkip({ userId: USER, isSupported: true, storage })).toBe(false)
    expect(readPasskeySkip({ userId: USER, isSupported: false, storage })).toBe(true)
  })

  it('terikat pada akun, bukan pada browser', () => {
    const storage = storageWith({ [passkeySkipStorageKey(USER)]: '1' })

    expect(passkeySkipStorageKey(USER)).toContain(USER)
    expect(readPasskeySkip({ userId: USER, isSupported: false, storage })).toBe(true)
    expect(
      readPasskeySkip({
        userId: '018f2c4e-0000-7000-8000-00000000000b',
        isSupported: false,
        storage,
      }),
    ).toBe(false)
  })

  it('memakai prefiks yang ikut dibersihkan `clearAppStorage` saat logout/hapus akun', () => {
    // Versi sebelumnya memakai `ip.` sementara penyapu storage hanya mengenal `ip-`, jadi penanda
    // "lanjut tanpa passkey" tertinggal di perangkat - termasuk setelah akunnya dihapus.
    expect(PASSKEY_SKIP_STORAGE_KEY.startsWith(TECH_IDENTITY.storagePrefix)).toBe(true)
    expect(passkeySkipStorageKey(USER).startsWith(TECH_IDENTITY.storagePrefix)).toBe(true)
  })
})
