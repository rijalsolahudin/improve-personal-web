import { type EntityType, type Record, CURRENT_SCHEMA_VERSION } from './envelope.ts'

/**
 * Helper envelope murni - dipakai semua use case supaya bentuk record selalu sama.
 */

/** Entri registry (diisi di `domain/index.ts` untuk menghindari siklus impor). */
export type EnvelopeParts = {
  readonly id: string
  readonly hlc: string
  readonly deleted: boolean
  readonly schemaVersion: number
}

/**
 * Ubah payload domain jadi `Record<T>` (envelope §6).
 *
 * `data` disimpan apa adanya tanpa validasi: validasi schema adalah urusan jalur import (`io/import`)
 * dan jalur baca; di sini cuma bentuk envelope-nya yang dibangun.
 */
export function makeRecord<T>(parts: {
  readonly id: string
  readonly type: EntityType
  readonly hlc: string
  readonly data: T
  readonly deleted?: boolean
  readonly schemaVersion?: number
}): Record<T> {
  return {
    id: parts.id,
    type: parts.type,
    hlc: parts.hlc,
    deleted: parts.deleted ?? false,
    schemaVersion: parts.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    data: parts.data,
  }
}

/** `record` yang diminta sudah tombstones - dipakai saat hapus (tombstone ikut sync). */
export function softDeleteRecord<T>(record: Record<T>, hlc: string): Record<T> {
  return { ...record, hlc, deleted: true }
}

/** Apakah record ini tombstone. */
export function isDeleted(record: Pick<Record<unknown>, 'deleted'>): boolean {
  return record.deleted
}

/**
 * Envelope untuk baris `record` di disk: `id`/`hlc`/`deleted` keluar dari blob.
 *
 * Ditaruh di domain (bukan di `ports.ts`) karena ini aturan bentuk data, bukan kontrak adapter.
 */
export function envelopePartsOf<T>(record: Record<T>): EnvelopeParts {
  return {
    id: record.id,
    hlc: record.hlc,
    deleted: record.deleted,
    schemaVersion: record.schemaVersion,
  }
}
