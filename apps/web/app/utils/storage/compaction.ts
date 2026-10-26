import type { StorageAdapter } from '@improve-personal/core'
import { SYNC_TOMBSTONE_RETENTION_DAYS } from '@improve-personal/contracts'

import type { TombstoneMaintenance } from './indexeddb'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Compaction tombstone lokal (task #109).
 *
 * Server mempurge tombstone lebih tua dari `SYNC_TOMBSTONE_RETENTION_DAYS` dan menaikkan
 * `purged_seq`; perangkat yang cursornya tertinggal di bawah watermark akan menerima
 * `SYNC_RESET_REQUIRED` dan full pull. Karena itu client boleh memakai batas yang SAMA untuk membuang
 * tombstone lokal - lebih muda dari itu justru masih dibutuhkan perangkat lain.
 *
 * Angka batas diambil dari kontrak, bukan konstanta baru, supaya client dan server tidak bisa
 * berbeda pendapat.
 */
export function tombstoneCutoffMs(nowMs: number): number {
  return nowMs - SYNC_TOMBSTONE_RETENTION_DAYS * MS_PER_DAY
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
