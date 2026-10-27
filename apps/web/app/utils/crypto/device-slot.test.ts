// @vitest-environment node
//
// Slot `device` + penyimpan kunci (ARCHITECTURE §5 & §7).
//
// Dua hal yang harus dibuktikan di sini, bukan diasumsikan:
// 1. Kunci pembuka perangkat benar-benar non-extractable (byte-nya tidak bisa diekspor).
// 2. Kunci utama TIDAK PERNAH tersimpan polos - bahkan setelah membongkar seluruh isi database kunci.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'

import { KEY_SLOTS_LOCAL } from '@improve-personal/core'

import { createWebKeyStore } from './key-store'
import {
  DEVICE_MATERIAL_KIND,
  DeviceSlotOccupiedError,
  hasDeviceUnlock,
  removeDeviceUnlock,
  saveDeviceUnlock,
  unlockMasterKeyWithDevice,
} from './device-slot'
import { createMasterKey, deriveDataKey } from './master-key'
import { createSodiumCryptoProvider } from './provider'
import { loadSodium } from './sodium'
import { TEST_HLC, TEST_USER_ID } from '../../../tests/nuxt/record-key'

const RECORD_ID = '018f2c4e-0000-7000-8000-00000000000b'

let databaseCounter = 0

/** Nama database unik per test: IndexedDB menyimpan per nama, jadi tiap kasus mulai dari kosong. */
function freshDatabaseName(): string {
  databaseCounter += 1
  return `ip-keys-test-${databaseCounter}`
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

/** Kumpulkan semua byte & string yang benar-benar ada di database kunci - untuk memeriksa isinya. */
async function dumpKeyDatabase(databaseName: string): Promise<Uint8Array[]> {
  const db = await openDB(databaseName)
  const rows = await db.getAll('key_material')
  const found: Uint8Array[] = []

  const walk = (value: unknown): void => {
    if (value instanceof Uint8Array) {
      found.push(value)
      return
    }
    if (value instanceof ArrayBuffer) {
      found.push(new Uint8Array(value))
      return
    }
    if (typeof value === 'string') {
      found.push(new TextEncoder().encode(value))
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (typeof value === 'object' && value !== null) {
      for (const item of Object.values(value)) walk(item)
    }
  }

  walk(rows)
  db.close()
  return found
}

function containsBytes(haystacks: readonly Uint8Array[], needle: Uint8Array): boolean {
  const target = Buffer.from(needle)

  return haystacks.some((haystack) => Buffer.from(haystack).includes(target))
}

describe('slot device', () => {
  it('round-trip lintas instance (simulasi reload): kunci utama yang sama keluar lagi', async () => {
    const sodium = await loadSodium()
    const databaseName = freshDatabaseName()
    const masterKey = createMasterKey(sodium)

    await saveDeviceUnlock(createWebKeyStore({ databaseName }), masterKey)

    // Instance BARU dengan database yang sama = perangkat yang baru dibuka ulang.
    const reopened = await unlockMasterKeyWithDevice(createWebKeyStore({ databaseName }))

    expect(Buffer.from(reopened)).toEqual(Buffer.from(masterKey))
  })

  it('kunci pembuka perangkat non-extractable: byte-nya tidak bisa diekspor', async () => {
    const sodium = await loadSodium()
    const keyStore = createWebKeyStore({ databaseName: freshDatabaseName() })

    await saveDeviceUnlock(keyStore, createMasterKey(sodium))

    const material = await keyStore.get('device')
    const wrappingKey = (material?.handle as { wrappingKey: CryptoKey }).wrappingKey

    expect(material?.kind).toBe(DEVICE_MATERIAL_KIND)
    expect(wrappingKey.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', wrappingKey)).rejects.toThrow()
    // Usages-nya juga sempit: kunci ini hanya boleh membungkus/membuka bungkus.
    expect([...wrappingKey.usages].sort()).toEqual(['unwrapKey', 'wrapKey'])
  })

  it('kunci utama TIDAK tersimpan polos - isi database dibongkar seluruhnya untuk memastikan', async () => {
    const sodium = await loadSodium()
    const databaseName = freshDatabaseName()
    const masterKey = createMasterKey(sodium)

    await saveDeviceUnlock(createWebKeyStore({ databaseName }), masterKey)

    const everything = await dumpKeyDatabase(databaseName)

    expect(everything.length).toBeGreaterThan(0)
    expect(containsBytes(everything, masterKey)).toBe(false)

    // Yang tersimpan adalah bungkusnya (AES-KW: panjang MK + 8 byte integritas).
    const material = await createWebKeyStore({ databaseName }).get('device')
    const wrapped = (material?.handle as { wrappedMasterKey: Uint8Array }).wrappedMasterKey
    expect(wrapped.length).toBe(40)
    expect(Buffer.from(wrapped)).not.toEqual(Buffer.from(masterKey))
  })

  it('data yang disegel bisa dibuka lagi lewat pembuka perangkat setelah reload', async () => {
    // Rantai lengkapnya: segel dengan kunci data -> reload -> buka kunci utama lewat slot device ->
    // turunkan ulang kunci data -> buka record. Ini yang bikin "reload tidak menghilangkan data" nyata.
    const sodium = await loadSodium()
    const provider = await createSodiumCryptoProvider()
    const databaseName = freshDatabaseName()
    const masterKey = createMasterKey(sodium)

    await saveDeviceUnlock(createWebKeyStore({ databaseName }), masterKey)

    const plaintext = JSON.stringify({ type: 'todo', schemaVersion: 1, data: { title: 'jalan' } })
    const blob = await provider.sealRecord({
      recordId: RECORD_ID,
      hlc: TEST_HLC,
      deleted: false,
      dataKey: deriveDataKey(sodium, masterKey, TEST_USER_ID),
      plaintext,
    })

    const unlocked = await unlockMasterKeyWithDevice(createWebKeyStore({ databaseName }))
    const dataKey = deriveDataKey(sodium, unlocked, TEST_USER_ID)
    const opened = await provider.openRecord({
      recordId: RECORD_ID,
      hlc: TEST_HLC,
      deleted: false,
      dataKey,
      blob,
    })

    expect(opened).toBe(plaintext)
  })

  it('menolak menimpa slot yang sudah terisi (rotasi harus eksplisit)', async () => {
    const sodium = await loadSodium()
    const keyStore = createWebKeyStore({ databaseName: freshDatabaseName() })

    await saveDeviceUnlock(keyStore, createMasterKey(sodium))

    await expect(saveDeviceUnlock(keyStore, createMasterKey(sodium))).rejects.toBeInstanceOf(
      DeviceSlotOccupiedError,
    )

    // Kunci lama tetap utuh: kegagalan tidak boleh setengah jalan mengganti pembuka.
    const stillUnlocks = await unlockMasterKeyWithDevice(keyStore)
    expect(stillUnlocks).toHaveLength(32)
  })

  it('dua tab menyimpan bersamaan ke slot kosong: hanya SATU yang menang, kuncinya tidak tertimpa', async () => {
    // Regresi #113: dulu `has()` dan `put()` berjalan di dua langkah terpisah, jadi dua tab yang
    // sama-sama melihat slot kosong saling menimpa - dan record tab yang kalah tidak bisa dibuka lagi.
    const sodium = await loadSodium()
    const databaseName = freshDatabaseName()
    const firstKey = createMasterKey(sodium)
    const secondKey = createMasterKey(sodium)

    // Dua instance = dua tab: tidak ada cache bersama di antara keduanya selain database itu sendiri.
    const results = await Promise.allSettled([
      saveDeviceUnlock(createWebKeyStore({ databaseName }), firstKey),
      saveDeviceUnlock(createWebKeyStore({ databaseName }), secondKey),
    ])

    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DeviceSlotOccupiedError)

    const winner = results[0]?.status === 'fulfilled' ? firstKey : secondKey
    const stored = await unlockMasterKeyWithDevice(createWebKeyStore({ databaseName }))
    expect(Buffer.from(stored)).toEqual(Buffer.from(winner))
  })

  it('perangkat tanpa pembuka: error yang menyebut jalan keluarnya, bukan gagal misterius', async () => {
    const keyStore = createWebKeyStore({ databaseName: freshDatabaseName() })

    expect(await hasDeviceUnlock(keyStore)).toBe(false)
    await expect(unlockMasterKeyWithDevice(keyStore)).rejects.toThrow(/passkey|recovery|QR/)
  })

  it('setelah pembuka dicabut, kunci utama tidak bisa dibuka lagi', async () => {
    const sodium = await loadSodium()
    const keyStore = createWebKeyStore({ databaseName: freshDatabaseName() })

    await saveDeviceUnlock(keyStore, createMasterKey(sodium))
    expect(await hasDeviceUnlock(keyStore)).toBe(true)

    await removeDeviceUnlock(keyStore)

    expect(await hasDeviceUnlock(keyStore)).toBe(false)
    await expect(unlockMasterKeyWithDevice(keyStore)).rejects.toThrow(/belum punya kunci pembuka/)
  })

  it('bahan kunci rusak atau jenis tak dikenal ditolak, tidak ditebak', async () => {
    const keyStore = createWebKeyStore({ databaseName: freshDatabaseName() })

    await keyStore.put('device', { kind: 'webauthn-prf', handle: {} })
    await expect(unlockMasterKeyWithDevice(keyStore)).rejects.toThrow(/tidak dikenal/)

    await keyStore.put('device', { kind: DEVICE_MATERIAL_KIND, handle: { wrappingKey: {} } })
    await expect(unlockMasterKeyWithDevice(keyStore)).rejects.toThrow(/rusak/)
  })

  it('Salinan 1 (gembok OTP) benar-benar dihapus: tidak ada slot OTP di perangkat', () => {
    // AC T20 + ADR 10: OTP cuma untuk sesi API. Daftar slot lokal tidak punya (dan tidak boleh
    // mendapat) slot `otp`, jadi tidak ada jalur yang menyimpan/membuka kunci dengan OTP.
    expect([...KEY_SLOTS_LOCAL]).toEqual(['device', 'passkey', 'recovery'])
    expect(KEY_SLOTS_LOCAL).not.toContain('otp')
  })
})
