import { describe, expect, it } from 'vitest'

import { createManualClock } from '../adapters/clock.ts'
import { createMemoryStorage } from '../adapters/memory.ts'
import { DEFAULT_APP_STYLE, DEFAULT_THEME_COLOR } from '../domain/enums.ts'
import { CURRENT_SCHEMA_VERSION, type EntityType, type SealedRecord } from '../domain/envelope.ts'
import type { StorageAdapter } from '../ports.ts'
import {
  buildBackupDocument,
  serializeBackup,
  type BackupDocument,
  type BackupRecordInput,
} from './backup.ts'
import { collectGoalInvariantIssues } from './goal-invariants.ts'
import {
  BackupImportInvariantError,
  applyBackupImport,
  validateBackupText,
  type ImportRejection,
} from './import.ts'

/**
 * Regresi wiring invarian goal ke jalur import (PRD T17, temuan QA N1).
 *
 * `checkGoalBundle`/`checkGoalLinksUnique` sudah benar di level domain, tapi selama tidak dipanggil
 * jalur import, berkas dengan chapter di luar periode goal atau dua tautan untuk item yang sama
 * tetap lolos dan menghasilkan data ganda permanen. Test ini mengunci penolakannya di `validateBackupText`
 * (fase baca) DAN `applyBackupImport` (fase tulis), termasuk "tidak ada data yang diubah" saat gagal.
 */

const NOW = 1_700_000_000_000
const PLAIN_PREFIX = 'plain:'
const DEVICE_ID = 'devicea'

const GOAL_ID = '0192f0a0-0000-7000-8000-000000000001'
const OTHER_GOAL_ID = '0192f0a0-0000-7000-8000-000000000002'
const CHAPTER_ID = '0192f0a0-0000-7000-8000-000000000003'
const OTHER_CHAPTER_ID = '0192f0a0-0000-7000-8000-000000000004'
const ITEM_ID = '0192f0a0-0000-7000-8000-000000000005'
const OTHER_ITEM_ID = '0192f0a0-0000-7000-8000-000000000006'
const LINK_ID = '0192f0a0-0000-7000-8000-000000000007'
const OTHER_LINK_ID = '0192f0a0-0000-7000-8000-000000000008'
const PREFS_ID = '0192f0a0-0000-7000-8000-000000000009'

const GOAL_START = '2026-01-01'
const GOAL_END = '2026-03-31'

function goalPayload(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: GOAL_ID,
    title: 'Lari 10K',
    reason: null,
    category: 'kesehatan',
    coverSticker: null,
    startDate: GOAL_START,
    targetDate: GOAL_END,
    status: 'aktif',
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  }
}

function chapterPayload(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CHAPTER_ID,
    goalId: GOAL_ID,
    title: 'Base building',
    startDate: GOAL_START,
    endDate: '2026-02-15',
    sortOrder: 0,
    isCompleted: false,
    isClosed: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  }
}

function linkPayload(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: LINK_ID,
    goalId: GOAL_ID,
    chapterId: CHAPTER_ID,
    itemType: 'todo',
    itemId: ITEM_ID,
    createdAt: NOW,
    ...patch,
  }
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

function recordOf(
  type: EntityType,
  id: string,
  data: unknown,
  options?: { readonly deleted?: boolean },
): BackupRecordInput {
  return {
    id,
    type,
    hlc: `${NOW}-0-${DEVICE_ID}`,
    deleted: options?.deleted ?? false,
    data,
  }
}

function goalRecord(patch: Record<string, unknown> = {}, id = GOAL_ID): BackupRecordInput {
  return recordOf('goal', id, goalPayload({ id, ...patch }))
}

function chapterRecord(patch: Record<string, unknown> = {}, id = CHAPTER_ID): BackupRecordInput {
  return recordOf('goal_chapter', id, chapterPayload({ id, ...patch }))
}

function linkRecord(patch: Record<string, unknown> = {}, id = LINK_ID): BackupRecordInput {
  return recordOf('goal_link', id, linkPayload({ id, ...patch }))
}

function documentOf(records: readonly BackupRecordInput[]): BackupDocument {
  return buildBackupDocument({ records, exportedAtMs: NOW })
}

