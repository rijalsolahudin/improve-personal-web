// @vitest-environment node
import {
  createManualClock,
  createMemoryStorage,
  pointIndex,
  type StorageAdapter,
} from '@improve-personal/core'
import { describe, expect, it } from 'vitest'

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

function read(storage: StorageAdapter | null, online: boolean) {
  return useSyncStatus({ getStorage: () => storage, isOnline: () => online })
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
