// Syarat arif (reports/security-181-native.md §3): WHEN_UNLOCKED_THIS_DEVICE_ONLY + terikat biometrik,
// kunci invalid -> KeyInvalidatedError (bukan crash, bukan kunci baru diam-diam).
import * as SecureStore from 'expo-secure-store'

import { fakeSecureStore } from '../../jest/fakeSecureStore'
import {
  createSecureKeyStore,
  KeyInvalidatedError,
  KeySlotOccupiedError,
  KeyStoreUnavailableError,
  RAW_KEY_KIND,
} from './secure-key-store'

const KEY = Uint8Array.from({ length: 32 }, (_, i) => 255 - i)
const material = { kind: RAW_KEY_KIND, handle: KEY }

describe('createSecureKeyStore', () => {
  it('round-trip: simpan lalu ambil mengembalikan byte yang sama', async () => {
    const store = createSecureKeyStore()

    expect(await store.has('device')).toBe(false)
    await store.put('device', material)

    expect(await store.has('device')).toBe(true)
    const loaded = await store.get('device')
    expect(loaded?.kind).toBe(RAW_KEY_KIND)
    expect(loaded?.handle).toEqual(KEY)
  })

  it('item kunci: WHEN_UNLOCKED_THIS_DEVICE_ONLY + requireAuthentication; penanda tanpa biometrik', async () => {
    await createSecureKeyStore().put('device', material)

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'ip.device-key.device',
      expect.any(String),
      expect.objectContaining({
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        requireAuthentication: true,
      }),
    )
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'ip.device-key.device.present',
      '1',
      expect.objectContaining({
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        requireAuthentication: false,
      }),
    )
  })

  it('slot kosong: get = null tanpa membaca item biometrik (tanpa prompt)', async () => {
    expect(await createSecureKeyStore().get('device')).toBeNull()
    expect(SecureStore.getItemAsync).not.toHaveBeenCalledWith(
      'ip.device-key.device',
      expect.anything(),
    )
  })

  it('biometrik berubah: get melempar KeyInvalidatedError, slot tidak diisi kunci baru', async () => {
    const store = createSecureKeyStore()
    await store.put('device', material)
    fakeSecureStore.invalidateBiometry()

    await expect(store.get('device')).rejects.toBeInstanceOf(KeyInvalidatedError)
    // Tetap terdeteksi "pernah ada" - pemanggil tidak boleh mengira slot kosong.
    expect(await store.has('device')).toBe(true)
    await expect(store.put('device', material)).rejects.toBeInstanceOf(KeySlotOccupiedError)
  })

  it('pemulihan: remove eksplisit lalu put kunci baru berhasil', async () => {
    const store = createSecureKeyStore()
    await store.put('device', material)
    fakeSecureStore.invalidateBiometry()

    await store.remove('device')
    expect(await store.has('device')).toBe(false)
    expect(await store.get('device')).toBeNull()
  })

  it('item kunci rusak (bukan hex 32 byte) diperlakukan sebagai invalidated', async () => {
    const store = createSecureKeyStore()
    await store.put('device', material)
    fakeSecureStore.corrupt('ip.device-key.device', 'bukan-hex', { requireAuthentication: true })

    await expect(store.get('device')).rejects.toBeInstanceOf(KeyInvalidatedError)
  })

  it('prompt dibatalkan / error native: KeyStoreUnavailableError generik, tanpa pesan native', async () => {
    const store = createSecureKeyStore()
    await store.put('device', material)
    fakeSecureStore.failNext(
      new Error("Could not authenticate the user: key 'ip.device-key.device'"),
    )

    const error: unknown = await store.get('device').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(KeyStoreUnavailableError)
    expect((error as Error).message).not.toContain('ip.device-key')
  })

  it('bahan kunci selain raw 32 byte ditolak sebelum menyentuh Keychain', async () => {
    const store = createSecureKeyStore()

    await expect(
      store.put('device', { kind: RAW_KEY_KIND, handle: new Uint8Array(16) }),
    ).rejects.toThrow(TypeError)
    await expect(store.put('device', { kind: 'webcrypto', handle: KEY })).rejects.toThrow(TypeError)
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
  })
})