function rejectionOf(result: ReturnType<typeof validateBackupText>): ImportRejection {
  if (result.ok) throw new Error('berkas harusnya ditolak, tapi validasi berhasil')
  return result
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

async function importInto(
  storage: StorageAdapter,
  document: BackupDocument,
): Promise<Awaited<ReturnType<typeof applyBackupImport>>> {
  return applyBackupImport({
    storage,
    document,
    mode: 'merge',
    nowMs: NOW,
    seal: async (record) => sealFor(record),
    outboxIdFor: (record) => `import-outbox-${record.id}`,
  })
}

function createStorage(): StorageAdapter {
  return createMemoryStorage({ clock: createManualClock(NOW) })
}

async function seedPrefs(storage: StorageAdapter, id: string): Promise<void> {
  await storage.runTransaction('goal-invariant.seed', async (tx) => {
    await tx.putRecord({
      sealed: sealFor(recordOf('user_prefs', id, prefsPayload(id))),
      index: null,
      op: 'put',
      outbox: { id: `seed-outbox-${id}`, queuedAtMs: NOW },
    })
  })
}

async function snapshot(storage: StorageAdapter, ids: readonly string[]): Promise<string> {
  return JSON.stringify({
    records: await storage.getRecords(ids),
    outbox: await storage.listOutbox(100),
    syncState: await storage.getSyncState(),
  })
}

describe('collectGoalInvariantIssues - invarian lintas-record', () => {
  it('goal + chapter + tautan yang konsisten tidak menghasilkan masalah', () => {
    const issues = collectGoalInvariantIssues([goalRecord(), chapterRecord(), linkRecord()])

    expect(issues).toEqual([])
  })

  it('chapter di luar periode main goal ditolak dengan alasan yang menyebut tanggal & judul', () => {
    const issues = collectGoalInvariantIssues([
      goalRecord(),
      chapterRecord({ title: 'Race', startDate: '2026-03-01', endDate: '2026-04-10' }),
    ])

    expect(issues.join('\n')).toContain('Race')
    expect(issues.join('\n')).toContain('2026-04-10')
    expect(issues.join('\n')).toContain(GOAL_END)
  })

  it('chapter yang mulai sebelum main goal ditolak', () => {
    const issues = collectGoalInvariantIssues([
      goalRecord(),
      chapterRecord({ startDate: '2025-12-25', endDate: '2026-01-10' }),
    ])

    expect(issues.join('\n')).toContain('2025-12-25')
    expect(issues.join('\n')).toContain(GOAL_START)
  })

  it('dua tautan untuk item yang sama di satu goal ditolak sekali (tanpa pesan ganda)', () => {
    const issues = collectGoalInvariantIssues([
      goalRecord(),
      chapterRecord(),
      linkRecord(),
      linkRecord({}, OTHER_LINK_ID),
    ])

    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain(`todo:${ITEM_ID}`)
    expect(issues[0]).toContain(LINK_ID)
    expect(issues[0]).toContain(OTHER_LINK_ID)
  })

  it('item yang sama ditautkan ke dua goal berbeda ditolak (uq_goal_link_item global)', () => {
    const issues = collectGoalInvariantIssues([
      goalRecord(),
      goalRecord({}, OTHER_GOAL_ID),
      chapterRecord(),
      linkRecord(),
      linkRecord({ goalId: OTHER_GOAL_ID, chapterId: null }, OTHER_LINK_ID),
    ])

    expect(issues.join('\n')).toContain('dua goal berbeda')
    expect(issues.join('\n')).toContain(`todo:${ITEM_ID}`)
  })

  it('tautan ke chapter yang tidak ada di goal itu ditolak', () => {
    const issues = collectGoalInvariantIssues([
      goalRecord(),
      chapterRecord(),
      linkRecord({ chapterId: OTHER_CHAPTER_ID }),
    ])

    expect(issues.join('\n')).toContain(OTHER_CHAPTER_ID)
  })

  it('tautan ke chapter milik goal lain ditolak', () => {
    const issues = collectGoalInvariantIssues([
      goalRecord(),
      goalRecord({}, OTHER_GOAL_ID),
      chapterRecord(),
      chapterRecord({ goalId: OTHER_GOAL_ID }, OTHER_CHAPTER_ID),
      linkRecord({ chapterId: OTHER_CHAPTER_ID }),
    ])

    expect(issues.join('\n')).toContain(OTHER_CHAPTER_ID)
  })

  it('tombstone tidak diperiksa: tautan lama yang sudah dihapus tidak dianggap duplikat', () => {
    const issues = collectGoalInvariantIssues([
      goalRecord(),
      chapterRecord(),
      linkRecord(),
      recordOf('goal_link', OTHER_LINK_ID, linkPayload({ id: OTHER_LINK_ID }), { deleted: true }),
    ])

    expect(issues).toEqual([])
  })

  it('item berbeda tetap boleh tertaut (bukan duplikat)', () => {
    const issues = collectGoalInvariantIssues([
      goalRecord(),
      chapterRecord(),
      linkRecord(),
      linkRecord({ itemId: OTHER_ITEM_ID }, OTHER_LINK_ID),
    ])

    expect(issues).toEqual([])
  })

  it('chapter tanpa goal induk di berkas tidak diperiksa rentangnya (import parsial tetap jalan)', () => {
    const issues = collectGoalInvariantIssues([
      chapterRecord({ startDate: '2020-01-01', endDate: '2020-01-31' }),
    ])

    expect(issues).toEqual([])
  })
})

describe('import - menolak struktur goal yang melanggar tanpa mengubah data', () => {
  it('bundle valid lolos validasi lalu benar-benar ditulis', async () => {
    const storage = createStorage()
    const document = documentOf([goalRecord(), chapterRecord(), linkRecord()])

    const validation = validateBackupText(serializeBackup(document))
    expect(validation.ok).toBe(true)
    if (!validation.ok) return

    const result = await importInto(storage, validation.document)

    expect(result.written).toBe(3)
    expect(result.perType['goal']).toBe(1)
    expect(result.perType['goal_chapter']).toBe(1)
    expect(result.perType['goal_link']).toBe(1)
  })

  it('chapter di luar periode ditolak dengan alasan GOAL_INVARIANT_VIOLATION', () => {
    const document = documentOf([
      goalRecord(),
      chapterRecord({ title: 'Race', startDate: '2026-03-01', endDate: '2026-04-10' }),
    ])

    const rejection = rejectionOf(validateBackupText(serializeBackup(document)))

    expect(rejection.reason).toBe('GOAL_INVARIANT_VIOLATION')
    expect(rejection.message).toContain('struktur goal')
    expect(rejection.message).toContain('Tidak ada data yang diubah')
    expect(rejection.issues.join('\n')).toContain('2026-04-10')
  })

  it('dua tautan untuk item yang sama ditolak', () => {
    const document = documentOf([
      goalRecord(),
      chapterRecord(),
      linkRecord(),
      linkRecord({}, OTHER_LINK_ID),
    ])

    const rejection = rejectionOf(validateBackupText(serializeBackup(document)))

    expect(rejection.reason).toBe('GOAL_INVARIANT_VIOLATION')
    expect(rejection.issues.join('\n')).toContain(`todo:${ITEM_ID}`)
  })

  it('data lokal tidak berubah saat validasi berkas invalid (fase baca murni)', async () => {
    const storage = createStorage()
    await seedPrefs(storage, PREFS_ID)
    const before = await snapshot(storage, [PREFS_ID])

    const document = documentOf([
      goalRecord(),
      chapterRecord({ startDate: '2026-02-01', endDate: '2026-05-01' }),
    ])
    rejectionOf(validateBackupText(serializeBackup(document)))

    expect(await snapshot(storage, [PREFS_ID])).toBe(before)
  })

  it('apply menolak dokumen yang belum divalidasi dan tidak menulis satu record pun', async () => {
    const storage = createStorage()
    await seedPrefs(storage, PREFS_ID)
    const before = await snapshot(storage, [PREFS_ID])

    const document = documentOf([
      goalRecord(),
      chapterRecord(),
      linkRecord(),
      linkRecord({}, OTHER_LINK_ID),
    ])

    const error = await (async () => {
      try {
        await importInto(storage, document)
      } catch (caught) {
        return caught
      }
      throw new Error('import harusnya ditolak, tapi selesai normal')
    })()

    expect(error).toBeInstanceOf(BackupImportInvariantError)
    if (!(error instanceof BackupImportInvariantError)) throw new Error('tipe error tidak cocok')
    expect(error.issues.join('\n')).toContain(`todo:${ITEM_ID}`)

    expect(await snapshot(storage, [PREFS_ID])).toBe(before)
    expect(await storage.getRecords([GOAL_ID, CHAPTER_ID, LINK_ID])).toHaveLength(0)
  })

  it('tombstone tidak menghalangi import berkas sah', async () => {
    const storage = createStorage()
    const document = documentOf([
      goalRecord(),
      chapterRecord(),
      linkRecord(),
      recordOf('goal_link', OTHER_LINK_ID, linkPayload({ id: OTHER_LINK_ID }), { deleted: true }),
    ])

    const validation = validateBackupText(serializeBackup(document))
    expect(validation.ok).toBe(true)
    if (!validation.ok) return

    const result = await importInto(storage, validation.document)
    expect(result.written).toBe(4)
    expect((await storage.getRecord(OTHER_LINK_ID))?.deleted).toBe(true)
  })
})
