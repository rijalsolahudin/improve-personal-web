import type { EntityType, RecordIndexEntry } from '@improve-personal/core'

import { fromIsoDate } from '../time'

/**
 * Baris `record_index` dari record domain yang sudah didekripsi.
 *
 * Dipakai dua jalur yang harus menghasilkan rentang SAMA dengan jalur tulis fiturnya:
 * - import backup (`utils/io/import.ts`),
 * - record hasil pull sync (`utils/sync/controller.ts`).
 *
 * Kalau rentangnya beda, data masuk ke storage tetapi tidak muncul di query kalender/daftar.
 * Modul ini sengaja terpisah dari `io/import.ts` supaya controller sync tidak menyeret seluruh
 * mesin import/backup ke chunk shell.
 */

type IndexRange = {
  readonly startMs: number | null
  readonly endMs: number | null
}

const NO_RANGE: IndexRange = { startMs: null, endMs: null }

export function indexEntryForRecord(
  record: { readonly id: string; readonly type: EntityType; readonly data: unknown },
  nowMs: number,
): RecordIndexEntry {
  const range = indexRangeOf(record)

  return {
    recordId: record.id,
    entityType: record.type,
    rangeStartMs: range.startMs,
    rangeEndMs: range.endMs,
    updatedAtMs: nowMs,
  }
}

function indexRangeOf(record: { readonly type: EntityType; readonly data: unknown }): IndexRange {
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
