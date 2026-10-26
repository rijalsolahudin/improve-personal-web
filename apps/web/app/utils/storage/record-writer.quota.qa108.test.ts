// @vitest-environment node
//
// QA #108: pembuktian ujung-ke-ujung bahwa jalur tulis nyata (`writeRecord`) - bukan cuma
// `guardStorageWrite` di unit test - memetakan kuota penuh jadi `StorageQuotaError` (pesan asli
// dipertahankan, jadi draf Memo tetap punya teks sebabnya) DAN mengirim sinyal global untuk banner.
// Mock hanya di batas adapter: transaksi tulis gagal karena kuota, seperti IndexedDB sungguhan.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createHlcGenerator,
  createManualClock,
  type SecureKeyMaterial,
  type StorageAdapter,
  type Todo,
} from '@improve-personal/core'

import { createMasterKey, deriveDataKey } from '../crypto/master-key'
import { createSodiumCryptoProvider } from '../crypto/provider'
import { loadSodium } from '../crypto/sodium'
import { writeRecord } from './record-writer'
import { StorageQuotaError } from './quota'
import { resetStorageQuotaForTest, storageQuotaState } from './pressure'

const START_MS = 1_700_000_000_000
const DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d1'

Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })

function todoPayload(id: string): Todo {
  return {
    id,
    title: 'Beli kopi',
    note: null,
    deadlineAt: null,
    priority: 'medium',
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
  resetStorageQuotaForTest()
})

describe('probe writeRecord + kuota', () => {
  it('writeRecord memetakan QuotaExceededError + mengirim sinyal', async () => {
    const sodium = await loadSodium()
    const clock = createManualClock(START_MS)
    const provider = await createSodiumCryptoProvider()
    const dataKey: SecureKeyMaterial = deriveDataKey(sodium, createMasterKey(sodium))

    // Adapter tiruan: transaksi tulis selalu gagal karena kuota.
    const storage: StorageAdapter = {
      runTransaction: () => Promise.reject(new DOMException('penuh sekali', 'QuotaExceededError')),
    } as unknown as StorageAdapter

    let thrown: unknown = null
    try {
      await writeRecord(
        {
          storage,
          provider,
          dataKey,
          hlc: createHlcGenerator({ deviceId: DEVICE_ID, clock }),
          clock,
        },
        { type: 'todo', data: (id) => todoPayload(id) },
      )
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(StorageQuotaError)
    expect((thrown as Error).message).toBe('penuh sekali')
    expect(storageQuotaState()).not.toBeNull()
  })
})
