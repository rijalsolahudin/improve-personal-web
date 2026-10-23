import {
  isoInstantSchema,
  keyTransferIdSchema,
  uuidSchema,
  type KeyTransferCreateResult,
} from '@improve-personal/contracts'

import {
  TRANSFER_QR_VERSION,
  parseTransferQrPayload,
  type TransferQrPayload,
} from '../crypto/transfer'

/**
 * Bentuk QR untuk alur "tambah perangkat" (ARCHITECTURE §7, relay `key_transfers`).
 *
 * Dua QR, karena server menentukan arahnya: `POST /v1/keys/transfer` membutuhkan `blob` (dibuat
 * perangkat LAMA) **dan** `targetDeviceId` (perangkat BARU). Jadi:
 *
 *   1. perangkat BARU menampilkan QR PERMINTAAN  `{ v, publicKey, nonce, deviceId }`
 *   2. perangkat LAMA memindai QR itu -> membungkus kunci utama -> server membalas `{ id, expiresAt }`
 *   3. perangkat LAMA menampilkan QR JAWABAN     `{ v, id, expiresAt }`
 *   4. perangkat BARU memindai QR jawaban -> `POST /v1/keys/transfer/:id` (sekali pakai) -> buka blob
 *
 * Kenapa `deviceId` ikut di QR permintaan: ia satu-satunya cara perangkat lama tahu perangkat mana
 * yang dituju, tanpa meminta user mengetik UUID. Ia bukan rahasia (id perangkat memang dikirim di
 * setiap request), dan server tetap memverifikasi bahwa perangkat itu milik user yang sama.
 *
 * Bentuk payload divalidasi dengan schema KONTRAK (`uuidSchema`, `keyTransferIdSchema`,
 * `isoInstantSchema`): QR bisa berasal dari aplikasi lain, dan menebak isinya berarti membungkus kunci
 * utama untuk public key yang tidak dikenal.
 */

export const PAIRING_QR_VERSION = TRANSFER_QR_VERSION

/** QR jawaban hanya berisi id transfer + kapan ia kedaluwarsa (server yang menentukan, 120 detik). */
export type PairingResponseQr = {
  readonly v: typeof PAIRING_QR_VERSION
  readonly id: string
  readonly expiresAt: string
}

/**
 * Alasan QR ditolak. UI memetakannya ke pesan i18n, bukan menampilkan pesan mentah.
 *
 * Tidak ada `expired` di sini: masa berlaku QR tidak dinilai dari bentuknya, melainkan dari
 * `expiresAt` server (`isPairingExpired`) dan dari jawaban klaim server.
 */
export type PairingQrReason = 'format' | 'version' | 'device'

export class PairingQrError extends Error {
  readonly reason: PairingQrReason

  constructor(reason: PairingQrReason, options?: ErrorOptions) {
    super(`QR transfer ditolak (${reason})`, options)
    this.name = 'PairingQrError'
    this.reason = reason
  }
}

/** QR permintaan: payload kripto dari perangkat baru + id perangkatnya sendiri. */
export function buildRequestQr(qrPayload: string, deviceId: string): string {
  const payload = parseTransferQrPayload(qrPayload)

  return JSON.stringify({ ...payload, deviceId })
}

export function parseRequestQr(text: string): { payload: TransferQrPayload; deviceId: string } {
  let payload: TransferQrPayload
  try {
    payload = parseTransferQrPayload(text)
  } catch (cause) {
    throw new PairingQrError('format', { cause })
  }

  const raw: unknown = safeJson(text)
  const deviceId = (raw as { deviceId?: unknown } | null)?.deviceId
  const parsed = uuidSchema.safeParse(deviceId)
  if (!parsed.success) throw new PairingQrError('device')

  return { payload, deviceId: parsed.data }
}

export function buildResponseQr(result: KeyTransferCreateResult): string {
  const payload: PairingResponseQr = {
    v: PAIRING_QR_VERSION,
    id: result.id,
    expiresAt: result.expiresAt,
  }

  return JSON.stringify(payload)
}

/** Baca QR jawaban. `expiresAtMs` dipakai UI untuk menghitung sisa waktunya sendiri. */
export function parseResponseQr(text: string): { id: string; expiresAtMs: number } {
  const raw: unknown = safeJson(text)
  const candidate = raw as { v?: unknown; id?: unknown; expiresAt?: unknown } | null

  if (typeof candidate !== 'object' || candidate === null) throw new PairingQrError('format')
  if (candidate.v !== PAIRING_QR_VERSION) throw new PairingQrError('version')

  const id = keyTransferIdSchema.safeParse(candidate.id)
  const expiresAt = isoInstantSchema.safeParse(candidate.expiresAt)
  if (!id.success || !expiresAt.success) throw new PairingQrError('format')

  const expiresAtMs = Date.parse(expiresAt.data)
  if (Number.isNaN(expiresAtMs)) throw new PairingQrError('format')

  return { id: id.data, expiresAtMs }
}

/**
 * Kedaluwarsa ditentukan waktu server (`expires_at`), bukan hitungan lokal.
 *
 * `nowMs` dibandingkan dengan `>=`, bukan `>`: pada detik terakhir masa berlaku, server sudah menolak
 * klaim (`expires_at > now`), jadi UI tidak boleh menawarkan tombol yang pasti gagal.
 */
export function isPairingExpired(deadlineMs: number, nowMs: number): boolean {
  return nowMs >= deadlineMs
}

const SECONDS_PER_MINUTE = 60

/**
 * Sisa waktu QR sebagai `m:ss` (`120` -> `"2:00"`, `0` -> `"0:00"`).
 *
 * Sebelumnya komponen menempelkan `0:` di depan detiknya, jadi QR berdurasi 120 detik tampil
 * `Berlaku 0:120` - terbaca seperti angka rusak, padahal masa berlakunya 2 menit. Formatnya dihitung
 * di satu tempat supaya kedua sisi alur (perangkat baru & lama) tidak bisa berbeda.
 */
export function formatPairingCountdown(secondsLeft: number): string {
  const total = Math.max(0, Math.floor(secondsLeft))
  const minutes = Math.floor(total / SECONDS_PER_MINUTE)
  const seconds = total % SECONDS_PER_MINUTE

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new PairingQrError('format', { cause })
  }
}
