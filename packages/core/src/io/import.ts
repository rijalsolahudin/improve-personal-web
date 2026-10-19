import { utf8ByteLength } from '@improve-personal/contracts'

import { validateEntityPayload } from '../domain/entities/index.ts'
import {
  CURRENT_SCHEMA_VERSION,
  type EntityType,
  type RecordIndexEntry,
  type SealedRecord,
} from '../domain/envelope.ts'
import type { StorageAdapter } from '../ports.ts'
import {
  BACKUP_MAX_BYTES,
  BACKUP_MAX_RECORDS,
  SUPPORTED_BACKUP_FORMAT_VERSIONS,
  backupDocumentSchema,
  emptyDataCount,
  type BackupDocument,
  type BackupRecord,
} from './backup.ts'
import { migrateRecords, type SchemaMigration } from './migrations.ts'
import { decideMerge } from '../sync/merge.ts'

/**
 * Import berkas backup JSON (PRD F10, AC T12).
 *
 * Dipisah DUA fase dengan sengaja, dan pemisahan itu yang jadi jaminan "data lama tetap aman":
 *
 * 1. **`validateBackupText`** - murni, tidak menyentuh storage sama sekali. Membaca teks, memeriksa
 *    ukuran, versi format, versi skema, bentuk envelope, LENGKAP dengan schema payload per tipe
 *    entitas. Hasilnya `ok` atau penolakan dengan alasan yang bisa ditampilkan ke user.
 * 2. **`applyBackupImport`** - menulis ke storage, dan hanya dipanggil dengan dokumen yang sudah
 *    lolos fase 1. Karena fase 1 tidak pernah menulis, berkas invalid/asing PASTI tidak mengubah data
 *    apa pun (diuji: test membandingkan isi storage sebelum dan sesudah import yang ditolak).
 *
 * Dua hal yang mudah salah dan ditutup di sini:
 * - **Validasi versi SEBELUM menulis**, bukan saat menulis: kalau versi diperiksa sambil menulis,
 *   berkas dari app versi lebih baru bisa meninggalkan separuh data sebelum ditolak.
 * - **`seal` dipanggil DI LUAR transaksi.** `ports.ts` melarang `await` non-storage di dalam
 *   transaksi (IndexedDB auto-commit) - jadi semua record dienkripsi lebih dulu, baru transaksinya
 *   dibuka.
 */

export const IMPORT_MODES = ['merge', 'replace-all'] as const

export type ImportMode = (typeof IMPORT_MODES)[number]

export const IMPORT_REJECTION_REASONS = [
  /** Isi berkas bukan objek JSON. */
  'NOT_OBJECT',
  /** Berkas lebih besar dari `BACKUP_MAX_BYTES` - ditolak sebelum di-parse. */
  'FILE_TOO_LARGE',
  'INVALID_JSON',
  /** Berkas backup terenkripsi: format yang didukung cuma berkas plaintext. */
  'ENCRYPTED_NOT_SUPPORTED',
  /** `format`/`version` berkas tidak dikenal build ini. */
  'FORMAT_VERSION_UNSUPPORTED',
  /** Bentuk berkas tidak cocok schema (field hilang/asing/tipe salah). */
  'SCHEMA_MISMATCH',
  /** `schemaVersion` lebih baru dari yang dimengerti build ini: user diminta upgrade. */
  'VERSION_TOO_NEW',
  /** Versi lebih lama tapi tidak ada jalur migrasinya. */
  'NO_MIGRATION_PATH',
  'TOO_MANY_RECORDS',
  /** Dua record dengan id sama di satu berkas - tidak jelas mana yang benar. */
  'DUPLICATE_ID',
  /** Ada record yang payload-nya tidak cocok schema tipe entitasnya. */
  'INVALID_RECORD',
] as const

export type ImportRejectionReason = (typeof IMPORT_REJECTION_REASONS)[number]

export type ImportRejection = {
  readonly ok: false
  readonly reason: ImportRejectionReason
  /** Pesan siap tampil ke user (bahasa Indonesia, tanpa detail internal yang membingungkan). */
  readonly message: string
  /** Detail teknis: path + masalahnya. Kosong kalau tidak ada yang bisa dirinci. */
  readonly issues: readonly string[]
}

export type BackupValidation =
  | {
      readonly ok: true
      readonly document: BackupDocument
      /** Versi asal berkas kalau dimigrasikan; `null` kalau sudah versi terkini. */
      readonly migratedFrom: number | null
      /** Berapa record yang berubah karena migrasi (0 kalau tidak ada migrasi). */
      readonly migratedRecords: number
    }
  | ImportRejection

export type ValidateBackupOptions = {
  readonly maxBytes?: number
  readonly maxRecords?: number
  /** Versi skema tujuan; default `CURRENT_SCHEMA_VERSION`. Test memakai nilai lain untuk uji migrasi. */
  readonly targetSchemaVersion?: number
  /** Daftar migrasi; default `SCHEMA_MIGRATIONS`. */
  readonly migrations?: readonly SchemaMigration[]
}

