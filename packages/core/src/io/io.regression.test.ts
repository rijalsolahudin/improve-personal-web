import { utf8ByteLength } from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import { createManualClock } from '../adapters/clock.ts'
import { createMemoryStorage } from '../adapters/memory.ts'
import { DEFAULT_APP_STYLE, DEFAULT_THEME_COLOR } from '../domain/enums.ts'
import { CURRENT_SCHEMA_VERSION, type SealedRecord } from '../domain/envelope.ts'
import type { StorageAdapter } from '../ports.ts'
import {
  BACKUP_MAX_RECORDS,
  BackupExportLimitError,
  buildBackupDocument,
  serializeBackup,
  type BackupDocument,
  type BackupRecordInput,
} from './backup.ts'
import {
  BackupImportInvariantError,
  applyBackupImport,
  validateBackupText,
  type ImportRejection,
} from './import.ts'

/**
 * Regresi bug hasil QA T12 (lihat `reports/qa-t12-import-export.md`).
 *
 * Setiap blok mengunci satu bug yang sudah diperbaiki:
 * - BUG-1: export tidak boleh menghasilkan berkas yang ditolak import-nya sendiri.
 * - BUG-2: `dataCount` wajib konsisten dengan isi `records` (preview tidak boleh bohong).
 * - BUG-3: `replace-all` tidak boleh menghapus data lama sebelum semua bahan tulisan siap.
 * - BUG-4: `schemaVersion` per record tidak boleh lebih baru dari yang dimengerti build ini.
 * - BUG-5: `applyBackupImport` menjaga invarian record walau `validateBackupText` dilewati.
 *
 * Enkripsi nyata ada di `packages/crypto`; sama seperti test `io/` lain, di sini dipakai seal
 * deterministik `plain:<json>` karena yang diuji adalah alurnya, bukan kriptonya.
 */

const NOW = 1_700_000_000_000
const PLAIN_PREFIX = 'plain:'

