import { z } from 'zod'

/**
 * Envelope record (ARCHITECTURE.md §6) + `entity_type` + `sync_op` + `sync_status`.
 *
 * Bentuk ini SAMA untuk semua entitas - tidak ada tabel per entitas di disk (`database.dbml`
 * Bagian A). `type` dan `schemaVersion` ikut dienkripsi ke dalam blob (ADR 4), jadi server tidak tahu
 * record ini memo atau todo.
 */

/** `entity_type` - nilai persis dari `database.dbml` Bagian A. */
export const ENTITY_TYPES = [
  'schedule',
  'schedule_exception',
  'schedule_occurrence',
  'todo',
  'eisenhower_placement',
  'pomodoro_settings',
  'pomodoro_session',
  'countdown',
  'habit',
  'habit_checkin',
  'journal_entry',
  'journal_reflection',
  'journal_affirmation',
  'journal_sticker',
  'journal_mention',
  'goal',
  'goal_chapter',
  'goal_link',
  'decoration',
  'user_prefs',
  'user_profile',
] as const

export type EntityType = (typeof ENTITY_TYPES)[number]

export const entityTypeSchema = z.enum(ENTITY_TYPES)

/**
 * Versi skema payload saat ini.
 *
 * Naikkan angka ini HANYA bersamaan dengan penambahan langkah migrasi di `io/migrations.ts`.
 * Record lama dengan angka lebih kecil dilewatkan migrasi saat dibaca; angka yang lebih BESAR dari ini
 * (data dari app versi lebih baru) ditolak - bukan ditebak-tebak.
 */
export const CURRENT_SCHEMA_VERSION = 1

/** `schemaVersion` wajib integer positif; 0 dan negatif bukan versi yang sah. */
export const schemaVersionSchema = z.int().min(1)

/**
 * Envelope di memori (sudah didekripsi) - `ARCHITECTURE.md` §6.
 *
 * `data` sengaja belum divalidasi di sini: validasi bentuk `T` dilakukan per tipe entitas oleh
 * schema di `domain/entities/`.
 */
export type Record<T> = {
  /** UUIDv7 - urut waktu, dibuat di client. */
  readonly id: string
  readonly type: EntityType
  /** `${wallMs}-${counter}-${deviceId}`; bandingkan lewat `compareHlc`, bukan string. */
  readonly hlc: string
  /** Tombstone: hapus ikut tersinkron. */
  readonly deleted: boolean
  readonly schemaVersion: number
  readonly data: T
}

/** Bentuk envelope saat sudah dienkripsi - inilah yang ditulis ke disk dan dikirim ke server. */
export type SealedRecord = {
  readonly id: string
  readonly hlc: string
  readonly deleted: boolean
  /** XChaCha20-Poly1305(`type` + `schemaVersion` + `data`), AAD = `id`. */
  readonly blob: string
}

/** `sync_op` - operasi yang diantre di `sync_outbox`. */
export const SYNC_OPS = ['put', 'delete'] as const

export type SyncOp = (typeof SYNC_OPS)[number]

export const syncOpSchema = z.enum(SYNC_OPS)

/**
 * `sync_status` - status yang dibaca UI (ARCHITECTURE.md §9).
 *
 * - `synced`  : tidak ada baris outbox dan cursor sudah terbaru.
 * - `pending` : ada baris outbox menunggu dikirim.
 * - `offline` : tidak ada koneksi; outbox tetap menumpuk tanpa error.
 * - `error`   : push/pull terakhir gagal (bukan karena offline), mis. `rejected` permanen.
 */
export const SYNC_STATUSES = ['synced', 'pending', 'offline', 'error'] as const

export type SyncStatus = (typeof SYNC_STATUSES)[number]

export const syncStatusSchema = z.enum(SYNC_STATUSES)

/**
 * Isi plaintext di dalam blob SEBELUM dienkripsi.
 *
 * Dipisah dari `Record<T>` karena `id`/`hlc`/`deleted` adalah metadata plaintext yang hidup di luar
 * blob - kalau ikut dienkripsi, server tidak bisa membandingkan versi (ARCHITECTURE.md §9).
 */
export type RecordPayload<T> = {
  readonly type: EntityType
  readonly schemaVersion: number
  readonly data: T
}

/** Entri `record_index` - kunci rentang plaintext supaya jalur panas tidak perlu dekripsi semua record. */
export type RecordIndexEntry = {
  readonly recordId: string
  readonly entityType: EntityType
  /** Kunci rentang: jadwal, deadline task, check-in, target countdown, tanggal jurnal. */
  readonly rangeStartMs: number | null
  /** Untuk entitas berdurasi; `null` kalau titik waktu tunggal. */
  readonly rangeEndMs: number | null
  readonly updatedAtMs: number
}

/**
 * Helper index: record "bertitik waktu" (tidak berdurasi).
 *
 * `range_end_ms = null` ditafsirkan sama dengan `range_start_ms` saat query, jadi satu bentuk helper
 * ini cukup untuk deadline task, target countdown, tanggal jurnal, dan check-in.
 */
export function pointIndex(
  recordId: string,
  entityType: EntityType,
  atMs: number,
  updatedAtMs: number,
): RecordIndexEntry {
  return { recordId, entityType, rangeStartMs: atMs, rangeEndMs: null, updatedAtMs }
}

/** Helper index: record berdurasi (jadwal dengan `start_at` + `duration_ms`). */
export function spanIndex(
  recordId: string,
  entityType: EntityType,
  fromMs: number,
  toMs: number,
  updatedAtMs: number,
): RecordIndexEntry {
  return { recordId, entityType, rangeStartMs: fromMs, rangeEndMs: toMs, updatedAtMs }
}
