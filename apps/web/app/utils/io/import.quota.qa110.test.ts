import {
  buildBackupDocument,
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  DEFAULT_USER_PREFS,
  type BackupDocument,
  type CryptoProvider,
  type SecureKeyMaterial,
  type StorageAdapter,
} from '@improve-personal/core'
import { afterEach, describe, expect, it } from 'vitest'

import { resetStorageQuotaForTest, storageQuotaState } from '../storage/pressure'
import { StorageQuotaError } from '../storage/quota'
import { applyBackupDocument } from './import'

/**
 * Regresi F1 QA #108 / task #110: import backup menulis lewat core (`applyBackupImport`), bukan
 * `RecordWriter`. Tanpa guard di sini, kuota penuh saat import hanya jadi pesan generik tanpa banner.
 */
const NOW = 1_700_000_000_000
const PREFS_ID = '018f2c4e-0000-7000-8000-0000000000a1'

const provider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => plaintext,
  openRecord: async ({ blob }) => blob,
}
const dataKey: SecureKeyMaterial = { kind: 'test', handle: null }

function document(): BackupDocument {
  return buildBackupDocument({
    records: [
      {
        id: PREFS_ID,
        type: 'user_prefs',
        hlc: `${NOW}-0-sourcedevice`,
        deleted: false,
        data: { id: PREFS_ID, ...DEFAULT_USER_PREFS, updatedAt: NOW },
      },
    ],
    exportedAtMs: NOW,
  })
}

afterEach(() => {
  resetStorageQuotaForTest()
})

describe('import backup saat kuota penuh (task #110)', () => {
  it('melempar StorageQuotaError dan menyalakan sinyal banner', async () => {
    const base = createMemoryStorage({ clock: createManualClock(NOW) })
    const storage = {
      ...base,
      runTransaction: async () => {
        throw new DOMException('penuh', 'QuotaExceededError')
      },
    } as StorageAdapter

    const target = {
      storage,
      provider,
      dataKey,
      hlc: createHlcGenerator({ deviceId: 'devicea', clock: createManualClock(NOW) }),
    }

    await expect(
      applyBackupDocument({ target, document: document(), mode: 'merge', nowMs: NOW }),
    ).rejects.toBeInstanceOf(StorageQuotaError)

    expect(storageQuotaState()).not.toBeNull()
  })
})
