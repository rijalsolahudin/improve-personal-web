import type { Clock } from '@improve-personal/core'

/**
 * Generator UUIDv7 untuk id record (ARCHITECTURE §6: "UUIDv7 - urut waktu, dibuat di client").
 *
 * Ditaruh di sisi web (bukan di `packages/core`) karena butuh sumber acak platform, dan core sengaja
 * tidak menyentuh batas platform. Bentuk yang dihasilkan harus lolos `uuidV7Schema` di core - itu yang
 * diuji, bukan "terlihat seperti UUID".
 *
 * Catatan yang perlu diketahui: yang membuat urutan stabil adalah **HLC**, bukan `id`. Jadi jam
 * perangkat yang mundur tidak merusak keputusan LWW - ia hanya membuat id baru tidak lagi urut secara
 * leksikografis, dan itu tidak dipakai untuk apa pun yang menentukan pemenang data.
 */

/** 48 bit waktu + 74 bit acak (versi 7 dan varian ditulis di tengah). */
const RANDOM_BYTES = 9

export type UuidOptions = {
  readonly clock: Clock
  /** Sumber acak, disuntik di test supaya id bisa direproduksi saat memeriksa bentuknya. */
  readonly random?: (bytes: number) => Uint8Array
}

function platformRandom(bytes: number): Uint8Array {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return buffer
}

export function createUuidV7Generator(options: UuidOptions): () => string {
  const random = options.random ?? platformRandom

  return () => {
    const timeHex = options.clock.nowMs().toString(16).padStart(12, '0').slice(-12)
    const rand = random(RANDOM_BYTES)
    const hex = [...rand].map((byte) => byte.toString(16).padStart(2, '0')).join('')

    // rand_a = 12 bit (byte 0 + nibble atas byte 1), variasi = 1 nibble, rand_b = 12 bit + 48 bit.
    const randA = `${hex.slice(0, 2)}${hex.slice(2, 3)}`
    const variant = (8 + (rand[1]! & 0x3)).toString(16)
    const randB = `${hex.slice(3, 4)}${hex.slice(4, 6)}`
    const randC = hex.slice(6, 18)

    return [
      timeHex.slice(0, 8),
      timeHex.slice(8, 12),
      `7${randA}`,
      `${variant}${randB}`,
      randC,
    ].join('-')
  }
}

/** Id outbox lokal. Sengaja bukan UUID: baris ini hidup di perangkat sendiri, bukan ikut sync. */
export function createOutboxId(random: (bytes: number) => Uint8Array = platformRandom): string {
  const bytes = random(8)
  return `outbox-${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
