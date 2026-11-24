import type { KeySlotLocal, SecureKeyMaterial, SecureKeyStore } from '@improve-personal/core'
import * as SecureStore from 'expo-secure-store'

import { bytesToHex, hexToBytes } from './hex'

/**
 * `SecureKeyStore` di atas expo-secure-store (Keychain / Keystore) - reports/security-181-native.md §3.
 *
 * Tiap slot punya dua item:
 * - **kunci** (`requireAuthentication`): 32 byte sebagai hex, terikat biometrik saat ini. iOS memakai
 *   `.biometryCurrentSet`, Android `setUserAuthenticationRequired` + invalidasi saat enrolment baru.
 * - **penanda** tanpa biometrik: hanya "slot ini pernah diisi", bukan rahasia.
 *
 * Penanda itu yang membedakan "belum pernah dibuat" dari "kunci hilang karena biometrik berubah":
 * di dua OS, kunci yang ter-invalidasi muncul sebagai `null` (Android menelan
 * `KeyPermanentlyInvalidatedException`, iOS `errSecItemNotFound`). Tanpa penanda, pemanggil akan
 * mengira slot kosong lalu membuat kunci baru di atas DB lama - data lama tidak bisa dibuka lagi.
 *
 * Kebijakan: adapter tidak pernah membuat kunci, dan `put` menolak slot yang masih terisi. Mengganti
 * kunci harus lewat `remove` yang eksplisit (alur pemulihan backup/QR).
 */

export const RAW_KEY_KIND = 'raw-32'
const RAW_KEY_BYTES = 32
const PRESENT_MARKER = '1'

/** Teks prompt biometrik saat kunci dibaca/ditulis. */
const AUTHENTICATION_PROMPT = 'Buka kunci data Improve Personal'

const SECRET_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: true,
  authenticationPrompt: AUTHENTICATION_PROMPT,
}

const MARKER_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
}

/**
 * Slot pernah diisi tapi kuncinya tidak bisa dipakai lagi (biometrik berubah, item rusak).
 * Pemanggil masuk alur pemulihan backup/QR; JANGAN membuat kunci baru diam-diam.
 */
export class KeyInvalidatedError extends Error {
  override readonly name = 'KeyInvalidatedError'

  constructor() {
    super('Kunci perangkat tidak berlaku lagi. Pulihkan dari backup atau transfer.')
  }
}

/** Keychain/Keystore tidak bisa dipakai saat ini (prompt dibatalkan, lockout, biometrik belum ada). */
export class KeyStoreUnavailableError extends Error {
  override readonly name = 'KeyStoreUnavailableError'

  constructor() {
    super('Penyimpanan kunci perangkat tidak bisa dipakai saat ini.')
  }
}

/** `put` ke slot yang masih terisi. Mengganti kunci wajib lewat `remove` yang disengaja. */
export class KeySlotOccupiedError extends Error {
  override readonly name = 'KeySlotOccupiedError'

  constructor() {
    super('Slot kunci perangkat masih terisi.')
  }
}

function secretItem(slot: KeySlotLocal): string {
  return `ip.device-key.${slot}`
}

function markerItem(slot: KeySlotLocal): string {
  return `ip.device-key.${slot}.present`
}

/** Jalankan panggilan native; error mentah (bisa memuat nama item/keychain) tidak diteruskan. */
async function native<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch {
    throw new KeyStoreUnavailableError()
  }
}

function rawKeyBytes(material: SecureKeyMaterial): Uint8Array {
  const { kind, handle } = material
  if (kind !== RAW_KEY_KIND || !(handle instanceof Uint8Array) || handle.length !== RAW_KEY_BYTES) {
    throw new TypeError(`Bahan kunci harus ${RAW_KEY_KIND} (${RAW_KEY_BYTES} byte).`)
  }
  return handle
}

async function hasMarker(slot: KeySlotLocal): Promise<boolean> {
  const marker = await native(() => SecureStore.getItemAsync(markerItem(slot), MARKER_OPTIONS))
  return marker !== null
}

export function createSecureKeyStore(): SecureKeyStore {
  return {
    // Hanya penanda: tidak memunculkan prompt biometrik.
    has: hasMarker,

    put: async (slot, material) => {
      const bytes = rawKeyBytes(material)
      if (await hasMarker(slot)) throw new KeySlotOccupiedError()
      // Kunci dulu, penanda kemudian: penanda tanpa kunci akan dibaca sebagai "invalidated".
      await native(() =>
        SecureStore.setItemAsync(secretItem(slot), bytesToHex(bytes), SECRET_OPTIONS),
      )
      await native(() => SecureStore.setItemAsync(markerItem(slot), PRESENT_MARKER, MARKER_OPTIONS))
    },

    get: async (slot) => {
      // Slot kosong dijawab tanpa prompt biometrik.
      if (!(await hasMarker(slot))) return null

      const hex = await native(() => SecureStore.getItemAsync(secretItem(slot), SECRET_OPTIONS))
      if (hex === null) throw new KeyInvalidatedError()

      const bytes = hexToBytes(hex)
      if (bytes === null || bytes.length !== RAW_KEY_BYTES) throw new KeyInvalidatedError()
      return { kind: RAW_KEY_KIND, handle: bytes }
    },

    remove: async (slot) => {
      // Kunci dulu: kalau terputus di tengah, penanda yang tersisa membuat `get` melapor
      // invalidated (alur pemulihan), bukan "kosong" yang mengundang kunci baru.
      await native(() => SecureStore.deleteItemAsync(secretItem(slot), SECRET_OPTIONS))
      await native(() => SecureStore.deleteItemAsync(markerItem(slot), MARKER_OPTIONS))
    },
  }
}
