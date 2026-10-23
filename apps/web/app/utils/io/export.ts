import {
  BackupExportLimitError,
  ENTITY_TYPES,
  backupFileName,
  buildBackupDocument,
  serializeBackup,
  type BackupDocument,
  type BackupRecordInput,
  type CryptoProvider,
  type SecureKeyMaterial,
  type SerializeBackupOptions,
  type StorageAdapter,
} from '@improve-personal/core'

import { createRepository } from '../storage/repository'

/**
 * Export JSON (PRD F10): kumpulkan SEMUA record yang tersimpan, susun dokumen backup, serialisasi.
 *
 * Yang menentukan bentuk modul ini:
 * - **Semua tipe entitas, termasuk tombstone.** Record yang sudah dihapus tetap ikut: kalau tidak,
 *   data yang dihapus di perangkat ini akan "hidup lagi" setelah backup dipulihkan di perangkat lain
 *   (tombstone adalah cara hapus ikut tersinkron - ARCHITECTURE §9).
 * - **Baca lewat repository, bukan membuka blob sendiri.** Repository sudah memegang dekripsi,
 *   migrasi versi, dan validasi payload; jalur kedua yang membaca blob akan menyimpang diam-diam.
 * - **Batas ukuran ditegakkan core, bukan UI.** `serializeBackup` melempar `BackupExportLimitError`
 *   kalau berkasnya tidak akan bisa diimpor lagi; UI hanya menampilkan pesannya apa adanya.
 */

/** Dependensi baca saja - `LocalDataSession` memenuhi bentuk ini. */
export type BackupReadSource = {
  readonly storage: StorageAdapter
  readonly provider: CryptoProvider
  readonly dataKey: SecureKeyMaterial
}

export type BackupFile = {
  readonly name: string
  readonly text: string
  readonly document: BackupDocument
}

export type CreateBackupFileInput = {
  readonly source: BackupReadSource
  readonly exportedAtMs: number
  /** Zona waktu perangkat, dipakai nama berkas (`YYYY-MM-DD` lokal). */
  readonly tz: string
  /**
   * Batas yang bisa diubah. Hanya untuk test: jalur nyata memakai default core (`BACKUP_MAX_BYTES`
   * dan `BACKUP_MAX_RECORDS`), karena batas itulah yang juga ditegakkan saat import.
   */
  readonly limits?: SerializeBackupOptions
}

/**
 * Semua record milik akun ini dalam bentuk yang dipakai berkas backup.
 *
 * Dibaca per tipe (bukan `Promise.all` 20 tipe sekaligus) supaya puncak memori saat export tetap
 * satu tipe pada satu waktu - isi seluruh backup toh ditahan di memori sampai berkas selesai disusun.
 */
export async function collectBackupRecords(source: BackupReadSource): Promise<BackupRecordInput[]> {
  const records: BackupRecordInput[] = []

  for (const type of ENTITY_TYPES) {
    const stored = await createRepository<unknown>(source, type).listAll({ includeDeleted: true })

    for (const record of stored) {
      records.push({
        id: record.id,
        type: record.type,
        hlc: record.hlc,
        deleted: record.deleted,
        schemaVersion: record.schemaVersion,
        data: record.data,
      })
    }
  }

  return records
}

/**
 * Susun berkas backup siap unduh.
 *
 * Melempar `BackupExportLimitError` (dari core) kalau berkasnya akan melebihi batas import - berkas
 * yang tidak bisa dipulihkan aplikasi sendiri sama dengan kehilangan data, jadi lebih baik user tahu
 * sekarang daripada saat butuh restore.
 */
export async function createBackupFile(input: CreateBackupFileInput): Promise<BackupFile> {
  const records = await collectBackupRecords(input.source)
  const document = buildBackupDocument(
    { records, exportedAtMs: input.exportedAtMs },
    input.limits?.maxRecords === undefined ? undefined : { maxRecords: input.limits.maxRecords },
  )
  const text = serializeBackup(document, input.limits)

  return { name: backupFileName(input.exportedAtMs, input.tz), text, document }
}

/**
 * Pesan kegagalan export untuk UI.
 *
 * `BackupExportLimitError.message` ditampilkan **apa adanya**: pesan itu menyebut angka sebenarnya dan
 * batasnya, dan menambah awalan/akhiran hanya mengaburkan satu-satunya informasi yang berguna.
 */
export function describeExportFailure(cause: unknown): string {
  if (cause instanceof BackupExportLimitError) return cause.message

  const detail = cause instanceof Error ? cause.message : 'sebab tidak dikenal'
  return `Gagal membuat berkas backup: ${detail}`
}
