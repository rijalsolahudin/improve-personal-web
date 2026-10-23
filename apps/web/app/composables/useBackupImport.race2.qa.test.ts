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
 * Regresi BUG-R2-1 (QA #55) - race pilih berkas. Dipertahankan sebagai jaring regresi permanen;
 * tidak memakai helper dari test developer di `useBackupImport.race.qa.test.ts`.
 *
 * Setiap berkas diberi `exportedAtMs` berbeda supaya preview bisa dipetakan ke berkas asalnya
 * (`preview.exportedAtMs`). Dengan begitu "nama B + preview A" (bug asli) dan bentuk state campuran
 * lain bisa dideteksi, bukan cuma jumlah record-nya.
 */

const HLC_NOW = 1_700_000_000_000
const EXPORTED_A = 1_700_000_100_000
const EXPORTED_B = 1_700_000_200_000
const EXPORTED_C = 1_700_000_300_000

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

function documentText(ids: readonly number[], exportedAtMs: number): string {
  const records: BackupRecordInput[] = ids.map((n) => ({
    id: idFor(n),
    type: 'user_prefs',
    hlc: `${HLC_NOW}-${n}-sumber`,
    deleted: false,
    data: { id: idFor(n), ...DEFAULT_USER_PREFS, updatedAt: HLC_NOW },
  }))

  return serializeBackup(buildBackupDocument({ records, exportedAtMs }))
}

type Deferred = {
  readonly file: File
  readonly resolve: () => void
  readonly reject: (cause: Error) => void
}

/** Berkas yang pembacaannya ditahan sampai test memanggil `resolve()`/`reject()`. */
function deferredFile(name: string, content: string): Deferred {
  let settle: (text: string) => void = () => {}
  let fail: (cause: Error) => void = () => {}
  const text = new Promise<string>((resolve, reject) => {
    settle = resolve
    fail = reject
  })

  return {
    file: { name, size: content.length, text: () => text } as unknown as File,
    resolve: () => settle(content),
    reject: (cause) => fail(cause),
  }
}

function readableFile(name: string, content: string): File {
  return { name, size: content.length, text: async () => content } as unknown as File
}

function oversizedFile(): File {
  return {
    name: 'terlalu-besar.json',
    size: BACKUP_MAX_BYTES + 1,
    text: async () => documentText([1], EXPORTED_A),
  } as unknown as File
}

const RESULT = {
  mode: 'merge' as const,
  written: 2,
  skipped: 0,
  perType: emptyDataCount(),
  outboxRows: 2,
}

/** Snapshot state yang terlihat user, untuk assertion "tidak ada state campuran". */
function visible(io: ReturnType<typeof useBackupImport>) {
  return {
    fileName: io.fileName.value,
    previewExportedAt: io.preview.value?.exportedAtMs ?? null,
    previewRecords: io.preview.value?.totalRecords ?? null,
    error: io.error.value,
    status: io.status.value,
  }
}

function appliedDocumentId(callIndex = 0): { exportedAtMs: number; recordCount: number } {
  const call = mocks.applyBackupDocument.mock.calls[callIndex]?.[0] as
    { document: { exportedAtMs: number; records: readonly unknown[] }; mode: string } | undefined
  if (call === undefined) throw new Error(`applyBackupDocument tidak dipanggil (call ${callIndex})`)

  return {
    exportedAtMs: call.document.exportedAtMs,
    recordCount: call.document.records.length,
  }
}

beforeEach(() => {
  mocks.applyBackupDocument.mockReset()
  mocks.ensure.mockReset()
  mocks.ensure.mockResolvedValue({ clock: { nowMs: () => HLC_NOW } })
})

describe('QA #55 - race pilih berkas (probe independen)', () => {
  it('A lambat lalu B cepat: setelah A selesai, nama + preview tetap milik B (bukan campuran)', async () => {
    const io = useBackupImport()
    const a = deferredFile('a.json', documentText([1, 2, 3], EXPORTED_A))

    const pendingA = io.selectFile(a.file)
    await io.selectFile(readableFile('b.json', documentText([4, 5], EXPORTED_B)))

    expect(visible(io)).toEqual({
      fileName: 'b.json',
      previewExportedAt: EXPORTED_B,
      previewRecords: 2,
      error: null,
      status: null,
    })

    a.resolve()
    await pendingA

    expect(visible(io)).toEqual({
      fileName: 'b.json',
      previewExportedAt: EXPORTED_B,
      previewRecords: 2,
      error: null,
      status: null,
    })

    mocks.applyBackupDocument.mockResolvedValue(RESULT)
    await io.applyImport()
    expect(appliedDocumentId()).toEqual({ exportedAtMs: EXPORTED_B, recordCount: 2 })
  })

  it('A lambat selesai setelah B gagal parse: error B tidak tertimpa, preview A tidak muncul', async () => {
    const io = useBackupImport()
    const a = deferredFile('a.json', documentText([1, 2, 3], EXPORTED_A))

    const pendingA = io.selectFile(a.file)
    await io.selectFile(readableFile('b.json', 'bukan json sama sekali'))

    const afterB = visible(io)
    expect(afterB.fileName).toBe('b.json')
    expect(afterB.previewExportedAt).toBeNull()
    expect(afterB.error).not.toBeNull()

    a.resolve()
    await pendingA

    expect(visible(io)).toEqual(afterB)
    expect(io.canApply.value).toBe(false)
  })

  it('A gagal dibaca (file.text reject) lalu B sukses: error A tidak muncul setelah B tampil', async () => {
    const io = useBackupImport()
    const a = deferredFile('a.json', documentText([1, 2, 3], EXPORTED_A))

    const pendingA = io.selectFile(a.file)
    await io.selectFile(readableFile('b.json', documentText([4, 5], EXPORTED_B)))

    a.reject(new Error('I/O error'))
    await pendingA

    expect(visible(io)).toEqual({
      fileName: 'b.json',
      previewExportedAt: EXPORTED_B,
      previewRecords: 2,
      error: null,
      status: null,
    })
  })

  it('mengganti berkas saat preview A tampil: preview A hilang seketika, bukan menempel ke nama B', async () => {
    const io = useBackupImport()
    await io.selectFile(readableFile('a.json', documentText([1, 2], EXPORTED_A)))
    expect(io.preview.value?.exportedAtMs).toBe(EXPORTED_A)

    const b = deferredFile('b.json', documentText([3, 4, 5], EXPORTED_B))
    const pendingB = io.selectFile(b.file)

    // Selagi B dibaca: nama sudah B, jadi preview A tidak boleh masih tampil.
    expect(visible(io)).toEqual({
      fileName: 'b.json',
      previewExportedAt: null,
      previewRecords: null,
      error: null,
      status: null,
    })
    expect(io.canApply.value).toBe(false)

    b.resolve()
    await pendingB

    expect(visible(io)).toEqual({
      fileName: 'b.json',
      previewExportedAt: EXPORTED_B,
      previewRecords: 3,
      error: null,
      status: null,
    })
  })

  it('tiga berkas selesai tidak berurutan (C, B, lalu A): yang menang tetap C', async () => {
    const io = useBackupImport()
    const a = deferredFile('a.json', documentText([1, 2, 3, 4], EXPORTED_A))
    const b = deferredFile('b.json', documentText([5, 6, 7], EXPORTED_B))
    const c = deferredFile('c.json', documentText([8, 9], EXPORTED_C))

    const pendingA = io.selectFile(a.file)
    const pendingB = io.selectFile(b.file)
    const pendingC = io.selectFile(c.file)

    c.resolve()
    await pendingC
    expect(io.preview.value?.exportedAtMs).toBe(EXPORTED_C)

    b.resolve()
    await pendingB
    expect(io.preview.value?.exportedAtMs).toBe(EXPORTED_C)

    a.resolve()
    await pendingA
    expect(visible(io)).toEqual({
      fileName: 'c.json',
      previewExportedAt: EXPORTED_C,
      previewRecords: 2,
      error: null,
      status: null,
    })

    mocks.applyBackupDocument.mockResolvedValue(RESULT)
    await io.applyImport()
    expect(appliedDocumentId()).toEqual({ exportedAtMs: EXPORTED_C, recordCount: 2 })
  })

  it('berkas kebesaran lalu berkas valid: penolakan lama tidak menempel ke berkas valid', async () => {
    const io = useBackupImport()
    await io.selectFile(oversizedFile())
    expect(io.error.value).toContain('terlalu besar')
    expect(io.preview.value).toBeNull()

    await io.selectFile(readableFile('valid.json', documentText([1, 2], EXPORTED_B)))

    expect(visible(io)).toEqual({
      fileName: 'valid.json',
      previewExportedAt: EXPORTED_B,
      previewRecords: 2,
      error: null,
      status: null,
    })
  })

  it('mode "ganti semua" setelah race hanya mengeksekusi dokumen berkas terakhir', async () => {
    const io = useBackupImport()
    const a = deferredFile('a.json', documentText([1, 2, 3], EXPORTED_A))

    const pendingA = io.selectFile(a.file)
    await io.selectFile(readableFile('b.json', documentText([4, 5], EXPORTED_B)))
    a.resolve()
    await pendingA

    io.mode.value = 'replace-all'
    io.isReplaceConfirmed.value = true
    expect(io.canApply.value).toBe(true)

    mocks.applyBackupDocument.mockResolvedValue({ ...RESULT, mode: 'replace-all' })
    await io.applyImport()

    expect(mocks.applyBackupDocument).toHaveBeenCalledTimes(1)
    expect(appliedDocumentId()).toEqual({ exportedAtMs: EXPORTED_B, recordCount: 2 })
    expect(mocks.applyBackupDocument.mock.calls[0]?.[0]).toMatchObject({ mode: 'replace-all' })

    // Sukses import mengosongkan pilihan, bukan menyisakan nama/preview lama.
    expect(io.fileName.value).toBeNull()
    expect(io.preview.value).toBeNull()
    expect(io.status.value).toContain('Semua data diganti')
    expect(io.error.value).toBeNull()
  })

  it('memilih berkas saat applyImport berjalan: import tetap memakai dokumen semula, tanpa state campuran', async () => {
    const io = useBackupImport()
    await io.selectFile(readableFile('a.json', documentText([1, 2], EXPORTED_A)))

    let releaseEnsure: () => void = () => {}
    mocks.ensure.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseEnsure = () => resolve({ clock: { nowMs: () => HLC_NOW } })
        }),
    )
    mocks.applyBackupDocument.mockResolvedValue(RESULT)

    const pendingApply = io.applyImport()
    expect(io.isBusy.value).toBe(true)

    const c = deferredFile('c.json', documentText([6, 7, 8], EXPORTED_C))
    const pendingC = io.selectFile(c.file)
    expect(io.fileName.value).toBe('c.json')

    // Import berjalan memakai snapshot A walau ada pemilihan baru.
    releaseEnsure()
    await pendingApply
    expect(appliedDocumentId()).toEqual({ exportedAtMs: EXPORTED_A, recordCount: 2 })

    c.resolve()
    await pendingC

    // Tidak boleh ada "nama C + dokumen A" atau preview C yang bisa diimpor tanpa nama.
    expect(io.fileName.value).toBeNull()
    expect(io.preview.value).toBeNull()
    expect(io.canApply.value).toBe(false)
    expect(io.isBusy.value).toBe(false)
    expect(io.error.value).toBeNull()
    expect(io.status.value).not.toBeNull()
  })

  it('klik import dua kali (double submit) hanya menulis sekali', async () => {
    const io = useBackupImport()
    await io.selectFile(readableFile('a.json', documentText([1, 2], EXPORTED_A)))
    mocks.applyBackupDocument.mockResolvedValue(RESULT)

    await Promise.all([io.applyImport(), io.applyImport()])

    expect(mocks.applyBackupDocument).toHaveBeenCalledTimes(1)
  })
})
