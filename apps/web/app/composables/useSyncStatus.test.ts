// @vitest-environment node
import {
  createManualClock,
  createMemoryStorage,
  pointIndex,
  type StorageAdapter,
} from '@improve-personal/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearQuarantineForTest, quarantineRecord } from '~/utils/sync/quarantine'

import { useSyncStatus } from './useSyncStatus'
/**
 * Indikator status sync: nilainya HARUS berasal dari `readSyncStatus` core (outbox + keadaan jaringan),
 * bukan kesimpulan komponen. Test ini memakai adapter memori - implementasi `StorageAdapter` yang sama
 * kontraknya dengan IndexedDB.
 */

const NOW = 1_700_000_000_000

function storage(): StorageAdapter {
  return createMemoryStorage({ clock: createManualClock(NOW) })
}

async function queue(storage: StorageAdapter, id: string): Promise<void> {
  await storage.runTransaction('test.queue', async (tx) => {
    await tx.putRecord({
      sealed: { id, hlc: `${NOW}-0-devicea`, deleted: false, blob: 'ciphertext' },
      index: pointIndex(id, 'todo', NOW, NOW),
      op: 'put',
      outbox: { id: `outbox-${id}`, queuedAtMs: NOW },
    })
  })
}

function read(storage: StorageAdapter | null, online: boolean, ownerId: string | null = null) {
  return useSyncStatus({
    getStorage: () => storage,
    isOnline: () => online,
    getOwnerId: () => ownerId,
  })
}

describe('status sinkronisasi', () => {
  it('belum bisa dinilai selama penyimpanan lokal belum terbuka', async () => {
    const sync = read(null, true)
    await sync.refresh()

    expect(sync.status.value).toBeNull()
    expect(sync.pendingCount.value).toBe(0)
    expect(sync.lastSyncAtMs.value).toBeNull()
  })

  it('tersinkron saat tidak ada perubahan menunggu', async () => {
    const sync = read(storage(), true)
    await sync.refresh()

    expect(sync.status.value).toBe('synced')
    expect(sync.pendingCount.value).toBe(0)
  })

  it('menunggu selama masih ada baris outbox, lengkap dengan jumlahnya', async () => {
    const local = storage()
    await queue(local, '018f2c4e-0000-7000-8000-000000000001')
    await queue(local, '018f2c4e-0000-7000-8000-000000000002')

    const sync = read(local, true)
    await sync.refresh()

    expect(sync.status.value).toBe('pending')
    expect(sync.pendingCount.value).toBe(2)
  })

  it('offline mengalahkan antrean: menumpuk saat offline bukan error', async () => {
    const local = storage()
    await queue(local, '018f2c4e-0000-7000-8000-000000000003')

    const sync = read(local, false)
    await sync.refresh()

    expect(sync.status.value).toBe('offline')
  })

  it('gagal sinkron saat sync_state mencatat error', async () => {
    const local = storage()
    await local.putSyncState({
      deviceId: 'devicea',
      cursor: 0,
      status: 'error',
      lastPullAtMs: null,
      lastPushAtMs: null,
    })

    const sync = read(local, true)
    await sync.refresh()

    expect(sync.status.value).toBe('error')
  })

  it('menampilkan waktu sinkron terakhir hanya kalau memang pernah ada', async () => {
    const local = storage()
    const sync = read(local, true)

    await sync.refresh()
    expect(sync.lastSyncAtMs.value).toBeNull()

    await local.putSyncState({
      deviceId: 'devicea',
      cursor: 5,
      status: 'synced',
      lastPullAtMs: NOW - 60_000,
      lastPushAtMs: NOW,
    })
    await sync.refresh()

    expect(sync.lastSyncAtMs.value).toBe(NOW)
  })
})

/**
 * Record yang tidak bisa dibuka tetap tersimpan di perangkat; yang hilang hanya tampilannya. Karena itu
 * jumlahnya muncul sebagai keterangan terpisah dan TIDAK mengubah arti `status` (yang tetap berasal
 * dari outbox + jaringan).
 */
describe('record terkarantina', () => {
  const USER = '018f2c4e-0000-7000-8000-00000000000a'
  const OTHER = '018f2c4e-0000-7000-8000-00000000000b'

  /** Node tidak punya `localStorage`; composable ini hanya membacanya, jadi stub tipis cukup. */
  function fakeLocalStorage(): Storage {
    const values = new Map<string, string>()

    return {
      get length() {
        return values.size
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => {
        values.delete(key)
      },
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
    } as Storage
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    clearQuarantineForTest()
  })

  afterEach(() => {
    clearQuarantineForTest()
    vi.unstubAllGlobals()
  })

  it('jumlahnya ikut hasil refresh dan kembali nol setelah karantina dibersihkan', async () => {
    const sync = read(storage(), true, USER)

    await sync.refresh()
    expect(sync.blockedCount.value).toBe(0)
    expect(sync.status.value).toBe('synced')

    quarantineRecord(USER, '018f2c4e-0000-7000-8000-0000000000c1')
    quarantineRecord(USER, '018f2c4e-0000-7000-8000-0000000000c2')

    await sync.refresh()
    expect(sync.blockedCount.value).toBe(2)
    // Keterangan ini bukan status baru: data lain tetap tersinkron.
    expect(sync.status.value).toBe('synced')

    clearQuarantineForTest()
    await sync.refresh()
    expect(sync.blockedCount.value).toBe(0)
  })

  it('tetap melaporkan jumlahnya saat penyimpanan lokal belum terbuka', async () => {
    quarantineRecord(USER, '018f2c4e-0000-7000-8000-0000000000c3')
    const sync = read(null, true, USER)

    await sync.refresh()

    expect(sync.status.value).toBeNull()
    expect(sync.blockedCount.value).toBe(1)
  })

  it('hanya menghitung milik akun aktif', async () => {
    quarantineRecord(USER, '018f2c4e-0000-7000-8000-0000000000c4')
    quarantineRecord(OTHER, '018f2c4e-0000-7000-8000-0000000000c5')

    const active = read(storage(), true, USER)
    await active.refresh()
    expect(active.blockedCount.value).toBe(1)

    // Belum login / belum tahu akunnya: jangan menampilkan angka milik akun mana pun.
    const anonymous = read(storage(), true, null)
    await anonymous.refresh()
    expect(anonymous.blockedCount.value).toBe(0)
  })
})
