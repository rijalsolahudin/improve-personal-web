import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'

import { useAuthSession } from '~/composables/useAuthSession'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import type { LocalDataSession } from '~/utils/storage/session'
import { createUuidV7Generator } from '~/utils/storage/uuid'

/**
 * Sesi data lokal in-memory untuk test yang perlu sesi SUNGGUHAN terbuka lewat `useLocalData`.
 *
 * Adaptor penyimpanan, repository, dan writer memakai implementasi produksi; hanya kriptonya yang
 * diganti base64 supaya test tidak membuka IndexedDB atau menunggu libsodium. `userId` bisa dipilih
 * karena test ganti akun butuh dua sesi berbeda pemilik.
 */
const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }
const DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d1'

export const TEST_USER_A = '018f2c4e-0000-7000-8000-00000000000a'
export const TEST_USER_B = '018f2c4e-0000-7000-8000-00000000000b'
export { DEVICE_ID as TEST_DEVICE_ID }

export function createMemoryLocalSession(
  userId = TEST_USER_A,
  nowMs = 1_700_000_000_000,
): LocalDataSession {
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
    userId,
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

/** Sesi palsu untuk login lewat `useAuthSession().setSession()` (tanpa request ke server). */
export function signIn(userId: string): void {
  useAuthSession().setSession({
    user: { id: userId, email: `${userId.slice(0, 8)}@example.com` },
    device: { id: DEVICE_ID, name: 'Perangkat uji' },
    expiresAt: new Date(1_700_003_600_000).toISOString(),
  })
}
