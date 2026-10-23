import {
  applyBackupImport,
  type BackupDocument,
  type BackupRecord,
  type CryptoProvider,
  type HlcGenerator,
  type ImportApplyResult,
  type ImportMode,
  type RecordIndexEntry,
  type SecureKeyMaterial,
  type StorageAdapter,
} from '@improve-personal/core'

import { encodeRecord } from '../storage/record-codec'
import { createOutboxId } from '../storage/uuid'
import { fromIsoDate } from '../time'

/**
 * Import JSON (PRD F10) - bagian yang menerjemahkan dokumen tervalidasi menjadi tulisan lokal.
 *
 * Core sudah memutuskan APA yang ditulis (`applyBackupImport`) dan menolak berkas yang tidak lolos
 * invarian. Yang disediakan shell di sini hanya tiga hal yang memang milik platform:
 * 1. **`seal`**: enkripsi record dengan kunci data sesi (`encodeRecord`, jalur yang sama dengan
 *    penulisan biasa - bukan jalur kripto kedua).
 * 2. **`indexFor`**: baris `record_index` per tipe, supaya data hasil import langsung terlihat di
 *    kalender/daftar. Record tanpa dimensi waktu tetap mendapat baris index dengan rentang `null` -
 *    tanpa baris itu, `listAll` tidak akan pernah menemukannya lagi.
 * 3. **`outboxIdFor`**: id baris outbox, supaya record hasil import ikut tersinkron.
 */

/** Dependensi tulis - `LocalDataSession` memenuhi bentuk ini. */
export type BackupWriteTarget = {
  readonly storage: StorageAdapter
  readonly provider: CryptoProvider
  readonly dataKey: SecureKeyMaterial
  readonly hlc: HlcGenerator
}

export type ApplyBackupDocumentInput = {
  readonly target: BackupWriteTarget
  /** Dokumen dari `validateBackupText` - bukan hasil `JSON.parse` sendiri. */
  readonly document: BackupDocument
  readonly mode: ImportMode
  readonly nowMs: number
}

export async function applyBackupDocument(
  input: ApplyBackupDocumentInput,
): Promise<ImportApplyResult> {
  const { target, document, mode, nowMs } = input

  const result = await applyBackupImport({
    storage: target.storage,
    document,
    mode,
    nowMs,
    seal: (record) => encodeRecord(target.provider, target.dataKey, record),
    outboxIdFor: () => createOutboxId(),
    indexFor: (record) => backupIndexEntry(record, nowMs),
  })

  // HLC di berkas berasal dari perangkat lain dan bisa lebih besar dari jam perangkat ini. Tanpa
  // `observe`, edit berikutnya di sini memakai HLC lebih kecil dan kalah LWW saat sync - data hasil
  // import lalu menimpa edit baru user. Sama seperti record hasil pull (`sync/pull.ts`).
  for (const record of document.records) target.hlc.observe(record.hlc)

  return result
}

/** Pesan sukses yang menyebut jumlah data yang BENAR-BENAR tertulis. */
export function describeImportResult(result: ImportApplyResult): string {
  const skipped =
    result.skipped === 0
      ? ''
      : ` ${result.skipped} data dilewati karena versi di perangkat ini lebih baru.`
  const mode = result.mode === 'replace-all' ? 'Semua data diganti. ' : ''

  return `${mode}Import selesai, ${result.written} data masuk.${skipped}`
}

/** Pesan kegagalan di luar penolakan validasi (mis. kunci data tidak tersedia saat menulis). */
export function describeImportFailure(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : 'sebab tidak dikenal'
  return `Import gagal: ${detail}`
}

type IndexRange = {
  readonly startMs: number | null
  readonly endMs: number | null
}

const NO_RANGE: IndexRange = { startMs: null, endMs: null }

/**
 * Baris `record_index` untuk satu record backup.
 *
 * Rentang tiap tipe sengaja SAMA dengan yang ditulis fiturnya saat menyimpan (lihat
 * `utils/schedules/persistence.ts`, `utils/tasks/persistence.ts`, `utils/habits/persistence.ts`):
 * index yang berbeda membuat data hasil import tidak muncul di query rentang yang dipakai UI.
 */
export function backupIndexEntry(record: BackupRecord, nowMs: number): RecordIndexEntry {
  const range = indexRangeOf(record)

  return {
    recordId: record.id,
    entityType: record.type,
    rangeStartMs: range.startMs,
    rangeEndMs: range.endMs,
    updatedAtMs: nowMs,
  }
}

function indexRangeOf(record: BackupRecord): IndexRange {
  switch (record.type) {
    case 'schedule': {
      const startAt = numberField(record.data, 'startAt')
      if (startAt === null) return NO_RANGE
      return { startMs: startAt, endMs: startAt + (numberField(record.data, 'durationMs') ?? 0) }
    }
    case 'schedule_occurrence':
    case 'schedule_exception':
      return pointRange(numberField(record.data, 'occurrenceAt'))
    case 'todo':
      return pointRange(numberField(record.data, 'deadlineAt'))
    case 'countdown':
      return pointRange(numberField(record.data, 'targetAt'))
    case 'pomodoro_session':
      return pointRange(numberField(record.data, 'startedAt'))
    case 'habit_checkin':
      return pointRange(dayStartMs(stringField(record.data, 'localDate')))
    case 'journal_entry':
      return pointRange(dayStartMs(stringField(record.data, 'entryDate')))
    case 'goal':
      return spanRange(
        stringField(record.data, 'startDate'),
        stringField(record.data, 'targetDate'),
      )
    case 'goal_chapter':
      return spanRange(stringField(record.data, 'startDate'), stringField(record.data, 'endDate'))
    default:
      // Entitas tanpa dimensi waktu (prefs, hiasan, potongan jurnal, ...): baris index tetap dibuat
      // dengan rentang `null` supaya record bisa ditemukan berdasarkan tipe.
      return NO_RANGE
  }
}

function pointRange(atMs: number | null): IndexRange {
  return atMs === null ? NO_RANGE : { startMs: atMs, endMs: null }
}

function spanRange(fromDate: string | null, toDate: string | null): IndexRange {
  const startMs = dayStartMs(fromDate)
  if (startMs === null) return NO_RANGE
  return { startMs, endMs: dayStartMs(toDate) }
}

/** Awal hari lokal dari `YYYY-MM-DD`; `null` kalau tanggalnya tidak bisa dibaca. */
function dayStartMs(localDate: string | null): number | null {
  if (localDate === null) return null
  const ms = fromIsoDate(localDate).getTime()
  return Number.isFinite(ms) ? ms : null
}

function numberField(data: unknown, key: string): number | null {
  const value = fieldOf(data, key)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringField(data: unknown, key: string): string | null {
  const value = fieldOf(data, key)
  return typeof value === 'string' ? value : null
}

function fieldOf(data: unknown, key: string): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
  return (data as Record<string, unknown>)[key]
}
