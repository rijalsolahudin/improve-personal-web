import { hlcSchema } from '@improve-personal/contracts'
import { z } from 'zod'

import {
  CURRENT_SCHEMA_VERSION,
  ENTITY_TYPES,
  entityTypeSchema,
  schemaVersionSchema,
  type EntityType,
} from '../domain/envelope.ts'
import { epochMsSchema, uuidV7Schema } from '../domain/entities/primitives.ts'
import { localDateOf } from '../recurrence/timezone.ts'

/**
 * Berkas export/import JSON (PRD F10 "Import & Export", AC T12).
 *
 * Bentuk berkas ini adalah **envelope §6 + payload Bagian B `database.dbml` dalam plaintext** - itu
 * disengaja: user harus bisa membuka berkasnya sendiri dan membacanya. Konsekuensinya berkas ini
 * TIDAK terenkripsi, dan itu ditulis eksplisit di berkas (`encrypted: false`) sekaligus di
 * peringatan UI (`BACKUP_PLAINTEXT_WARNING`) - bukan cuma di dokumentasi.
 *
 * Yang ada di berkas:
 * - `schemaVersion` (angka, versi payload - yang dipakai `io/migrations.ts`) DAN `version` (string,
 *   versi format berkas). Dua-duanya perlu: yang pertama menjawab "data ini bisa dibaca build ini?",
 *   yang kedua menjawab "bentuk berkasnya masih yang ini?".
 * - `dataCount` per tipe entitas: dipakai UI untuk preview "N jadwal, M task, ..." sebelum import,
 *   tanpa harus menunggu validasi penuh.
 * - `records`: satu array, bukan peta per tipe - urutan tipe entitas bisa bertambah tanpa mengubah
 *   bentuk berkas.
 */

/** Penanda jenis berkas, supaya JSON lain tidak pernah dianggap backup. */
export const BACKUP_FORMAT = 'ip-backup'

/** Versi FORMAT berkas (bukan versi payload). Naikkan kalau bentuk berkasnya berubah. */
export const BACKUP_FORMAT_VERSION = '1.0.0'

/** Versi format yang masih bisa dibaca build ini. */
export const SUPPORTED_BACKUP_FORMAT_VERSIONS: readonly string[] = [BACKUP_FORMAT_VERSION]

/** Berkas ini selalu plaintext. Kalau nanti ada berkas terenkripsi, tipenya akan berbeda. */
export const BACKUP_ENCRYPTED = false

/** Batas ukuran berkas yang diterima import (32 MB). Berkas lebih besar ditolak SEBELUM di-parse. */
export const BACKUP_MAX_BYTES = 32 * 1024 * 1024

/** Batas jumlah record per berkas; pagar supaya berkas raksasa tidak menghabiskan memori perangkat. */
export const BACKUP_MAX_RECORDS = 50_000

/** Peringatan wajib sebelum export (PRD F10). UI menampilkannya apa adanya. */
export const BACKUP_PLAINTEXT_WARNING =
  'File ini berisi data terbaca (tidak terenkripsi). Simpan dengan aman atau kasih ke orang terpercaya saja.'

export const backupRecordSchema = z
  .object({
    /** UUIDv7, dibuat client saat record pertama ditulis. */
    id: uuidV7Schema,
    type: entityTypeSchema,
    /** Metadata plaintext, sama seperti di `record` - yang menentukan pemenang LWW. */
    hlc: hlcSchema,
    /** Tombstone; ikut terbawa export supaya hapus tidak "hidup lagi" setelah import. */
    deleted: z.boolean(),
    schemaVersion: schemaVersionSchema,
    /** Payload domain (Bagian B `database.dbml`), divalidasi per tipe oleh `validateBackupText`. */
    data: z.unknown(),
  })
  .strict()

export type BackupRecord = z.infer<typeof backupRecordSchema>

const dataCountShape = Object.fromEntries(ENTITY_TYPES.map((type) => [type, z.int().min(0)]))

/** Jumlah record per tipe entitas - semua tipe selalu ada (nilainya boleh 0). */
export const backupDataCountSchema = z.object(dataCountShape)

export type BackupDataCount = z.infer<typeof backupDataCountSchema>

export const backupDocumentSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    version: z.string(),
    /** Versi payload; record boleh lebih lama dan akan dimigrasikan (`io/migrations.ts`). */
    schemaVersion: schemaVersionSchema,
    exportedAtMs: epochMsSchema,
    /** Selalu `false`. Berkas dengan `true` ditolak dengan alasan yang jelas, bukan tebakan. */
    encrypted: z.literal(BACKUP_ENCRYPTED),
    dataCount: backupDataCountSchema,
    records: z.array(backupRecordSchema),
  })
  .strict()

export type BackupDocument = z.infer<typeof backupDocumentSchema>

/** Record saat disusun untuk export: payload sudah plaintext (hasil dekripsi shell). */
export type BackupRecordInput = {
  readonly id: string
  readonly type: EntityType
  readonly hlc: string
  readonly deleted: boolean
  readonly schemaVersion?: number
  readonly data: unknown
}

export type BuildBackupInput = {
  readonly records: readonly BackupRecordInput[]
  readonly exportedAtMs: number
  /** Versi app yang membuat berkas, buat jejak saat debug. Bukan rahasia. */
  readonly appVersion?: string
}

/**
 * Susun dokumen backup dari record plaintext.
 *
 * Tidak melempar error untuk payload yang aneh: yang memutuskan boleh/tidaknya sebuah berkas adalah
 * `validateBackupText` saat import. Fungsi ini cuma menyusun.
 */
export function buildBackupDocument(input: BuildBackupInput): BackupDocument {
  const records: BackupRecord[] = input.records.map((record) => ({
    id: record.id,
    type: record.type,
    hlc: record.hlc,
    deleted: record.deleted,
    schemaVersion: record.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    data: record.data,
  }))

  const dataCount = emptyDataCount()
  for (const record of records) dataCount[record.type] += 1

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAtMs: input.exportedAtMs,
    encrypted: BACKUP_ENCRYPTED,
    dataCount,
    records,
  }
}

/** Semua tipe entitas dengan nilai 0 - dipakai export & preview import. */
export function emptyDataCount(): Record<EntityType, number> {
  const counts = {} as Record<EntityType, number>
  for (const type of ENTITY_TYPES) counts[type] = 0
  return counts
}

/** Ubah hitungan per tipe jadi baris teks untuk preview import ("3 jadwal, 12 task"). */
export function describeDataCount(counts: Readonly<Partial<Record<EntityType, number>>>): string {
  const parts: string[] = []
  for (const type of ENTITY_TYPES) {
    const count = counts[type] ?? 0
    if (count > 0) parts.push(`${count} ${type}`)
  }
  return parts.length === 0 ? 'tidak ada data' : parts.join(', ')
}

/** Serialisasi berkas. `pretty` (default) supaya berkasnya benar-benar bisa dibaca manusia. */
export function serializeBackup(document: BackupDocument, options?: { pretty?: boolean }): string {
  return options?.pretty === false ? JSON.stringify(document) : JSON.stringify(document, null, 2)
}

/** Nama berkas sesuai PRD F10: `improve-personal-backup-YYYY-MM-DD.json` (tanggal lokal perangkat). */
export function backupFileName(exportedAtMs: number, tz: string): string {
  return `improve-personal-backup-${localDateOf(exportedAtMs, tz)}.json`
}
