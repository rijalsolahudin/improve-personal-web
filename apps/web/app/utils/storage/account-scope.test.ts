// @vitest-environment node
//
// Pemisahan penyimpanan antar AKUN (bukan antar perangkat).
//
// Bug yang dijaga di sini nyata dan pernah hidup: adaptor record & penyimpanan kunci diikat ke
// PERANGKAT, tanpa dimensi akun. Akibatnya logout -> login akun lain di browser yang sama menampilkan
// data akun pertama (terdekripsi, di UI). Test ini mengunci sifat yang benar: tiap akun punya bak
// datanya sendiri dan kunci perangkatnya sendiri.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import { createManualClock } from '@improve-personal/core'

import { createWebKeyStore } from '../crypto/key-store'
import { saveDeviceUnlock } from '../crypto/device-slot'
import { createMasterKey, deriveDataKey } from '../crypto/master-key'
import { loadSodium } from '../crypto/sodium'
import { assertUserId, keyDatabaseName, localDatabaseName } from './database-names'
import { openLocalDataSession, type OpenSessionOptions } from './session'

/**
 * Runtime test (node) tidak punya syarat browser yang diperiksa `openLocalDataSession`
 * (`isSecureContext`); dinyatakan di sini supaya yang diuji adalah pemisahan akun, bukan kelengkapan
 * browser.
 */
Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })

const START_MS = 1_700_000_000_000

/** Dua akun berbeda, di "perangkat" yang sama (satu origin, satu browser profile). */
const USER_A = '018f2c4e-0000-7000-8000-00000000000a'
const USER_B = '018f2c4e-0000-7000-8000-00000000000b'

function open(userId: string): Promise<Awaited<ReturnType<typeof openLocalDataSession>>> {
  const options: OpenSessionOptions = { userId, clock: createManualClock(START_MS) }
  return openLocalDataSession(options)
}

function todoPayload(id: string, title: string) {
  return {
    id,
    title,
    note: null,
    deadlineAt: null,
    priority: 'medium' as const,
    isDone: false,
    completedAt: null,
    scheduleId: null,
    scheduleOccurrenceAt: null,
    createdAt: START_MS,
    updatedAt: START_MS,
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('pemisahan penyimpanan per akun', () => {
  it('nama database memuat akun, dan userId yang bukan UUID ditolak', () => {
    expect(localDatabaseName(USER_A)).toContain(USER_A)
    expect(localDatabaseName(USER_A)).not.toBe(localDatabaseName(USER_B))
    expect(keyDatabaseName(USER_A)).not.toBe(keyDatabaseName(USER_B))

    // Nilai bebas di nama database adalah cara paling halus membuat dua akun berbagi satu bak data.
    expect(() => assertUserId('bukan-uuid')).toThrow(/UUID/)
    expect(() => assertUserId('')).toThrow(/UUID/)
  })

  it('akun B TIDAK melihat data akun A di perangkat yang sama (bug lama)', async () => {
    const a = await open(USER_A)
    await a.writer.write({ type: 'todo', data: (id) => todoPayload(id, 'Punya A') })
    expect(await a.repos.todo.listAll()).toHaveLength(1)

    // "Logout lalu login akun lain": sesi lokal akun B dibuka dari nol di perangkat yang sama.
    const b = await open(USER_B)

    expect(await b.repos.todo.listAll()).toEqual([])
  })

  it('tiap akun punya kunci PERANGKAT sendiri (bukan warisan akun lain)', async () => {
    const a = await open(USER_A)

    // Kunci akun B dibuat saat sesinya dibuka - di database kunci milik B.
    const keyStoreB = createWebKeyStore({ databaseName: keyDatabaseName(USER_B) })
    expect(await keyStoreB.has('device')).toBe(false)

    const b = await open(USER_B)
    expect(await keyStoreB.has('device')).toBe(true)

    // Kunci data kedua akun berbeda, jadi blob A tidak bisa dibuka dengan sesi B.
    expect(Buffer.from(a.dataKey.handle as Uint8Array)).not.toEqual(
      Buffer.from(b.dataKey.handle as Uint8Array),
    )

    // Akun A tetap memegang kuncinya sendiri.
    expect(await createWebKeyStore({ databaseName: keyDatabaseName(USER_A) }).has('device')).toBe(
      true,
    )
  })

  it('akun A kembali: datanya masih ada, tanpa perlu dibuat ulang', async () => {
    const first = await open(USER_A)
    await first.writer.write({ type: 'todo', data: (id) => todoPayload(id, 'Punya A') })

    await open(USER_B)

    const back = await open(USER_A)
    const rows = await back.repos.todo.listAll()
    expect(rows.map((row) => (row.data as { title: string }).title)).toEqual(['Punya A'])
  })

  it('kunci perangkat per akun tidak saling menimpa', async () => {
    const sodium = await loadSodium()
    const masterKeyA = createMasterKey(sodium)
    const masterKeyB = createMasterKey(sodium)

    await saveDeviceUnlock(createWebKeyStore({ databaseName: keyDatabaseName(USER_A) }), masterKeyA)
    await saveDeviceUnlock(createWebKeyStore({ databaseName: keyDatabaseName(USER_B) }), masterKeyB)

    // Sesi A harus membuka kunci MILIK A, bukan yang terakhir ditulis.
    const a = await open(USER_A)
    const expectedA = deriveDataKey(sodium, masterKeyA, USER_A)

    expect(Buffer.from(a.dataKey.handle as Uint8Array)).toEqual(
      Buffer.from(expectedA.handle as Uint8Array),
    )
  })
})
