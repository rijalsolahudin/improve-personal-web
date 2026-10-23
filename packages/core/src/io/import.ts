import { utf8ByteLength } from '@improve-personal/contracts'

import { validateEntityPayload } from '../domain/entities/index.ts'
import {
  CURRENT_SCHEMA_VERSION,
  ENTITY_TYPES,
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
import { collectGoalInvariantIssues } from './goal-invariants.ts'
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
 *
 * Invarian lintas-record (goal + chapter + tautan) diperiksa `io/goal-invariants.ts` di kedua fase:
 * validasi per-record tidak bisa melihat goal induk, jadi chapter di luar periode dan tautan ganda
 * hanya ketahuan kalau seluruh berkas dibaca sekaligus.
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
  /**
   * `dataCount` di berkas tidak cocok dengan jumlah record yang benar-benar ada. Preview import
   * memakai `dataCount`, jadi berkas yang tidak konsisten tidak boleh dipakai memutuskan "ganti
   * semua" berdasarkan angka yang salah.
   */
  'DATA_COUNT_MISMATCH',
  /** Ada record yang payload-nya tidak cocok schema tipe entitasnya. */
  'INVALID_RECORD',
  /**
   * Aturan lintas-record F13 dilanggar: chapter di luar periode main goal, tautan menunjuk chapter
   * yang tidak ada, atau satu item punya lebih dari satu tautan. Tidak bisa ditangkap validasi
   * per-record karena butuh goal induknya.
   */
  'GOAL_INVARIANT_VIOLATION',
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

/**
 * Dilempar `applyBackupImport` kalau dokumen yang diserahkan tidak lolos invarian record.
 *
 * Fase 1 (`validateBackupText`) sudah memeriksa semua ini untuk berkas yang datang dari luar, tapi
 * `applyBackupImport` tetap memeriksa ulang: bug wiring di shell (`JSON.parse` -> `as BackupDocument`
 * -> apply) tidak boleh bisa menulis payload rusak ke storage.
 */
export class BackupImportInvariantError extends Error {
  /** Detail teknis (path + masalahnya), tanpa isi payload user. */
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super('Data backup tidak lolos pemeriksaan invarian. Tidak ada data yang diubah.')
    this.name = 'BackupImportInvariantError'
    this.issues = issues
  }
}

const MAX_REPORTED_ISSUES = 20

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function countByType(records: readonly BackupRecord[]): Record<EntityType, number> {
  const counts = emptyDataCount()
  for (const record of records) counts[record.type] += 1
  return counts
}

/** Selisih antara `dataCount` yang tertulis di berkas dan isi `records` yang sebenarnya. */
function findDataCountIssues(document: BackupDocument): string[] {
  const actual = countByType(document.records)
  const issues: string[] = []
  for (const type of ENTITY_TYPES) {
    const claimed = document.dataCount[type]
    if (claimed !== actual[type]) {
      issues.push(`dataCount.${type}: tertulis ${claimed}, isi berkas ${actual[type]}`)
    }
  }
  return issues
}

/** Record yang mengaku versi skema lebih baru dari `maxVersion` (tidak bisa dibaca build ini). */
function collectVersionIssues(records: readonly BackupRecord[], maxVersion: number): string[] {
  const issues: string[] = []
  for (const record of records) {
    if (record.schemaVersion > maxVersion) {
      issues.push(
        `${record.type}/${record.id}: schemaVersion ${record.schemaVersion} > ${maxVersion}`,
      )
    }
  }
  return issues
}

/** Payload per tipe yang tidak cocok schema-nya. Satu record bermasalah = seluruh berkas ditolak. */
function collectPayloadIssues(records: readonly BackupRecord[]): string[] {
  const issues: string[] = []
  for (const record of records) {
    const validation = validateEntityPayload(record.type, record.data)
    if (!validation.ok) {
      for (const issue of validation.issues.slice(0, 3)) {
        issues.push(`${record.type}/${record.id}: ${issue}`)
      }
    }
  }
  return issues
}

