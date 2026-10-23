import {
  BACKUP_MAX_BYTES,
  DEFAULT_USER_PREFS,
  buildBackupDocument,
  emptyDataCount,
  serializeBackup,
  type BackupRecordInput,
} from '@improve-personal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBackupImport } from './useBackupImport'

/**
 * Regresi bug QA #26 putaran 2: pilih berkas A lalu cepat pilih berkas B, tetapi nama/preview/import
 * masih memakai isi A.
 *
 * `fileName` ditulis sinkron saat berkas dipilih, sedangkan dokumen & preview baru di-set setelah
 * `await file.text()`. Tanpa token permintaan, hasil baca A yang selesai belakangan menimpa state B -
 * yang terlihat user adalah nama B dengan isi A. Test di sini memakai berkas yang `text()`-nya bisa
 * ditahan supaya urutan selesai bisa dibalik secara deterministik.
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
  return {
    name,
    size: content.length,
    text: async () => content,
  } as unknown as File
}

/** Berkas yang pembacaannya ditahan sampai test memanggil `resolveText()`. */
function deferredFile(name: string, content: string): { file: File; resolveText: () => void } {
  let settle: (text: string) => void = () => {}
  const text = new Promise<string>((resolve) => {
    settle = resolve
  })

  const file = { name, size: content.length, text: () => text } as unknown as File

  return { file, resolveText: () => settle(content) }
}

function oversizedFile(): File {
  return {
    name: 'terlalu-besar.json',
    size: BACKUP_MAX_BYTES + 1,
    text: async () => documentText([1]),
  } as unknown as File
}

const IMPORT_RESULT = {
  mode: 'merge' as const,
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

describe('useBackupImport - perlombaan pilih berkas', () => {
  it('berkas lambat (A) lalu berkas cepat (B): nama, preview, dan dokumen mengikuti B', async () => {
    const io = useBackupImport()
    const slow = deferredFile('lambat.json', documentText([1, 2, 3]))

    const slowSelection = io.selectFile(slow.file)
    await io.selectFile(fileWith('cepat.json', documentText([4, 5])))

    expect(io.fileName.value).toBe('cepat.json')
    expect(io.preview.value?.totalRecords).toBe(2)

    // A baru selesai dibaca setelah B tampil - hasilnya harus diabaikan.
    slow.resolveText()
    await slowSelection

    expect(io.fileName.value).toBe('cepat.json')
    expect(io.preview.value?.totalRecords).toBe(2)
    expect(io.error.value).toBeNull()
  })

  it('A selesai lebih dulu lalu B gagal parse: tidak ada preview A yang menempel ke nama B', async () => {
    const io = useBackupImport()
    await io.selectFile(fileWith('a.json', documentText([1, 2])))
    expect(io.preview.value?.totalRecords).toBe(2)

    await io.selectFile(fileWith('b.json', 'bukan json'))

    expect(io.fileName.value).toBe('b.json')
    expect(io.preview.value).toBeNull()
    expect(io.error.value).not.toBeNull()
  })

  it('hasil A yang selesai setelah B gagal tidak menghidupkan preview basi', async () => {
    const io = useBackupImport()
    const slow = deferredFile('lambat.json', documentText([1, 2, 3]))

    const slowSelection = io.selectFile(slow.file)
    await io.selectFile(fileWith('gagal.json', 'bukan json'))

    slow.resolveText()
    await slowSelection

    expect(io.fileName.value).toBe('gagal.json')
    expect(io.preview.value).toBeNull()
    expect(io.error.value).not.toBeNull()
  })

  it('memilih berkas baru saat preview A sudah tampil mengganti preview-nya', async () => {
    const io = useBackupImport()
    await io.selectFile(fileWith('a.json', documentText([1, 2])))
    expect(io.preview.value?.totalRecords).toBe(2)

    await io.selectFile(fileWith('b.json', documentText([3, 4, 5])))

    expect(io.fileName.value).toBe('b.json')
    expect(io.preview.value?.totalRecords).toBe(3)
  })

  it('pemilihan berurutan normal tetap diterima (token tidak memblokir permintaan sah)', async () => {
    const io = useBackupImport()
    await io.selectFile(fileWith('pertama.json', documentText([1])))
    expect(io.preview.value?.totalRecords).toBe(1)

    await io.selectFile(fileWith('kedua.json', documentText([2, 3])))

    expect(io.fileName.value).toBe('kedua.json')
    expect(io.preview.value?.totalRecords).toBe(2)
  })

  it('berkas di atas batas ditolak tanpa dibaca, lalu berkas berikutnya tetap bisa dipilih', async () => {
    const io = useBackupImport()
    await io.selectFile(oversizedFile())

    expect(io.preview.value).toBeNull()
    expect(io.error.value).toContain('terlalu besar')

    await io.selectFile(fileWith('kecil.json', documentText([1, 2])))

    expect(io.error.value).toBeNull()
    expect(io.preview.value?.totalRecords).toBe(2)
  })

  it('import memakai dokumen berkas terakhir setelah perlombaan (mode gabung)', async () => {
    const io = useBackupImport()
    const slow = deferredFile('lambat.json', documentText([1, 2, 3]))

    const slowSelection = io.selectFile(slow.file)
    await io.selectFile(fileWith('cepat.json', documentText([4, 5])))

    slow.resolveText()
    await slowSelection

    mocks.applyBackupDocument.mockResolvedValue(IMPORT_RESULT)
    await io.applyImport()

    expect(mocks.applyBackupDocument).toHaveBeenCalledTimes(1)
    const applied = mocks.applyBackupDocument.mock.calls[0]?.[0] as
      | { readonly mode: string; readonly document: { readonly records: readonly unknown[] } }
      | undefined

    expect(applied?.mode).toBe('merge')
    expect(applied?.document.records).toHaveLength(2)
  })
})