function recordIdFor(n: number): string {
  return `018f2c4e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

function hlcFor(offsetMs: number, device = 'devicea'): string {
  return `${NOW + offsetMs}-0-${device}`
}

function prefsPayload(id: string): unknown {
  return {
    id,
    themeColor: DEFAULT_THEME_COLOR,
    style: DEFAULT_APP_STYLE,
    hideDecorations: false,
    updatedAt: NOW,
  }
}

function todoPayload(id: string, title: string): unknown {
  return {
    id,
    title,
    note: null,
    deadlineAt: null,
    priority: 'low',
    isDone: false,
    completedAt: null,
    scheduleId: null,
    scheduleOccurrenceAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function prefsRecord(id: string, offsetMs = 0): BackupRecordInput {
  return {
    id,
    type: 'user_prefs',
    hlc: hlcFor(offsetMs),
    deleted: false,
    data: prefsPayload(id),
  }
}

function todoRecord(id: string, title = 'dari berkas', offsetMs = 0): BackupRecordInput {
  return {
    id,
    type: 'todo',
    hlc: hlcFor(offsetMs),
    deleted: false,
    data: todoPayload(id, title),
  }
}

function sealFor(record: BackupRecordInput): SealedRecord {
  return {
    id: record.id,
    hlc: record.hlc,
    deleted: record.deleted,
    blob: `${PLAIN_PREFIX}${JSON.stringify({
      type: record.type,
      schemaVersion: record.schemaVersion ?? CURRENT_SCHEMA_VERSION,
      data: record.data,
    })}`,
  }
}

function documentOf(records: readonly BackupRecordInput[]): BackupDocument {
  return buildBackupDocument({ records, exportedAtMs: NOW })
}

function rejectionOf(result: ReturnType<typeof validateBackupText>): ImportRejection {
  if (result.ok) throw new Error('berkas harusnya ditolak, tapi validasi berhasil')
  return result
}

/** Jalankan fungsi sinkron yang harus melempar, lalu kembalikan error-nya untuk diperiksa. */
function captureThrown(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('fungsi harusnya melempar error, tapi selesai normal')
}

/** Jalankan promise yang harus ditolak, lalu kembalikan error-nya untuk diperiksa. */
async function captureRejected(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('promise harusnya ditolak, tapi selesai normal')
}

function createStorage(): StorageAdapter {
  return createMemoryStorage({ clock: createManualClock(NOW) })
}

async function seed(storage: StorageAdapter, records: readonly BackupRecordInput[]): Promise<void> {
  for (const record of records) {
    await storage.runTransaction('regression.seed', async (tx) => {
      await tx.putRecord({
        sealed: sealFor(record),
        index: null,
        op: record.deleted ? 'delete' : 'put',
        outbox: { id: `seed-outbox-${record.id}`, queuedAtMs: NOW },
      })
    })
  }
}

function importInto(
  storage: StorageAdapter,
  document: BackupDocument,
  mode: 'merge' | 'replace-all',
  overrides?: {
    readonly seal?: (record: BackupRecordInput) => Promise<SealedRecord>
  },
) {
  return applyBackupImport({
    storage,
    document,
    mode,
    nowMs: NOW,
    seal: overrides?.seal ?? (async (record) => sealFor(record)),
    outboxIdFor: (record) => `import-outbox-${record.id}`,
  })
}

describe('BUG-1: export menegakkan batas yang sama dengan import', () => {
  it('buildBackupDocument menolak jumlah record di atas batas (jenis + angka limit di pesan)', () => {
    const records = [recordIdFor(1), recordIdFor(2), recordIdFor(3)].map((id) => prefsRecord(id))

    const error = captureThrown(() =>
      buildBackupDocument({ records, exportedAtMs: NOW }, { maxRecords: 2 }),
    )

    expect(error).toBeInstanceOf(BackupExportLimitError)
    if (!(error instanceof BackupExportLimitError)) throw new Error('tipe error tidak cocok')
    expect(error.kind).toBe('records')
    expect(error.actual).toBe(3)
    expect(error.limit).toBe(2)
    expect(error.message).toContain('3 data')
    expect(error.message).toContain('batas 2 data')
  })

  it('tepat di batas jumlah record tetap boleh', () => {
    const records = [recordIdFor(4), recordIdFor(5)].map((id) => prefsRecord(id))

    const document = buildBackupDocument({ records, exportedAtMs: NOW }, { maxRecords: 2 })
    expect(document.records).toHaveLength(2)
  })

  it('serializeBackup menolak ukuran di atas batas, tepat di batas tetap lolos', () => {
    const document = documentOf([todoRecord(recordIdFor(6))])
    const text = serializeBackup(document)
    const bytes = utf8ByteLength(text)

    expect(serializeBackup(document, { maxBytes: bytes })).toBe(text)

    const error = captureThrown(() => serializeBackup(document, { maxBytes: bytes - 1 }))
    expect(error).toBeInstanceOf(BackupExportLimitError)
    if (!(error instanceof BackupExportLimitError)) throw new Error('tipe error tidak cocok')
    expect(error.kind).toBe('bytes')
    expect(error.actual).toBe(bytes)
    expect(error.limit).toBe(bytes - 1)
    expect(error.message).toContain(`${bytes} byte`)
    expect(error.message).toContain(`batas ${bytes - 1} byte`)
  })

  it('berkas hasil export pada batas default SELALU lolos validateBackupText default', () => {
    const document = documentOf([prefsRecord(recordIdFor(7)), todoRecord(recordIdFor(8))])

    const text = serializeBackup(document)
    const validation = validateBackupText(text)

    expect(validation.ok).toBe(true)
    const serializedBytes = utf8ByteLength(text)
    expect(validateBackupText(text, { maxBytes: serializedBytes }).ok).toBe(true)
  })

  it('jalur default (tanpa opsi) menolak jumlah record di atas BACKUP_MAX_RECORDS', () => {
    const records = Array.from({ length: BACKUP_MAX_RECORDS + 1 }, (_, index) =>
      prefsRecord(recordIdFor(index + 1_000)),
    )

    const error = captureThrown(() => buildBackupDocument({ records, exportedAtMs: NOW }))

    expect(error).toBeInstanceOf(BackupExportLimitError)
    if (!(error instanceof BackupExportLimitError)) throw new Error('tipe error tidak cocok')
    expect(error.kind).toBe('records')
    expect(error.limit).toBe(BACKUP_MAX_RECORDS)
  })

  it('konstanta batas jumlah record yang dipakai export adalah batas yang sama dengan import', () => {
    expect(BACKUP_MAX_RECORDS).toBe(50_000)
  })
})

describe('BUG-2: dataCount dicek silang dengan isi records', () => {
  it('dataCount yang lebih besar dari isi berkas ditolak (preview tidak boleh bohong)', () => {
    const document = documentOf([prefsRecord(recordIdFor(20))])
    const tampered = {
      ...document,
      dataCount: { ...document.dataCount, todo: 99 },
    }

    const rejection = rejectionOf(validateBackupText(JSON.stringify(tampered)))

    expect(rejection.reason).toBe('DATA_COUNT_MISMATCH')
    expect(rejection.issues.join('\n')).toContain('dataCount.todo')
    expect(rejection.message).toContain('tidak cocok')
  })

  it('dataCount yang lebih kecil dari isi berkas juga ditolak', () => {
    const document = documentOf([prefsRecord(recordIdFor(21))])
    const tampered = {
      ...document,
      dataCount: { ...document.dataCount, user_prefs: 0 },
    }

    const rejection = rejectionOf(validateBackupText(JSON.stringify(tampered)))
    expect(rejection.reason).toBe('DATA_COUNT_MISMATCH')
    expect(rejection.issues.join('\n')).toContain('dataCount.user_prefs: tertulis 0, isi berkas 1')
  })

  it('dataCount yang konsisten tetap diterima', () => {
    const document = documentOf([
      prefsRecord(recordIdFor(22)),
      todoRecord(recordIdFor(23)),
      todoRecord(recordIdFor(24)),
    ])

    const validation = validateBackupText(serializeBackup(document))
    expect(validation.ok).toBe(true)
  })
})

describe('BUG-3: replace-all tidak menghapus data lama sebelum siap menulis', () => {
  it('seal gagal di tengah: data lama utuh, tidak ada record baru yang tertulis', async () => {
    const storage = createStorage()
    const oldIds = [recordIdFor(30), recordIdFor(31)]
    await seed(
      storage,
      oldIds.map((id) => prefsRecord(id)),
    )
    const outboxBefore = await storage.countOutbox()

    const incoming = [recordIdFor(32), recordIdFor(33), recordIdFor(34)].map((id) => todoRecord(id))
    const document = documentOf(incoming)

    let sealCalls = 0
    const error = await captureRejected(
      importInto(storage, document, 'replace-all', {
        seal: async (record) => {
          sealCalls += 1
          // Panggilan ke-3 gagal - setelah wipe() pada implementasi lama ini berarti data hilang.
          if (sealCalls === 3) throw new Error('crypto gagal')
          return sealFor(record)
        },
      }),
    )

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('crypto gagal')
    expect(sealCalls).toBeGreaterThanOrEqual(3)

    expect(await storage.getRecords(oldIds)).toHaveLength(2)
    expect(await storage.countOutbox()).toBe(outboxBefore)
    expect(await storage.getRecords(incoming.map((record) => record.id))).toHaveLength(0)
  })

  it('saat seal berjalan, data lama masih ada (wipe dipanggil setelah staging)', async () => {
    const storage = createStorage()
    const oldId = recordIdFor(35)
    await seed(storage, [prefsRecord(oldId)])

    const document = documentOf([todoRecord(recordIdFor(36)), todoRecord(recordIdFor(37))])
    const oldSeenDuringSeal: boolean[] = []

    await importInto(storage, document, 'replace-all', {
      seal: async (record) => {
        oldSeenDuringSeal.push((await storage.getRecord(oldId)) !== null)
        return sealFor(record)
      },
    })

    expect(oldSeenDuringSeal).toEqual([true, true])
    expect(await storage.getRecord(oldId)).toBeNull()
    expect(await storage.getRecords(document.records.map((record) => record.id))).toHaveLength(2)
  })
})

describe('BUG-4: schemaVersion per record divalidasi', () => {
  it('record dengan schemaVersion lebih baru dari aplikasi ditolak', () => {
    const document = documentOf([
      { ...prefsRecord(recordIdFor(40)), schemaVersion: CURRENT_SCHEMA_VERSION + 98 },
    ])

    const rejection = rejectionOf(validateBackupText(serializeBackup(document)))

    expect(rejection.reason).toBe('VERSION_TOO_NEW')
    expect(rejection.issues.join('\n')).toContain('schemaVersion')
    expect(rejection.message).toContain('Perbarui aplikasi')
  })

  it('record yang mengaku lebih baru dari versi berkasnya ditolak (tidak dimigrasikan sebagai versi lama)', () => {
    const document = documentOf([
      { ...prefsRecord(recordIdFor(41)), schemaVersion: CURRENT_SCHEMA_VERSION + 1 },
    ])

    // Target dibuat cukup tinggi supaya yang menangkap adalah cek konsistensi versi dokumen,
    // bukan cek "lebih baru dari aplikasi".
    const rejection = rejectionOf(
      validateBackupText(serializeBackup(document), {
        targetSchemaVersion: CURRENT_SCHEMA_VERSION + 2,
      }),
    )

    expect(rejection.reason).toBe('SCHEMA_MISMATCH')
    expect(rejection.issues.join('\n')).toContain('schemaVersion')
  })

  it('record dengan schemaVersion versi sekarang tetap diterima', () => {
    const document = documentOf([prefsRecord(recordIdFor(42))])
    expect(validateBackupText(serializeBackup(document)).ok).toBe(true)
  })
})

describe('BUG-5: applyBackupImport menjaga invarian record', () => {
  it('todo.data yang bukan object ditolak sebelum satu pun record ditulis', async () => {
    const storage = createStorage()
    const oldId = recordIdFor(50)
    await seed(storage, [prefsRecord(oldId)])
    const outboxBefore = await storage.countOutbox()

    const brokenId = recordIdFor(51)
    const document = documentOf([
      {
        id: brokenId,
        type: 'todo',
        hlc: hlcFor(-1_000, 'deviceb'),
        deleted: false,
        data: {},
      },
    ])

    const error = await captureRejected(importInto(storage, document, 'replace-all'))

    expect(error).toBeInstanceOf(BackupImportInvariantError)
    if (!(error instanceof BackupImportInvariantError)) throw new Error('tipe error tidak cocok')
    expect(error.issues.join('\n')).toContain(`todo/${brokenId}`)
    expect(error.message).not.toContain('{}')

    expect(await storage.getRecord(oldId)).not.toBeNull()
    expect(await storage.getRecord(brokenId)).toBeNull()
    expect(await storage.countOutbox()).toBe(outboxBefore)
  })

  it('dokumen dengan dataCount yang diubah juga ditolak oleh apply', async () => {
    const storage = createStorage()
    const document = documentOf([prefsRecord(recordIdFor(52))])
    const tampered = { ...document, dataCount: { ...document.dataCount, habit: 7 } }

    const error = await captureRejected(importInto(storage, tampered, 'merge'))

    expect(error).toBeInstanceOf(BackupImportInvariantError)
    if (!(error instanceof BackupImportInvariantError)) throw new Error('tipe error tidak cocok')
    expect(error.issues.join('\n')).toContain('dataCount.habit')
    expect(await storage.getRecord(recordIdFor(52))).toBeNull()
  })

  it('record dengan schemaVersion asing ditolak oleh apply', async () => {
    const storage = createStorage()
    const id = recordIdFor(53)
    const document = documentOf([
      { ...prefsRecord(id), schemaVersion: CURRENT_SCHEMA_VERSION + 98 },
    ])

    const error = await captureRejected(importInto(storage, document, 'merge'))

    expect(error).toBeInstanceOf(BackupImportInvariantError)
    expect(await storage.getRecord(id)).toBeNull()
  })

  it('dokumen yang valid tetap bisa diimport setelah pemeriksaan invarian', async () => {
    const storage = createStorage()
    const id = recordIdFor(54)
    const document = documentOf([todoRecord(id)])

    const result = await importInto(storage, document, 'merge')

    expect(result.written).toBe(1)
    expect(await storage.getRecord(id)).not.toBeNull()
  })
})
