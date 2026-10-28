import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'
import { beforeEach, describe, expect, it } from 'vitest'

import type { LocalDataSession } from '~/utils/storage/session'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import { createUuidV7Generator } from '~/utils/storage/uuid'

import { resetProfileForTest, useProfile } from './useProfile'
import { TEST_KID_WIRE } from '../../tests/nuxt/record-key'

/**
 * Profil di atas record `user_profile`: tersimpan lewat writer (ikut outbox sync, terenkripsi),
 * bukan field sesi server.
 */

const NOW_MS = 1_700_000_000_000
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }
const AVATAR = 'data:image/webp;base64,UklGRhoAAABXRUJQ'

const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

function memorySession(): LocalDataSession {
  const clock = createManualClock(NOW_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: '018f2c4e-0000-7000-8000-0000000000d1', clock })

  return {
    storage,
    provider: fakeProvider,
    clock,
    dataKey: DATA_KEY,
    kid: TEST_KID_WIRE,
    hlc,
    deviceId: '018f2c4e-0000-7000-8000-0000000000d1',
    userId: '018f2c4e-0000-7000-8000-00000000000a',
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

beforeEach(() => {
  resetProfileForTest()
  useState('profileStatus').value = 'idle'
  useState('profileError').value = null
})

describe('useProfile', () => {
  it('akun tanpa record: profil kosong, tanpa menulis apa pun', async () => {
    const session = memorySession()
    const profile = useProfile({ session: async () => session })

    await profile.hydrate()

    expect(profile.profile.value).toEqual({ displayName: '', avatar: null })
    expect(await session.repos.userProfile.listAll()).toHaveLength(0)
  })

  it('simpan menulis record user_profile lewat writer (ikut outbox sync)', async () => {
    const session = memorySession()
    const profile = useProfile({ session: async () => session })
    await profile.hydrate()

    await profile.save({ displayName: '  Rijal ', avatar: AVATAR })

    const rows = await session.repos.userProfile.listAll()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.data).toMatchObject({ displayName: 'Rijal', avatar: AVATAR })
    expect(profile.profile.value).toEqual({ displayName: 'Rijal', avatar: AVATAR })
    expect(await session.storage.countOutbox()).toBe(1)
  })

  it('simpan kedua menimpa record yang sama, bukan menambah record baru', async () => {
    const session = memorySession()
    const profile = useProfile({ session: async () => session })
    await profile.hydrate()

    await profile.save({ displayName: 'Rijal', avatar: AVATAR })
    await profile.save({ displayName: 'Rijal S', avatar: null })

    const rows = await session.repos.userProfile.listAll()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.data).toMatchObject({ displayName: 'Rijal S', avatar: null })
  })

  it('foto yang bukan raster (SVG) ditolak dan tidak ditulis', async () => {
    const session = memorySession()
    const profile = useProfile({ session: async () => session })
    await profile.hydrate()

    await expect(
      profile.save({ displayName: 'Rijal', avatar: 'data:image/svg+xml;base64,PHN2Zz4=' }),
    ).rejects.toThrow('profil tidak valid')
    expect(await session.repos.userProfile.listAll()).toHaveLength(0)
  })

  it('hydrate membaca profil yang sudah tersimpan', async () => {
    const session = memorySession()
    const id = session.newId()
    await session.writer.write({
      type: 'user_profile',
      id,
      data: () => ({ id, displayName: 'Dari HP', avatar: null, updatedAt: NOW_MS }),
    })

    const profile = useProfile({ session: async () => session })
    await profile.hydrate()

    expect(profile.profile.value.displayName).toBe('Dari HP')
  })
})
