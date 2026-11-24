// @vitest-environment node
//
// Device Sign Key (ADR 17): keypair Ed25519 per perangkat, private key non-extractable.
import 'fake-indexeddb/auto'

import { deviceSignPublicKeySchema } from '@improve-personal/contracts'
import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'

import { ensureDeviceSignPublicKey } from './device-sign-key'

let databaseCounter = 0

function freshDatabaseName(): string {
  databaseCounter += 1
  return `ip-sign-test-${databaseCounter}`
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

async function storedRow(databaseName: string) {
  const db = await openDB(databaseName)
  try {
    return await db.get('sign_key', 'device')
  } finally {
    db.close()
  }
}

describe('ensureDeviceSignPublicKey', () => {
  it('membuat public key Ed25519 32 byte yang lolos kontrak aktivasi', async () => {
    const publicKey = await ensureDeviceSignPublicKey({ databaseName: freshDatabaseName() })

    expect(deviceSignPublicKeySchema.safeParse(publicKey).success).toBe(true)
  })

  it('kunci yang sama dikembalikan di panggilan berikutnya (identitas perangkat stabil)', async () => {
    const databaseName = freshDatabaseName()

    const first = await ensureDeviceSignPublicKey({ databaseName })
    const second = await ensureDeviceSignPublicKey({ databaseName })

    expect(second).toBe(first)
  })

  it('dua pemanggilan bersamaan (dua tab) berakhir dengan satu kunci yang sama', async () => {
    const databaseName = freshDatabaseName()

    const keys = await Promise.all([
      ensureDeviceSignPublicKey({ databaseName }),
      ensureDeviceSignPublicKey({ databaseName }),
      ensureDeviceSignPublicKey({ databaseName }),
    ])

    expect(new Set(keys).size).toBe(1)
    expect((await storedRow(databaseName))?.publicKey).toBe(keys[0])
  })

  it('perangkat berbeda (database berbeda) mendapat kunci berbeda', async () => {
    const one = await ensureDeviceSignPublicKey({ databaseName: freshDatabaseName() })
    const two = await ensureDeviceSignPublicKey({ databaseName: freshDatabaseName() })

    expect(two).not.toBe(one)
  })

  it('private key non-extractable dan pasangan sah dari public key yang dikirim', async () => {
    const databaseName = freshDatabaseName()
    const publicKey = await ensureDeviceSignPublicKey({ databaseName })
    const row = await storedRow(databaseName)
    const privateKey = row?.privateKey as CryptoKey

    expect(privateKey.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('pkcs8', privateKey)).rejects.toThrow()

    const message = new TextEncoder().encode('ip-sync-auth|v1|nonce')
    const signature = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, message)
    const verifyKey = await crypto.subtle.importKey(
      'raw',
      Buffer.from(publicKey, 'base64'),
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
    expect(await crypto.subtle.verify({ name: 'Ed25519' }, verifyKey, signature, message)).toBe(
      true,
    )
  })

  it('tidak menyimpan byte private key di database (hanya handle CryptoKey + public key)', async () => {
    const databaseName = freshDatabaseName()
    await ensureDeviceSignPublicKey({ databaseName })
    const row = await storedRow(databaseName)

    expect(Object.keys(row ?? {}).sort()).toEqual(['id', 'privateKey', 'publicKey'])
  })
})
