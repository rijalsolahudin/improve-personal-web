import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'

import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import type { LocalDataSession } from '~/utils/storage/session'
import { createUuidV7Generator } from '~/utils/storage/uuid'

/**
 * Sesi data lokal untuk test halaman jurnal: adaptor penyimpanan in-memory milik core, repository &
 * writer asli. Hanya kriptonya yang diganti (base64) supaya test tidak perlu membuka IndexedDB atau
 * menunggu libsodium - test halaman membuktikan WIRING "simpan benar-benar menulis", bukan format
 * ciphertext (itu wilayah `utils/storage/*.test.ts`).
 */
const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }
const DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d1'
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'

export function createMemoryLocalSession(nowMs = 1_700_000_000_000): LocalDataSession {
  const clock = createManualClock(nowMs)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: DEVICE_ID, clock })

  return {
    storage,
    provider: fakeProvider,
    clock,
    dataKey: DATA_KEY,
    hlc,
    deviceId: DEVICE_ID,
    userId: USER_ID,
    isFreshKey: true,
    keyStore: {
      has: async () => false,
      put: async () => undefined,
      get: async () => null,
      remove: async () => undefined,
    },
    newId: createUuidV7Generator({ clock }),
    withMasterKey: async (work) => work(new Uint8Array(32)),
    repos: createRepositorySet({ storage, provider: fakeProvider, dataKey: DATA_KEY }),
    writer: createRecordWriter({ storage, provider: fakeProvider, dataKey: DATA_KEY, hlc, clock }),
  }
}