/** Semua invarian yang wajib dipegang dokumen sebelum ditulis ke storage. */
function assertImportableDocument(document: BackupDocument): BackupDocument {
  const parsed = backupDocumentSchema.safeParse(document)
  if (!parsed.success) {
    throw new BackupImportInvariantError(
      parsed.error.issues
        .slice(0, MAX_REPORTED_ISSUES)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    )
  }

  const candidate = parsed.data
  const duplicate = findDuplicateId(candidate.records)
  const issues = [
    ...collectVersionIssues(candidate.records, candidate.schemaVersion),
    ...(duplicate === null ? [] : [`dua data dengan id yang sama: ${duplicate}`]),
    ...collectPayloadIssues(candidate.records),
    ...collectGoalInvariantIssues(candidate.records),
    ...findDataCountIssues(candidate),
  ]
  if (issues.length > 0) {
    throw new BackupImportInvariantError(issues.slice(0, MAX_REPORTED_ISSUES))
  }

  return candidate
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
      `Berkas terlalu besar (${bytes} byte, batas ${maxBytes} byte).`,
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

  // Versi per record tidak boleh lebih baru dari yang dimengerti build ini, dan tidak boleh lebih
  // baru dari versi payload yang diumumkan berkasnya sendiri (kalau tidak, migrasi akan memperlakukan
  // data "masa depan" sebagai data versi lama).
  const futureRecords = collectVersionIssues(document.records, targetVersion)
  if (futureRecords.length > 0) {
    const newestRecordVersion = Math.max(...document.records.map((record) => record.schemaVersion))
    return reject(
      'VERSION_TOO_NEW',
      `Ada data dari versi skema lebih baru (schema ${newestRecordVersion}, aplikasi ini ${targetVersion}). Perbarui aplikasi dulu.`,
      futureRecords.slice(0, MAX_REPORTED_ISSUES),
    )
  }

  const inconsistentRecords = collectVersionIssues(document.records, document.schemaVersion)
  if (inconsistentRecords.length > 0) {
    return reject(
      'SCHEMA_MISMATCH',
      'Versi data di dalam berkas tidak konsisten dengan versi berkasnya.',
      inconsistentRecords.slice(0, MAX_REPORTED_ISSUES),
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
  const payloadIssues = collectPayloadIssues(document.records)
  if (payloadIssues.length > 0) {
    return reject(
      'INVALID_RECORD',
      `Ada ${payloadIssues.length} masalah pada isi data. Tidak ada data yang diubah.`,
      payloadIssues.slice(0, MAX_REPORTED_ISSUES),
    )
  }

  // Invarian lintas-record F13 (PRD T17): validasi per-record tidak bisa melihat goal induk, jadi
  // chapter di luar periode goal dan tautan ganda baru ketahuan setelah SEMUA record di-parse.
  // Dijalankan sebelum `dataCount` supaya masalah yang lebih spesifik dilaporkan apa adanya.
  const goalIssues = collectGoalInvariantIssues(document.records)
  if (goalIssues.length > 0) {
    return reject(
      'GOAL_INVARIANT_VIOLATION',
      `Ada ${goalIssues.length} masalah pada struktur goal: chapter harus berada di dalam periode goal dan satu item cuma boleh punya satu tautan. Tidak ada data yang diubah.`,
      goalIssues.slice(0, MAX_REPORTED_ISSUES),
    )
  }

  // Dicek terakhir supaya berkas yang punya masalah lebih spesifik (duplikat/payload rusak) tetap
  // dilaporkan apa adanya. `dataCount` dipakai layar preview ("N jadwal, M task"): kalau tidak cocok
  // dengan isinya, angka yang dilihat user bohong - tolak, jangan biarkan user memilih "ganti semua"
  // berdasarkan angka itu.
  const dataCountIssues = findDataCountIssues(document)
  if (dataCountIssues.length > 0) {
    return reject(
      'DATA_COUNT_MISMATCH',
      'Jumlah data di berkas tidak cocok dengan isinya. Berkas mungkin rusak atau sudah diubah.',
      dataCountIssues.slice(0, MAX_REPORTED_ISSUES),
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
  /**
   * Dokumen hasil `validateBackupText` (sudah dimigrasikan). Invariannya diperiksa ulang di
   * `applyBackupImport`, jadi dokumen yang disusun sendiri tidak bisa melewati validasi.
   */
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
 * `replace-all` TIDAK menghapus data lebih dulu. Urutannya sengaja: periksa invarian -> tentukan
 * record yang ditulis -> **selesaikan enkripsi/index/id outbox seluruh record** -> baru `wipe()` ->
 * tulis per batch. Dengan begitu kegagalan `seal` (kunci tidak tersedia, crypto gagal) atau callback
 * shell lainnya terjadi saat data lama masih utuh; `wipe()` hanya dipanggil ketika semua bahan tulisan
 * sudah siap.
 *
 * Sisa jendela yang tidak bisa ditutup dari core: kegagalan TULIS setelah `wipe()` (mis. kuota disk
 * habis) masih meninggalkan data parsial. `StorageAdapter` tidak punya operasi "ganti seluruh isi"
 * atomik, jadi jaminan penuh di titik itu milik adapter platform.
 *
 * `merge` membandingkan per id dengan **LWW yang sama seperti sync** (`decideMerge`), bukan "berkas
 * selalu menang": kalau user mengedit sesuatu setelah berkas dibuat, edit itu tidak boleh hilang
 * hanya karena berkas backup-nya lebih baru soal waktu file.
 */
export async function applyBackupImport(input: ApplyImportInput): Promise<ImportApplyResult> {
  const batchSize = normalizeBatchSize(input.batchSize)
  // Defense-in-depth: dokumen yang tidak lolos invarian tidak boleh menyentuh storage sama sekali,
  // walau pemanggil melewati `validateBackupText` (mis. `JSON.parse` -> `as BackupDocument`).
  const document = assertImportableDocument(input.document)
  const records = document.records

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

  // Tahap "staging": semua enkripsi + index + id outbox diselesaikan SEBELUM `wipe()`. `seal`
  // dipanggil di luar transaksi (lihat catatan modul) dan bisa gagal; kegagalan di sini tidak
  // menghapus apa pun.
  const staged: StagedRecord[] = []
  for (const chunk of chunkRecords(toWrite, batchSize)) {
    const entries = await Promise.all(
      chunk.map(async (record) => ({
        record,
        sealed: await input.seal(record),
        index: input.indexFor === undefined ? null : input.indexFor(record),
        outboxId: input.outboxIdFor(record),
      })),
    )
    staged.push(...entries)
  }

  if (input.mode === 'replace-all') {
    await input.storage.wipe()
  }

  const perType = emptyDataCount()

  for (const chunk of chunkRecords(staged, batchSize)) {
    await input.storage.runTransaction('import.write', async (tx) => {
      for (const entry of chunk) {
        await tx.putRecord({
          sealed: entry.sealed,
          index: entry.index,
          op: entry.record.deleted ? 'delete' : 'put',
          outbox: { id: entry.outboxId, queuedAtMs: input.nowMs },
        })
      }
    })

    for (const entry of chunk) perType[entry.record.type] += 1
  }

  return {
    mode: input.mode,
    written: toWrite.length,
    skipped,
    perType,
    outboxRows: toWrite.length,
  }
}

type StagedRecord = {
  readonly record: BackupRecord
  readonly sealed: SealedRecord
  readonly index: RecordIndexEntry | null
  readonly outboxId: string
}

function normalizeBatchSize(batchSize: number | undefined): number {
  if (batchSize === undefined || !Number.isSafeInteger(batchSize) || batchSize < 1) {
    return DEFAULT_IMPORT_BATCH_SIZE
  }
  return batchSize
}

function chunkRecords<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}
