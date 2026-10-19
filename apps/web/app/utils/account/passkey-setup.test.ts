// @vitest-environment node
//
// Aturan onboarding "aktifkan Face ID/passkey".
//
// Ini satu-satunya gerbang antara user dan aplikasi, jadi salah di sini berarti salah satu dari dua:
// user ditahan padahal pembukanya sudah ada (menyebalkan), atau user dilewatkan padahal tidak punya
// jalan pulih sama sekali (kehilangan data permanen).
import { describe, expect, it } from 'vitest'

import { PASSKEY_UNAVAILABLE_HINT, shouldForcePasskeyOnboarding } from './passkey-setup'

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
