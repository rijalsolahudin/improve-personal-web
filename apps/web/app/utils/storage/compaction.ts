import type { StorageAdapter } from '@improve-personal/core'
import { TOMBSTONE_RETENTION_DAYS } from '@improve-personal/contracts'

import type { TombstoneMaintenance } from './indexeddb'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Compaction tombstone lokal (task #109).
 *
 * Tombstone lebih tua dari `TOMBSTONE_RETENTION_DAYS` boleh dibuang. Yang lebih muda masih dibutuhkan
 * saat import/transfer "gabung", supaya record yang sudah dihapus di sini tidak hidup lagi dari
 * salinan perangkat lain.
 */
export function tombstoneCutoffMs(nowMs: number): number {
  return nowMs - TOMBSTONE_RETENTION_DAYS * MS_PER_DAY
}

/** Apakah adapter ini punya kemampuan hapus fisik tombstone (saat ini hanya IndexedDB web). */
export function supportsTombstonePurge(
  storage: StorageAdapter,
): storage is StorageAdapter & TombstoneMaintenance {
  return typeof (storage as Partial<TombstoneMaintenance>).purgeTombstones === 'function'
}

/**
 * Jalankan compaction bila didukung. Adapter tanpa kemampuan ini (mis. implementasi mobile nanti)
 * mengembalikan 0 - bukan error, karena pemeliharaan ruang bukan kewajiban port core.
 */
export async function compactTombstones(
  storage: StorageAdapter,
  nowMs: number = Date.now(),
): Promise<number> {
  if (!supportsTombstonePurge(storage)) return 0

  return storage.purgeTombstones(tombstoneCutoffMs(nowMs))
}
