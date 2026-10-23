import {
  DEFAULT_USER_PREFS,
  buildBackupDocument,
  emptyDataCount,
  serializeBackup,
  type BackupRecordInput,
} from '@improve-personal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBackupImport } from './useBackupImport'

/**
 * Verifikasi QA putaran 2 (task #26, T12) - pagar yang tidak terlihat di DOM.
 *
 * Tombol `disabled` hanya melindungi jalur klik. `applyImport` sendiri harus tetap menolak "ganti
 * semua" yang belum dikonfirmasi, karena jalur programatik (atau perubahan state di masa depan)
 * tidak melewati tombol. Test developer memeriksa tombolnya; test ini memanggil composable-nya
 * langsung.
 */

const NOW = 1_700_000_000_000

const mocks = vi.hoisted(() => ({
  applyBackupDocument: vi.fn(),
  ensure: vi.fn(),
}))

vi.mock('~/utils/io/import', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/io/import')>()),
  applyBackupDocument: mocks.applyBackupDocument,
}))

vi.mock('./useLocalData', () => ({
  useLocalData: () => ({ ensure: mocks.ensure }),
}))

function idFor(n: number): string {
  return `018f2c4e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

function documentText(ids: readonly number[]): string {
  const records: BackupRecordInput[] = ids.map((n) => ({
    id: idFor(n),
    type: 'user_prefs',
    hlc: `${NOW}-${n}-sumber`,
    deleted: false,
    data: { id: idFor(n), ...DEFAULT_USER_PREFS, updatedAt: NOW },
  }))

  return serializeBackup(buildBackupDocument({ records, exportedAtMs: NOW }))
}

function fileWith(content: string): File {
  return {
    name: 'backup.json',
    size: content.length,
    text: async () => content,
  } as unknown as File
}

const IMPORT_RESULT = {
  mode: 'replace-all' as const,
  written: 2,
  skipped: 0,
  perType: emptyDataCount(),
  outboxRows: 2,
}

beforeEach(() => {
  mocks.applyBackupDocument.mockReset()
  mocks.ensure.mockReset()
  mocks.ensure.mockResolvedValue({ clock: { nowMs: () => NOW } })
})

describe('useBackupImport - pagar mode "ganti semua"', () => {
  it('applyImport menolak dijalankan tanpa konfirmasi, walau dipanggil langsung dan mode sudah ganti semua', async () => {
    const io = useBackupImport()
    await io.selectFile(fileWith(documentText([1, 2])))

    expect(io.preview.value?.totalRecords).toBe(2)

    io.mode.value = 'replace-all'
    expect(io.canApply.value).toBe(false)

    await io.applyImport()
    expect(mocks.applyBackupDocument).not.toHaveBeenCalled()

    io.isReplaceConfirmed.value = true
    expect(io.canApply.value).toBe(true)

    mocks.applyBackupDocument.mockResolvedValue(IMPORT_RESULT)
    await io.applyImport()

    expect(mocks.applyBackupDocument).toHaveBeenCalledTimes(1)
    expect(mocks.applyBackupDocument.mock.calls[0]?.[0]).toMatchObject({
      mode: 'replace-all',
      nowMs: NOW,
    })
  })

  it('berkas kosong tidak bisa diimpor (mode ganti semua akan menghapus data tanpa memasukkan apa pun)', async () => {
    const io = useBackupImport()
    await io.selectFile(
      fileWith(serializeBackup(buildBackupDocument({ records: [], exportedAtMs: NOW }))),
    )

    expect(io.preview.value?.totalRecords).toBe(0)
    io.mode.value = 'replace-all'
    io.isReplaceConfirmed.value = true

    expect(io.canApply.value).toBe(false)
    await io.applyImport()
    expect(mocks.applyBackupDocument).not.toHaveBeenCalled()
  })
})
