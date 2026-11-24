/**
 * Konversi byte <-> hex huruf kecil untuk bahan kunci di `platform/`.
 *
 * Sengaja tanpa `Buffer`/`TextDecoder`: Hermes tidak punya `Buffer`, dan output harus hanya
 * `[0-9a-f]` karena hasilnya disisipkan ke `PRAGMA key` (tidak ada jalur injeksi dari input user).
 */

const HEX_PATTERN = /^(?:[0-9a-f]{2})*$/

export function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

/** `null` kalau bukan hex huruf kecil dengan panjang genap - pemanggil memutuskan artinya. */
export function hexToBytes(hex: string): Uint8Array | null {
  if (!HEX_PATTERN.test(hex)) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