const MAX_REPORTED_ISSUES = 20

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Fase 1: periksa teks berkas. **Tidak ada satu pun efek samping** - tidak ada storage, tidak ada
 * jam, tidak ada jaringan. Aman dipanggil untuk preview sebelum user memilih mode import.
 */
export function validateBackupText(
  text: string,
  options?: ValidateBackupOptions,
): BackupValidation {
  const maxBytes = options?.maxBytes ?? BACKUP_MAX_BYTES
  const maxRecords = options?.maxRecords ?? BACKUP_MAX_RECORDS
  const targetVersion = options?.targetSchemaVersion ?? CURRENT_SCHEMA_VERSION

  const bytes = utf8ByteLength(text)
  if (bytes > maxBytes) {
    return reject(
      'FILE_TOO_LARGE',
      `Berkas terlalu besar (${bytes} byte, batas ${maxBytes} byte). Pecah berkasnya atau export sebagian.`,
      [],
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return reject('INVALID_JSON', 'File rusak: isinya bukan JSON yang bisa dibaca.', [])
  }

  if (!isPlainObject(parsed)) {
    return reject('NOT_OBJECT', 'File rusak: isi berkas harus berupa objek JSON.', [])
  }

  // Berkas terenkripsi ditolak dengan alasannya sendiri - "schema mismatch" akan menyesatkan user.
  if (parsed['encrypted'] === true) {
    return reject(
      'ENCRYPTED_NOT_SUPPORTED',
      'Berkas ini terenkripsi. Import hanya menerima berkas backup plaintext.',
      [],
    )
  }

  const formatVersion = parsed['version']
  if (
    typeof formatVersion === 'string' &&
    !SUPPORTED_BACKUP_FORMAT_VERSIONS.includes(formatVersion)
  ) {
    return reject(
      'FORMAT_VERSION_UNSUPPORTED',
      `Versi berkas (${formatVersion}) tidak dikenal. Perbarui aplikasi lalu coba lagi.`,
      [],
    )
  }

  const schemaVersion = parsed['schemaVersion']
  if (
    typeof schemaVersion === 'number' &&
    Number.isSafeInteger(schemaVersion) &&
    schemaVersion > targetVersion
  ) {
    return reject(
      'VERSION_TOO_NEW',
      `Berkas dibuat aplikasi versi lebih baru (schema ${schemaVersion}, aplikasi ini ${targetVersion}). Perbarui aplikasi dulu.`,
      [],
    )
  }

  const documentResult = backupDocumentSchema.safeParse(parsed)
  if (!documentResult.success) {
    return reject(
      'SCHEMA_MISMATCH',
      'Struktur berkas tidak cocok dengan backup aplikasi.',
      documentResult.error.issues
        .slice(0, MAX_REPORTED_ISSUES)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    )
  }

  let document: BackupDocument = documentResult.data

  if (document.records.length > maxRecords) {
    return reject(
      'TOO_MANY_RECORDS',
      `Berkas berisi ${document.records.length} data, melebihi batas ${maxRecords}.`,
      [],
    )
  }

  const duplicate = findDuplicateId(document.records)
  if (duplicate !== null) {
    return reject('DUPLICATE_ID', `Berkas berisi dua data dengan id yang sama (${duplicate}).`, [])
  }

  let migratedFrom: number | null = null
  let migratedRecords = 0

  // Migrasi dijalankan SEBELUM validasi payload: bentuk payload berubah antar versi, jadi memvalidasi
  // data versi lama dengan schema versi sekarang akan menolak berkas yang sebenarnya sah (dan
  // sebaliknya: berkas hasil migrasi tetap wajib lolos validasi penuh di bawah).
  if (document.schemaVersion < targetVersion) {
    migratedFrom = document.schemaVersion
    const migration = migrateRecords({
      records: document.records,
      fromVersion: document.schemaVersion,
      toVersion: targetVersion,
      ...(options?.migrations === undefined ? {} : { migrations: options.migrations }),
    })

    if (!migration.ok) {
      return reject(
        'NO_MIGRATION_PATH',
        `Data versi ${document.schemaVersion} tidak bisa dimigrasikan ke versi ${targetVersion}. Perbarui aplikasi lalu coba lagi.`,
        [],
      )
    }

    migratedRecords = migration.records.length
    document = { ...document, schemaVersion: targetVersion, records: [...migration.records] }
  }

  // Validasi payload penuh per tipe entitas - inilah yang membuat "berkas rusak" tidak pernah masuk
  // separuh: satu record bermasalah menggagalkan seluruh berkas, sebelum apa pun ditulis.
  const payloadIssues: string[] = []
  for (const record of document.records) {
    const validation = validateEntityPayload(record.type, record.data)
    if (!validation.ok) {
      for (const issue of validation.issues.slice(0, 3)) {
        payloadIssues.push(`${record.type}/${record.id}: ${issue}`)
      }
    }
  }
  if (payloadIssues.length > 0) {
    return reject(
      'INVALID_RECORD',
      `Ada ${payloadIssues.length} masalah pada isi data. Tidak ada data yang diubah.`,
      payloadIssues.slice(0, MAX_REPORTED_ISSUES),
    )
  }

  return { ok: true, document, migratedFrom, migratedRecords }
}

function findDuplicateId(records: readonly BackupRecord[]): string | null {
  const seen = new Set<string>()
  for (const record of records) {
    if (seen.has(record.id)) return record.id
    seen.add(record.id)
  }
  return null
}

function reject(
  reason: ImportRejectionReason,
  message: string,
  issues: readonly string[],
): ImportRejection {
  return { ok: false, reason, message, issues }
}

export type ApplyImportInput = {
  readonly storage: StorageAdapter
  readonly document: BackupDocument
  readonly mode: ImportMode
  readonly nowMs: number
  /**
   * Enkripsi satu record jadi `SealedRecord`. Wajib ada dan dipanggil DI LUAR transaksi.
   *
   * Core tidak boleh mengimplementasikan kripto (`packages/crypto` di luar scope paket ini), dan
   * shell sudah punya data key setelah unlock - jadi shell yang menutup fungsi ini ke
   * `CryptoProvider.sealRecord`.
   */
  readonly seal: (record: BackupRecord) => Promise<SealedRecord>
  /**
   * Id baris outbox per record. Core tidak punya randomness, jadi UUID dibuat shell seperti pada
   * penulisan biasa - record hasil import HARUS ikut tersinkron (PRD F10: "execute import → sync").
   */
  readonly outboxIdFor: (record: BackupRecord) => string
  /** Entri index rentang; shell yang tahu cara membangunnya (lihat `sync/pull.ts`). */
  readonly indexFor?: (record: BackupRecord) => RecordIndexEntry | null
  /**
   * Jumlah record per transaksi. Bukan satu transaksi raksasa (bisa puluhan ribu record) dan bukan
   * satu transaksi per record (terlalu banyak commit): 200 record per transaksi.
   */
  readonly batchSize?: number
}

export type ImportApplyResult = {
  readonly mode: ImportMode
  /** Record yang benar-benar ditulis. */
  readonly written: number
  /** Record yang dilewati karena versi lokalnya lebih baru (mode `merge`). */
  readonly skipped: number
  readonly perType: Record<EntityType, number>
  /** Baris outbox yang dibuat - semuanya menunggu dikirim, jadi status UI jadi `pending`. */
  readonly outboxRows: number
}

const DEFAULT_IMPORT_BATCH_SIZE = 200

/**
 * Fase 2: tulis dokumen yang sudah divalidasi.
 *
 * `replace-all` menghapus isi storage lebih dulu (`wipe`), lalu menulis seluruh berkas. `merge`
 * membandingkan per id dengan **LWW yang sama seperti sync** (`decideMerge`), bukan "berkas selalu
 * menang": kalau user mengedit sesuatu setelah berkas dibuat, edit itu tidak boleh hilang hanya
 * karena berkas backup-nya lebih baru soal waktu file.
 */
export async function applyBackupImport(input: ApplyImportInput): Promise<ImportApplyResult> {
  const batchSize = normalizeBatchSize(input.batchSize)
  const records = input.document.records

  if (input.mode === 'replace-all') {
    await input.storage.wipe()
  }

  const toWrite: BackupRecord[] = []
  let skipped = 0

  if (input.mode === 'merge') {
    for (const chunk of chunkRecords(records, batchSize)) {
      const locals = await input.storage.getRecords(chunk.map((record) => record.id))
      const localById = new Map(locals.map((record) => [record.id, record] as const))

      for (const record of chunk) {
        const decision = decideMerge(localById.get(record.id) ?? null, record)
        if (decision.action === 'skip') {
          skipped += 1
          continue
        }
        toWrite.push(record)
      }
    }
  } else {
    for (const record of records) toWrite.push(record)
  }

  const perType = emptyDataCount()

  for (const chunk of chunkRecords(toWrite, batchSize)) {
    // Enkripsi dulu (di luar transaksi), baru tulis - lihat catatan modul ini.
    const sealed = await Promise.all(
      chunk.map(async (record) => ({ record, sealedRecord: await input.seal(record) })),
    )

    await input.storage.runTransaction('import.write', async (tx) => {
      for (const entry of sealed) {
        await tx.putRecord({
          sealed: entry.sealedRecord,
          index: input.indexFor === undefined ? null : input.indexFor(entry.record),
          op: entry.record.deleted ? 'delete' : 'put',
          outbox: { id: input.outboxIdFor(entry.record), queuedAtMs: input.nowMs },
        })
      }
    })

    for (const entry of sealed) perType[entry.record.type] += 1
  }

  return {
    mode: input.mode,
    written: toWrite.length,
    skipped,
    perType,
    outboxRows: toWrite.length,
  }
}

function normalizeBatchSize(batchSize: number | undefined): number {
  if (batchSize === undefined || !Number.isSafeInteger(batchSize) || batchSize < 1) {
    return DEFAULT_IMPORT_BATCH_SIZE
  }
  return batchSize
}

function chunkRecords(
  records: readonly BackupRecord[],
  size: number,
): readonly (readonly BackupRecord[])[] {
  const chunks: BackupRecord[][] = []
  for (let index = 0; index < records.length; index += size) {
    chunks.push(records.slice(index, index + size))
  }
  return chunks
}
