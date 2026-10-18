import { randomBytes } from 'node:crypto'

/**
 * UUIDv7 - id yang urut waktu.
 *
 * `apps/web/docs/server.dbml` menetapkan `users.id` dan `devices.id` sebagai UUID v7. Yang dipakai
 * dari sifat itu adalah kegunaan operasional: id perangkat yang dibuat berurutan bisa diurutkan dan
 * di-`LIMIT` tanpa kolom tambahan, dan jejak audit jadi enak dibaca.
 *
 * Layoutnya mengikuti RFC 9562 §5.7 apa adanya (48 bit timestamp ms + version 7 + varian RFC 4122 +
 * sisa acak); bukan algoritma kripto buatan sendiri - bagian acaknya tetap dari `crypto.randomBytes`.
 * Record (`records.id`) tidak memakai ini: id record dibuat CLIENT (ARCHITECTURE.md §6).
 */

const UUID_BYTES = 16
const VERSION_7 = 0x70
const VARIANT_RFC_4122 = 0x80
const VARIANT_MASK = 0x3f
const VERSION_MASK = 0x0f

const MS_PER_SECOND = 1_000
const HIGH_WORD_SHIFT = 2 ** 32

/** Batas 48 bit timestamp UUIDv7. Di luar ini id tidak lagi urut waktu. */
const MAX_TIMESTAMP_MS = 2 ** 48 - 1

/** UUID v7 dari waktu `nowMs` (epoch ms UTC). Nilai acak diambil per panggilan. */
export function uuidv7(nowMs: number = Date.now()): string {
  const timestamp = Math.min(Math.max(Math.trunc(nowMs), 0), MAX_TIMESTAMP_MS)

  const bytes = randomBytes(UUID_BYTES)
  const view = new DataView(bytes.buffer, bytes.byteOffset, UUID_BYTES)

  view.setUint16(0, Math.floor(timestamp / HIGH_WORD_SHIFT))
  view.setUint32(2, timestamp % HIGH_WORD_SHIFT)

  const versionByte = bytes[6] ?? 0
  bytes[6] = (versionByte & VERSION_MASK) | VERSION_7

  const variantByte = bytes[8] ?? 0
  bytes[8] = (variantByte & VARIANT_MASK) | VARIANT_RFC_4122

  const hex = bytes.toString('hex')

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

/** Timestamp (epoch ms) yang tersimpan di UUIDv7 - dipakai test untuk memastikan urutannya. */
export function uuidv7TimestampMs(uuid: string): number {
  return Number.parseInt(uuid.slice(0, 8) + uuid.slice(9, 13), 16)
}

/** Detik ke milidetik. Dipakai bersama `MS_PER_SECOND` supaya konversi TTL tidak tersebar. */
export function secondsToMs(seconds: number): number {
  return seconds * MS_PER_SECOND
}
