import { describe, expect, it, vi } from 'vitest'

import type { StorageAdapter } from '@improve-personal/core'
import { SYNC_TOMBSTONE_RETENTION_DAYS } from '@improve-personal/contracts'

import { compactTombstones, supportsTombstonePurge, tombstoneCutoffMs } from './compaction'
import type { IndexedDbStorage } from './indexeddb'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW_MS = 1_800_000_000_000

describe('tombstoneCutoffMs', () => {
  it('memakai batas retensi tombstone dari kontrak, bukan angka lokal', () => {
    expect(tombstoneCutoffMs(NOW_MS)).toBe(NOW_MS - SYNC_TOMBSTONE_RETENTION_DAYS * DAY_MS)
  })
})

describe('supportsTombstonePurge', () => {
  it('membedakan adapter yang punya purge dari yang tidak', () => {
    const withPurge = { purgeTombstones: vi.fn() } as unknown as StorageAdapter
    const without = {} as StorageAdapter

    expect(supportsTombstonePurge(withPurge)).toBe(true)
    expect(supportsTombstonePurge(without)).toBe(false)
  })
})

describe('compactTombstones', () => {
  it('meneruskan cutoff yang benar ke adapter', async () => {
    const purgeTombstones = vi.fn().mockResolvedValue(3)
    const storage = { purgeTombstones } as unknown as IndexedDbStorage

    await expect(compactTombstones(storage, NOW_MS)).resolves.toBe(3)
    expect(purgeTombstones).toHaveBeenCalledWith(tombstoneCutoffMs(NOW_MS))
  })

  it('adapter tanpa kemampuan purge = 0, bukan error', async () => {
    await expect(compactTombstones({} as StorageAdapter, NOW_MS)).resolves.toBe(0)
  })
})
