import {
  BackupExportLimitError,
  DEFAULT_USER_PREFS,
  buildRecordWrite,
  commitLocalWrite,
  createManualClock,
  createMemoryStorage,
  validateBackupText,
  type BackupDocument,
  type CryptoProvider,
  type SecureKeyMaterial,
  type StorageAdapter,
} from '@improve-personal/core'
import { describe, expect, it } from 'vitest'

import { createBackupFile, describeExportFailure } from './export'

/**
 * Export F10 pada lapisan shell: record dibaca lewat repository (bukan blob mentah), berkas memakai
 * batas core, dan hasilnya PASTI bisa diimpor lagi.
 *
 * Test terakhir itu regresi BUG-1 dari QA: dulu export tidak punya batas, jadi berkas yang ditulis
 * aplikasi sendiri bisa ditolak import-nya.
 */

const NOW = 1_700_000_000_000
const DEVICE_ID = 'devicea'

/** Kripto diganti `plain:` - yang diuji alur export, bukan libsodium (lihat `io.test.ts` di core). */
const provider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => plaintext,
  openRecord: async ({ blob }) => blob,
}
const dataKey: SecureKeyMaterial = { kind: 'test', handle: null }

function recordIdFor(n: number): string {
  return `018f2c4e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

/** Tulis satu `user_prefs` lengkap dengan baris index, seperti jalur tulis aplikasi. */
async function writePrefs(
  storage: StorageAdapter,
  n: number,
  options: { readonly deleted?: boolean } = {},
): Promise<string> {
  const id = recordIdFor(n)
  const deleted = options.deleted ?? false

  await commitLocalWrite({
    storage,
    write: buildRecordWrite({
      sealed: {
        id,
        hlc: `${NOW}-${n}-${DEVICE_ID}`,
        deleted,
        blob: JSON.stringify({
          type: 'user_prefs',
          schemaVersion: 1,
          data: { id, ...DEFAULT_USER_PREFS, updatedAt: NOW },
        }),
      },
      index: {
        recordId: id,
        entityType: 'user_prefs',
        rangeStartMs: null,
        rangeEndMs: null,
        updatedAtMs: NOW,
      },
      op: deleted ? 'delete' : 'put',
      outbox: { id: `outbox-${n}`, queuedAtMs: NOW },
    }),
  })

  return id
}

function createSource(): {
  storage: StorageAdapter
  source: { storage: StorageAdapter; provider: CryptoProvider; dataKey: SecureKeyMaterial }
} {
  const storage = createMemoryStorage({ clock: createManualClock(NOW) })
  return { storage, source: { storage, provider, dataKey } }
}

describe('createBackupFile', () => {
  it('mengumpulkan semua record termasuk tombstone dan memberi nama berkas sesuai helper core', async () => {
    const { source } = createSource()
    await writePrefs(source.storage, 1)
    await writePrefs(source.storage, 2, { deleted: true })

    const file = await createBackupFile({ source, exportedAtMs: NOW, tz: 'UTC' })

    expect(file.name).toBe('improve-personal-backup-2023-11-14.json')
    expect(file.document.records).toHaveLength(2)
    expect(file.document.records.filter((record) => record.deleted)).toHaveLength(1)

    const parsed = JSON.parse(file.text) as BackupDocument
    expect(parsed.encrypted).toBe(false)
    expect(parsed.dataCount.user_prefs).toBe(2)
  })

  it('berkas hasil export selalu lolos validasi import (regresi BUG-1 QA)', async () => {
    const { source } = createSource()
    await writePrefs(source.storage, 1)

    const file = await createBackupFile({ source, exportedAtMs: NOW, tz: 'UTC' })
    const validation = validateBackupText(file.text)

    expect(validation.ok).toBe(true)
  })

  it('menolak berkas yang akan melebihi batas import, bukan menulis berkas yang tidak bisa dipulihkan', async () => {
    const { source } = createSource()
    await writePrefs(source.storage, 1)

    await expect(
      createBackupFile({ source, exportedAtMs: NOW, tz: 'UTC', limits: { maxBytes: 10 } }),
    ).rejects.toMatchObject({ name: 'BackupExportLimitError', kind: 'bytes', limit: 10 })
  })

  it('menolak jumlah record di atas batas core', async () => {
    const { source } = createSource()
    await writePrefs(source.storage, 1)
    await writePrefs(source.storage, 2)

    await expect(
      createBackupFile({ source, exportedAtMs: NOW, tz: 'UTC', limits: { maxRecords: 1 } }),
    ).rejects.toMatchObject({ name: 'BackupExportLimitError', kind: 'records', limit: 1 })
  })
})

describe('describeExportFailure', () => {
  it('menampilkan pesan BackupExportLimitError apa adanya (angka + batas tidak diubah)', () => {
    const error = new BackupExportLimitError('bytes', 40_066_087, 33_554_432)
    const message = describeExportFailure(error)

    expect(message).toBe(error.message)
    expect(message).toContain('40066087')
    expect(message).toContain('33554432')
  })

  it('membungkus error lain dengan awalan yang jelas', () => {
    expect(describeExportFailure(new Error('kunci data tidak tersedia'))).toBe(
      'Gagal membuat berkas backup: kunci data tidak tersedia',
    )
  })
})
