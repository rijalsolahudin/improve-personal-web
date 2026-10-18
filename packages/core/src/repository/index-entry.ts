import {
  pointIndex,
  spanIndex,
  type EntityType,
  type RecordIndexEntry,
} from '../domain/envelope.ts'

/**
 * Helper penyusunan `record_index` dan penyaringan hasil query rentang.
 *
 * Ditaruh di `repository/` (bukan disalin ke tiap adapter) karena logika "apakah record ini beririsan
 * dengan rentang" harus sama persis di web dan native - kalau tidak, kalender bisa menampilkan hasil
 * berbeda di dua platform untuk data yang sama.
 */

/** Entri index untuk entitas berdurasi (jadwal): `start_at` .. `start_at + duration_ms`. */
export function scheduleRangeIndex(input: {
  readonly recordId: string
  readonly startAt: number
  readonly endAt: number
  readonly updatedAtMs: number
  readonly entityType?: EntityType
}): RecordIndexEntry {
  return spanIndex(
    input.recordId,
    input.entityType ?? 'schedule',
    input.startAt,
    input.endAt,
    input.updatedAtMs,
  )
}

/** Entri index untuk entitas bertitik waktu (deadline task, target countdown, tanggal jurnal). */
export function pointRangeIndex(input: {
  readonly recordId: string
  readonly entityType: EntityType
  readonly atMs: number
  readonly updatedAtMs: number
}): RecordIndexEntry {
  return pointIndex(input.recordId, input.entityType, input.atMs, input.updatedAtMs)
}

/**
 * Apakah sebuah baris index beririsan dengan rentang `[fromMs, toMs]`.
 *
 * Rentang yang salah satu ujungnya `null` dianggap tidak berbatas di ujung itu - ini yang membuat
 * jadwal tanpa durasi (`range_end_ms = null`) tetap terpilih oleh query "dari sekian ke sekian", dan
 * jurnal tanpa batas atas tetap bisa ditanyakan "semua setelah tanggal X".
 *
 * Implementasi adapter yang meng-query lewat index boleh memakai logika yang sama untuk memfilter
 * hasil, tapi pemfilteran di DB (index `(entity_type, range_start_ms)`) tetap yang menentukan
 * performa - fungsi ini bukan pengganti index.
 */
export function indexOverlapsRange(
  entry: Pick<RecordIndexEntry, 'rangeStartMs' | 'rangeEndMs'>,
  fromMs: number | undefined,
  toMs: number | undefined,
): boolean {
  const start = entry.rangeStartMs
  const end = entry.rangeEndMs ?? entry.rangeStartMs

  // Record tanpa dimensi waktu (mis. `user_prefs`) tidak pernah cocok dengan filter waktu.
  if (start === null) return fromMs === undefined && toMs === undefined

  if (fromMs !== undefined && end !== null && end < fromMs) return false
  if (toMs !== undefined && start > toMs) return false
  return true
}

/**
 * Normalisasi rentang dari spec query.
 *
 * Rentang terbalik (`from > to`) berarti tidak ada yang cocok - bukan otomatis ditukar, karena itu
 * menandakan bug pemanggil, dan hasil kosong lebih jujur daripada hasil yang "dibetulkan" diam-diam.
 */
export function normalizeQueryRange(query: { readonly fromMs?: number; readonly toMs?: number }): {
  readonly fromMs: number | undefined
  readonly toMs: number | undefined
  readonly empty: boolean
} {
  const { fromMs, toMs } = query
  if (fromMs !== undefined && toMs !== undefined && toMs < fromMs) {
    return { fromMs, toMs, empty: true }
  }
  return { fromMs, toMs, empty: false }
}

/** Bandingkan dua entri index untuk sorting rentang. */
export function compareIndexEntries(
  a: Pick<RecordIndexEntry, 'rangeStartMs' | 'recordId'>,
  b: Pick<RecordIndexEntry, 'rangeStartMs' | 'recordId'>,
): number {
  const left = a.rangeStartMs ?? Number.NEGATIVE_INFINITY
  const right = b.rangeStartMs ?? Number.NEGATIVE_INFINITY
  if (left !== right) return left < right ? -1 : 1
  if (a.recordId === b.recordId) return 0
  return a.recordId < b.recordId ? -1 : 1
}

/** Tipe entitas yang punya dimensi waktu di `record_index` (dipakai validasi & dokumentasi). */
export const INDEXED_ENTITY_TYPES: readonly EntityType[] = [
  'schedule',
  'schedule_occurrence',
  'todo',
  'habit_checkin',
  'journal_entry',
  'countdown',
  'pomodoro_session',
  'goal',
  'goal_chapter',
]
