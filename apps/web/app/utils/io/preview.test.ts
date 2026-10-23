import {
  BackupImportInvariantError,
  emptyDataCount,
  type ImportRejection,
  type ImportRejectionReason,
} from '@improve-personal/core'
import { describe, expect, it } from 'vitest'

import {
  backupPreviewRows,
  describeImportInvariantError,
  describeImportRejection,
  formatByteSize,
} from './preview'

/**
 * Teks export/import (F10). Yang diuji di sini adalah dua janji ke user:
 * 1. preview hanya menampilkan tipe yang benar-benar ada, dengan label yang bisa dibaca;
 * 2. penolakan berkas dijelaskan dengan bahasa yang bisa ditindaklanjuti, bukan kode alasan.
 */

const MISMATCH_MESSAGE =
  'Jumlah data di berkas tidak cocok dengan isinya. Berkas mungkin rusak atau sudah diubah.'

function rejection(reason: ImportRejectionReason, message: string): ImportRejection {
  return { ok: false, reason, message, issues: [] }
}

describe('backupPreviewRows', () => {
  it('menampilkan hanya tipe berisi data, memakai label Indonesia dan urutan ENTITY_TYPES', () => {
    const counts = emptyDataCount()
    counts.todo = 3
    counts.journal_entry = 2
    counts.schedule = 1

    expect(backupPreviewRows(counts)).toEqual([
      { type: 'schedule', label: 'jadwal', count: 1 },
      { type: 'todo', label: 'task', count: 3 },
      { type: 'journal_entry', label: 'jurnal', count: 2 },
    ])
  })

  it('berkas kosong menghasilkan daftar kosong (bukan baris nol)', () => {
    expect(backupPreviewRows(emptyDataCount())).toEqual([])
  })
})

describe('describeImportRejection', () => {
  it('DATA_COUNT_MISMATCH menjelaskan kenapa berkasnya tidak dipakai', () => {
    const message = describeImportRejection(rejection('DATA_COUNT_MISMATCH', MISMATCH_MESSAGE))

    expect(message).toContain('Jumlah data di berkas tidak cocok dengan isinya')
    expect(message).toContain('angka yang salah')
  })

  it('alasan tanpa hint memakai pesan core apa adanya', () => {
    const message = 'File rusak: isinya bukan JSON yang bisa dibaca.'

    expect(describeImportRejection(rejection('INVALID_JSON', message))).toBe(message)
  })
})

describe('describeImportInvariantError', () => {
  it('tidak memakai istilah "invarian" dan menegaskan data lama tidak berubah', () => {
    const message = describeImportInvariantError(
      new BackupImportInvariantError(['todo/abc: dataCount tidak cocok']),
    )

    expect(message).not.toContain('invarian')
    expect(message).toContain('tidak lolos pemeriksaan akhir')
    expect(message).toContain('tidak diubah')
    expect(message).toContain('1 masalah')
  })
})

describe('formatByteSize', () => {
  it('membaca ukuran berkas dalam MB/KB/byte', () => {
    expect(formatByteSize(32 * 1024 * 1024)).toBe('32 MB')
    expect(formatByteSize(Math.round(1.5 * 1024 * 1024))).toBe('1,5 MB')
    expect(formatByteSize(512)).toBe('512 byte')
  })
})
