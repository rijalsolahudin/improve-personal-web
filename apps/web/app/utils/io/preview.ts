import {
  ENTITY_TYPES,
  type BackupDataCount,
  type BackupImportInvariantError,
  type EntityType,
  type ImportRejection,
  type ImportRejectionReason,
} from '@improve-personal/core'

/**
 * Teks yang dilihat user saat export/import (PRD F10) - dipisah dari komponen supaya bisa diuji
 * tanpa DOM dan supaya pemetaan alasan penolakan tidak tersebar di template.
 *
 * Pesan inti milik `packages/core` (mis. `BackupExportLimitError.message`, `ImportRejection.message`)
 * TIDAK ditulis ulang di sini: dua versi pesan untuk satu kegagalan akan menyimpang, dan yang dilihat
 * user harus pesan yang sama dengan yang diuji di core. Yang ditambahkan hanya *hint* untuk alasan
 * yang artinya tidak jelas bagi orang awam.
 */

const ENTITY_TYPE_LABELS = {
  schedule: 'jadwal',
  schedule_exception: 'perubahan jadwal',
  schedule_occurrence: 'kehadiran jadwal',
  todo: 'task',
  eisenhower_placement: 'penempatan Eisenhower',
  pomodoro_settings: 'pengaturan Pomodoro',
  pomodoro_session: 'sesi Pomodoro',
  countdown: 'countdown',
  habit: 'habit',
  habit_checkin: 'check-in habit',
  journal_entry: 'jurnal',
  journal_reflection: 'refleksi jurnal',
  journal_affirmation: 'afirmasi jurnal',
  journal_sticker: 'stiker jurnal',
  journal_mention: 'mention jurnal',
  goal: 'goal',
  goal_chapter: 'chapter goal',
  goal_link: 'tautan goal',
  decoration: 'hiasan',
  user_prefs: 'preferensi',
} as const satisfies Record<EntityType, string>

export type BackupPreviewRow = {
  readonly type: EntityType
  readonly label: string
  readonly count: number
}

/**
 * Baris preview dari `dataCount` berkas - BUKAN hasil `JSON.parse` sendiri.
 *
 * `dataCount` sudah dicocokkan silang dengan isi `records` oleh `validateBackupText` (alasan
 * `DATA_COUNT_MISMATCH`), jadi angka di layar ini adalah angka yang benar-benar akan ditulis.
 * Tipe dengan nilai 0 tidak ditampilkan: "0 stiker jurnal" hanya menambah baris tanpa informasi.
 */
export function backupPreviewRows(counts: BackupDataCount): BackupPreviewRow[] {
  const rows: BackupPreviewRow[] = []

  for (const type of ENTITY_TYPES) {
    const count = counts[type] ?? 0
    if (count > 0) rows.push({ type, label: ENTITY_TYPE_LABELS[type], count })
  }

  return rows
}

/** Tambahan penjelasan untuk alasan penolakan yang tidak cukup jelas kalau dibaca sendiri. */
const REJECTION_HINTS: Partial<Record<ImportRejectionReason, string>> = {
  DATA_COUNT_MISMATCH:
    'Berkasnya tidak dipakai supaya kamu tidak memilih "ganti semua" berdasarkan angka yang salah. Coba export ulang dari perangkat asal.',
  FILE_TOO_LARGE:
    'Berkas sebesar itu tidak bisa dipulihkan aplikasi ini. Pilih berkas backup lain, atau pecah datanya lebih dulu.',
  ENCRYPTED_NOT_SUPPORTED:
    'Import hanya menerima berkas JSON biasa hasil tombol Export, bukan berkas terenkripsi.',
  VERSION_TOO_NEW: 'Perbarui aplikasi ke versi terbaru, lalu ulangi import.',
}

/** Pesan penolakan siap tampil: pesan core apa adanya + hint kalau ada. */
export function describeImportRejection(rejection: ImportRejection): string {
  const hint = REJECTION_HINTS[rejection.reason]
  return hint === undefined ? rejection.message : `${rejection.message} ${hint}`
}

/**
 * Pesan untuk `BackupImportInvariantError`.
 *
 * Pesan aslinya menyebut "invarian" - kata yang benar secara teknis tapi tidak berarti apa pun bagi
 * user. Yang penting bagi user cuma dua hal: berkasnya ditolak, dan data lamanya tidak berubah.
 */
export function describeImportInvariantError(error: BackupImportInvariantError): string {
  const detail = error.issues.length === 0 ? '' : ` (${error.issues.length} masalah terdeteksi)`
  return `Berkas backup tidak lolos pemeriksaan akhir${detail}. Data yang ada di perangkat ini tidak diubah. Coba export ulang dari perangkat asal atau pakai berkas backup lain.`
}

const BYTES_PER_KB = 1024
const BYTES_PER_MB = 1024 * 1024

/** Ukuran berkas dalam bentuk yang bisa dibaca ("32 MB", "1,5 MB", "900 byte"). */
export function formatByteSize(bytes: number): string {
  if (bytes >= BYTES_PER_MB) return `${trimTrailingZero(bytes / BYTES_PER_MB)} MB`
  if (bytes >= BYTES_PER_KB) return `${Math.round(bytes / BYTES_PER_KB)} KB`
  return `${bytes} byte`
}

function trimTrailingZero(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',')
}
