import { describe, expect, it } from 'vitest'

import { createMemoryStorage } from './memory.ts'
import { createManualClock } from './clock.ts'
import { runStorageAdapterContractTests } from './contract.ts'

/**
 * Adapter memori diuji dengan suite kontrak yang sama yang nanti dipakai IndexedDB (web) dan SQLite
 * (mobile) - AC T23: "adapter SQLite lolos test repository yang sama dengan IndexedDB".
 */

runStorageAdapterContractTests('memori', (clock) => createMemoryStorage({ clock }))

describe('createMemoryStorage - perilaku khusus test', () => {
  it('tidak berbagi state antar instance', () => {
    const first = createMemoryStorage({ clock: createManualClock(0) })
    const second = createMemoryStorage({ clock: createManualClock(0) })

    expect(first).not.toBe(second)
  })

  it('instance kedua mulai kosong walau instance pertama sudah dipakai', async () => {
    const clock = createManualClock(1_700_000_000_000)
    const first = createMemoryStorage({ clock })
    const second = createMemoryStorage({ clock })

    await first.runTransaction('test.seed', async (tx) => {
      await tx.putRecord({
        sealed: {
          id: '018f2c4e-0000-7000-8000-000000000001',
          hlc: '1700000000000-0-devicea',
          deleted: false,
          blob: 'QUJD',
        },
        index: null,
        op: 'put',
        outbox: { id: 'outbox-1', queuedAtMs: clock.nowMs() },
      })
    })

    expect(await first.countOutbox()).toBe(1)
    expect(await second.countOutbox()).toBe(0)
    expect(await second.getSyncState()).toBeNull()
  })

  it('jam adapter dipakai untuk created_at, bukan jam global', async () => {
    const clock = createManualClock(1_700_000_000_000)
    const storage = createMemoryStorage({ clock })

    await storage.runTransaction('test.seed', async (tx) => {
      await tx.putRecord({
        sealed: {
          id: '018f2c4e-0000-7000-8000-000000000002',
          hlc: '1700000000000-0-devicea',
          deleted: false,
          blob: 'QUJD',
        },
        index: null,
        op: 'put',
        outbox: { id: 'outbox-2', queuedAtMs: clock.nowMs() },
      })
    })

    const record = await storage.getRecord('018f2c4e-0000-7000-8000-000000000002')
    expect(record?.createdAtMs).toBe(1_700_000_000_000)
  })
})
