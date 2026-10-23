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
 * Regresi BUG-55-A (QA #55): keputusan mode ("gabung" vs "ganti semua") harus dikunci saat
 * `applyImport` lolos gerbang, bukan dibaca setelah `await`.
 *
 * Skenario nyata: user menekan Import, lalu menekan "Ganti semua" selagi tombol menampilkan
 * "Mengimpor…" (dulu tombol mode tidak disabled). Tanpa snapshot, import yang sudah divalidasi
 * sebagai `merge` dieksekusi sebagai `replace-all` tanpa konfirmasi - `wipe()` menghapus data lokal.
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

function fileWith(name: string, content: string): File {
  return { name, size: content.length, text: async () => content } as unknown as File
}

const RESULT = {
  mode: 'merge' as const,
  written: 2,
  skipped: 0,
  perType: emptyDataCount(),
  outboxRows: 2,
}

beforeEach(() => {
  mocks.applyBackupDocument.mockReset()
  mocks.ensure.mockReset()
  mocks.applyBackupDocument.mockResolvedValue(RESULT)
})

describe('QA #55 - mode dikunci saat applyImport berjalan', () => {
  it('mode yang berubah setelah import mulai tidak boleh mengubah keputusan mode (butuh konfirmasi baru)', async () => {
    const io = useBackupImport()
    await io.selectFile(fileWith('a.json', documentText([1, 2])))

    let releaseEnsure: () => void = () => {}
    mocks.ensure.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseEnsure = () => resolve({ clock: { nowMs: () => NOW } })
        }),
    )

    const pending = io.applyImport()
    expect(io.isBusy.value).toBe(true)

    // Setara klik "Ganti semua" di Segmented saat tombol import menampilkan "Mengimpor…".
    // Konfirmasi ("Saya mengerti…") tidak dicentang: checkbox-nya disabled saat busy.
    io.mode.value = 'replace-all'
    expect(io.isReplaceConfirmed.value).toBe(false)

    releaseEnsure()
    await pending

    expect(mocks.applyBackupDocument).toHaveBeenCalledTimes(1)
    expect(mocks.applyBackupDocument.mock.calls[0]?.[0]).toMatchObject({ mode: 'merge' })
  })

  it('replace-all tanpa konfirmasi lewat jalur programatik ditolak dengan pesan jelas, tanpa menulis', async () => {
    const io = useBackupImport()
    await io.selectFile(fileWith('a.json', documentText([1, 2])))

    io.mode.value = 'replace-all'
    expect(io.isReplaceConfirmed.value).toBe(false)
    expect(io.canApply.value).toBe(false)

    await io.applyImport()

    expect(mocks.applyBackupDocument).not.toHaveBeenCalled()
    expect(io.error.value).toContain('belum dikonfirmasi')
    expect(io.isBusy.value).toBe(false)
  })
})
