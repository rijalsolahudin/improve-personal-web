// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  buildRequestQr,
  buildResponseQr,
  formatPairingCountdown,
  isPairingExpired,
  PairingQrError,
  parseRequestQr,
  parseResponseQr,
} from './pairing'

/**
 * Bentuk QR tambah perangkat. Yang dijaga di sini bukan kriptonya (itu di `transfer.ts`), tapi
 * **bentuk** yang dipertukarkan dua perangkat: QR dari aplikasi lain harus ditolak sebelum kunci utama
 * dibungkus untuk public key yang tidak dikenal.
 */

const DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d2'

function requestPayload(): string {
  return JSON.stringify({ v: 1, publicKey: 'cHVibGljLWtleQ==', nonce: 'bm9uY2U=' })
}

function expectReason(fn: () => unknown, reason: PairingQrError['reason']): void {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(PairingQrError)
    expect((error as PairingQrError).reason).toBe(reason)
    return
  }

  throw new Error(`QR seharusnya ditolak (${reason})`)
}

describe('QR permintaan perangkat baru', () => {
  it('membawa public key, nonce, dan id perangkat untuk perangkat lama', () => {
    const qr = buildRequestQr(requestPayload(), DEVICE_ID)
    const parsed = parseRequestQr(qr)

    expect(parsed.payload.publicKey).toBe('cHVibGljLWtleQ==')
    expect(parsed.payload.nonce).toBe('bm9uY2U=')
    expect(parsed.deviceId).toBe(DEVICE_ID)
  })

  it('menolak QR yang bukan JSON, versi asing, atau tanpa id perangkat yang sah', () => {
    expectReason(() => parseRequestQr('bukan qr'), 'format')
    expectReason(
      () => parseRequestQr(JSON.stringify({ v: 99, publicKey: 'a', nonce: 'b' })),
      'format',
    )
    expectReason(() => parseRequestQr(requestPayload()), 'device')
    expectReason(
      () =>
        parseRequestQr(JSON.stringify({ ...JSON.parse(requestPayload()), deviceId: 'bukan-uuid' })),
      'device',
    )
  })
})

describe('QR jawaban perangkat lama', () => {
  it('membawa id transfer dan waktu kedaluwarsa dari server', () => {
    const qr = buildResponseQr({ id: 'A'.repeat(22), expiresAt: '2026-10-23T09:02:00.000Z' })
    const parsed = parseResponseQr(qr)

    expect(parsed.id).toBe('A'.repeat(22))
    expect(parsed.expiresAtMs).toBe(Date.parse('2026-10-23T09:02:00.000Z'))
  })

  it('menolak id yang bisa ditebak (bukan 128-bit base64url) dan versi asing', () => {
    expectReason(
      () =>
        parseResponseQr(JSON.stringify({ v: 1, id: '123', expiresAt: '2026-10-23T09:02:00.000Z' })),
      'format',
    )
    expectReason(
      () =>
        parseResponseQr(
          JSON.stringify({ v: 2, id: 'A'.repeat(22), expiresAt: '2026-10-23T09:02:00.000Z' }),
        ),
      'version',
    )
  })
})

describe('kedaluwarsa QR', () => {
  it('dianggap habis tepat pada detik terakhir (server menolak klaim di titik itu)', () => {
    expect(isPairingExpired(1_000, 999)).toBe(false)
    expect(isPairingExpired(1_000, 1_000)).toBe(true)
    expect(isPairingExpired(1_000, 1_001)).toBe(true)
  })
})

describe('hitung mundur QR', () => {
  it('memakai m:ss, bukan menempelkan "0:" di depan detik', () => {
    // 120 detik sebelumnya tampil "0:120" - terbaca seperti angka rusak, padahal 2 menit.
    expect(formatPairingCountdown(120)).toBe('2:00')
    expect(formatPairingCountdown(119)).toBe('1:59')
    expect(formatPairingCountdown(61)).toBe('1:01')
    expect(formatPairingCountdown(9)).toBe('0:09')
    expect(formatPairingCountdown(0)).toBe('0:00')
  })

  it('tidak menampilkan sisa waktu negatif', () => {
    expect(formatPairingCountdown(-5)).toBe('0:00')
  })
})
