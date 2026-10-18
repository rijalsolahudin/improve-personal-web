import { describe, expect, it } from 'vitest'

import { createManualClock, type ManualClock } from '../adapters/clock.ts'
import { createMemoryStorage } from '../adapters/memory.ts'
import { DEFAULT_APP_STYLE, DEFAULT_THEME_COLOR } from '../domain/enums.ts'
import type { UserPrefs } from '../domain/entities/user-prefs.ts'
import { CURRENT_SCHEMA_VERSION, type EntityType, type SealedRecord } from '../domain/envelope.ts'
import type { StorageAdapter, StoredRecord } from '../ports.ts'
import { createHlcGenerator } from '../sync/hlc.ts'
import { buildRecordWrite, commitLocalWrite } from '../sync/outbox.ts'
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_PLAINTEXT_WARNING,
  backupFileName,
  buildBackupDocument,
  describeDataCount,
  emptyDataCount,
  serializeBackup,
  type BackupDocument,
  type BackupRecord,
  type BackupRecordInput,
} from './backup.ts'
import { SCHEMA_MIGRATIONS, migrateRecords, type SchemaMigration } from './migrations.ts'
import {
  applyBackupImport,
  validateBackupText,
  type ImportApplyResult,
  type ImportRejection,
} from './import.ts'

/**
 * PRD F10 / AC T12: "Round-trip export→wipe→import identik; file invalid/versi asing ditolak tanpa
 * mengubah data; batas ukuran file; peringatan 'file tidak terenkripsi' sebelum export".
 *
 * Enkripsi nyata ada di `packages/crypto` (di luar scope paket ini), jadi test di sini memakai
 * seal/open pengganti yang deterministik: `plain:<json>`. Yang diuji bukan kriptonya, tapi alur
 * import/export - dan alur itu tidak boleh bergantung pada bentuk blob.
 */

const NOW = 1_700_000_000_000
const DEVICE_ID = 'devicea'
const PLAIN_PREFIX = 'plain:'

function recordIdFor(n: number): string {
  return `018f2c4e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

/**
 * Payload `user_prefs` yang sah (F16). Dipakai sebagai payload contoh karena bentuknya kecil,
 * lengkap, dan tidak bergantung pada tanggal/tz mana pun.
 */
function prefsFor(recordId: string): UserPrefs {
  return {
    id: recordId,
    themeColor: DEFAULT_THEME_COLOR,
    style: DEFAULT_APP_STYLE,
    hideDecorations: false,
    updatedAt: NOW,
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

function openStored(stored: StoredRecord): BackupRecordInput {
  const payload = JSON.parse(stored.blob.slice(PLAIN_PREFIX.length)) as {
    readonly type: EntityType
    readonly schemaVersion: number
    readonly data: unknown
  }

  return {
    id: stored.id,
    type: payload.type,
    hlc: stored.hlc,
    deleted: stored.deleted,
    schemaVersion: payload.schemaVersion,
    data: payload.data,
  }
}

type Harness = {
  readonly storage: StorageAdapter
  readonly clock: ManualClock
  readonly ids: readonly string[]
  readonly write: (recordId: string, options?: { readonly deleted?: boolean }) => Promise<void>
  readonly exportDocument: (exportedAtMs?: number) => Promise<BackupDocument>
  /** Isi storage yang bisa dibandingkan sebelum/sesudah import yang ditolak. */
  readonly snapshot: () => Promise<string>
}

function createHarness(): Harness {
  const clock = createManualClock(NOW)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: DEVICE_ID, clock })
  const ids: string[] = []

  let outboxCounter = 0

  return {
    storage,
    clock,
    ids,

    write: async (recordId, options) => {
      outboxCounter += 1
      ids.push(recordId)

      await commitLocalWrite({
        storage,
        write: buildRecordWrite({
          sealed: sealFor({
            id: recordId,
            type: 'user_prefs',
            hlc: hlc.tick(),
            deleted: options?.deleted ?? false,
            data: prefsFor(recordId),
          }),
          index: null,
          op: options?.deleted === true ? 'delete' : 'put',
          outbox: { id: `outbox-${outboxCounter}`, queuedAtMs: clock.nowMs() },
        }),
      })
    },

    exportDocument: async (exportedAtMs) => {
      const stored = await storage.getRecords(ids)
      return buildBackupDocument({
        records: stored.map(openStored),
        exportedAtMs: exportedAtMs ?? clock.nowMs(),
      })
    },

    snapshot: async () => {
      const records = await storage.getRecords(ids)
      const outbox = await storage.listOutbox(100)
      const state = await storage.getSyncState()
      return JSON.stringify({ records, outbox, state })
    },
  }
}

function rejectionOf(result: ReturnType<typeof validateBackupText>): ImportRejection {
  if (result.ok) throw new Error('harusnya ditolak, tapi validasi berhasil')
  return result
}

async function applyImport(input: {
  readonly storage: StorageAdapter
  readonly document: BackupDocument
  readonly mode: 'merge' | 'replace-all'
  readonly nowMs?: number
}): Promise<ImportApplyResult> {
  return applyBackupImport({
    storage: input.storage,
    document: input.document,
    mode: input.mode,
    nowMs: input.nowMs ?? NOW,
    seal: async (record) => sealFor(record),
    outboxIdFor: (record) => `import-outbox-${record.id}`,
  })
}

describe('io/export', () => {
  it('berkas memuat envelope + schemaVersion + metadata, dan menandai dirinya TIDAK terenkripsi', async () => {
    const harness = createHarness()
    await harness.write(recordIdFor(1))
    await harness.write(recordIdFor(2))

    const document = await harness.exportDocument()

    expect(document.format).toBe(BACKUP_FORMAT)
    expect(document.version).toBe(BACKUP_FORMAT_VERSION)
    expect(document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(document.exportedAtMs).toBe(NOW)
    expect(document.encrypted).toBe(false)
    expect(document.records).toHaveLength(2)
    expect(document.dataCount['user_prefs']).toBe(2)

    expect(BACKUP_PLAINTEXT_WARNING).toContain('tidak terenkripsi')

    const parsed = JSON.parse(serializeBackup(document)) as BackupDocument
    expect(parsed).toEqual(document)

    expect(describeDataCount(document.dataCount)).toBe('2 user_prefs')
    expect(describeDataCount(emptyDataCount())).toBe('tidak ada data')
    expect(backupFileName(NOW, 'Asia/Jakarta')).toMatch(
      /^improve-personal-backup-\d{4}-\d{2}-\d{2}\.json$/,
    )
  })

  it('metadata plaintext (id/hlc/deleted) ikut terbawa di envelope', async () => {
    const harness = createHarness()
    const id = recordIdFor(3)
    await harness.write(id, { deleted: true })

    const document = await harness.exportDocument()
    const [record] = document.records

    expect(record?.id).toBe(id)
    expect(record?.deleted).toBe(true)
    expect(record?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(record?.hlc).toBe(`${NOW}-0-${DEVICE_ID}`)
  })
})

describe('io/import - round trip', () => {
  it('export → wipe → import identik, dan hasilnya langsung ikut sync', async () => {
    const harness = createHarness()
    const ids = [recordIdFor(10), recordIdFor(11), recordIdFor(12)]
    for (const id of ids) await harness.write(id)
    await harness.write(recordIdFor(13), { deleted: true })

    const allIds = [...ids, recordIdFor(13)]
    const document = await harness.exportDocument()
    const text = serializeBackup(document)

    const before = await harness.storage.getRecords(allIds)
    expect(before).toHaveLength(4)

    await harness.storage.wipe()
    expect(await harness.storage.getRecords(allIds)).toHaveLength(0)

    const validation = validateBackupText(text)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    expect(validation.migratedFrom).toBeNull()

    const result = await applyImport({
      storage: harness.storage,
      document: validation.document,
      mode: 'replace-all',
    })
    expect(result.written).toBe(4)
    expect(result.perType['user_prefs']).toBe(4)

    const after = await harness.storage.getRecords(allIds)
    expect(after).toHaveLength(4)

    for (const id of allIds) {
      const original = before.find((record) => record.id === id)
      const restored = after.find((record) => record.id === id)

      expect(restored?.hlc).toBe(original?.hlc)
      expect(restored?.deleted).toBe(original?.deleted)
      if (restored === undefined) throw new Error(`record ${id} hilang setelah import`)

      // `toEqual` membandingkan isi, bukan urutan key JSON - jadi bentuk data hasil validasi schema
      // boleh berbeda urutan tanpa dianggap tidak identik.
      expect(openStored(restored).data).toEqual(prefsFor(id))
    }

    // Record hasil import HARUS menunggu dikirim (PRD F10: import → sync).
    expect(await harness.storage.countOutbox()).toBe(4)
  })

  it('mode merge: versi lokal yang lebih baru tidak ditimpa berkas', async () => {
    const harness = createHarness()
    const localId = recordIdFor(20)
    const newId = recordIdFor(21)
    await harness.write(localId)

    const document = buildBackupDocument({
      records: [
        {
          id: localId,
          type: 'user_prefs',
          hlc: `${NOW - 10_000}-0-deviceb`,
          deleted: false,
          data: prefsFor(localId),
        },
        {
          id: newId,
          type: 'user_prefs',
          hlc: `${NOW - 9_000}-0-deviceb`,
          deleted: false,
          data: prefsFor(newId),
        },
      ],
      exportedAtMs: NOW,
    })

    const result = await applyImport({ storage: harness.storage, document, mode: 'merge' })

    expect(result.written).toBe(1)
    expect(result.skipped).toBe(1)
    expect((await harness.storage.getRecord(localId))?.hlc).toBe(`${NOW}-0-${DEVICE_ID}`)
    expect((await harness.storage.getRecord(newId))?.hlc).toBe(`${NOW - 9_000}-0-deviceb`)
  })

  it('mode replace-all menghapus data lama lebih dulu', async () => {
    const harness = createHarness()
    const oldId = recordIdFor(30)
    await harness.write(oldId)

    const document = buildBackupDocument({
      records: [
        {
          id: recordIdFor(31),
          type: 'user_prefs',
          hlc: `${NOW}-0-deviceb`,
          deleted: false,
          data: prefsFor(recordIdFor(31)),
        },
      ],
      exportedAtMs: NOW,
    })

    await applyImport({ storage: harness.storage, document, mode: 'replace-all' })

    expect(await harness.storage.getRecord(oldId)).toBeNull()
    expect(await harness.storage.getRecord(recordIdFor(31))).not.toBeNull()
  })
})

describe('io/import - penolakan tanpa mengubah data', () => {
  /**
   * Bukti nol mutasi: isi record, outbox, dan sync_state dibandingkan sebelum & sesudah validasi
   * berkas yang ditolak. `validateBackupText` memang cuma membaca teks - test ini yang menjaganya
   * tetap begitu.
   */
  async function expectRejectedWithoutMutation(
    harness: Harness,
    text: string,
    expectedReason: ImportRejection['reason'],
    options?: Parameters<typeof validateBackupText>[1],
  ): Promise<ImportRejection> {
    const before = await harness.snapshot()
    const rejection = rejectionOf(validateBackupText(text, options))
    const after = await harness.snapshot()

    expect(rejection.reason).toBe(expectedReason)
    expect(rejection.message.length).toBeGreaterThan(0)
    expect(after).toBe(before)

    return rejection
  }

  async function seededHarness(recordId: string): Promise<Harness> {
    const harness = createHarness()
    await harness.write(recordId)
    return harness
  }

  it('JSON rusak ditolak', async () => {
    const harness = await seededHarness(recordIdFor(40))
    await expectRejectedWithoutMutation(harness, '{ ini bukan json', 'INVALID_JSON')
  })

  it('isi berkas yang bukan objek ditolak', async () => {
    const harness = await seededHarness(recordIdFor(41))
    await expectRejectedWithoutMutation(harness, '[]', 'NOT_OBJECT')
  })

  it('versi skema lebih baru ditolak (user diminta upgrade)', async () => {
    const harness = await seededHarness(recordIdFor(42))
    const document = await harness.exportDocument()

    const text = serializeBackup({ ...document, schemaVersion: CURRENT_SCHEMA_VERSION + 1 })
    const rejection = await expectRejectedWithoutMutation(harness, text, 'VERSION_TOO_NEW')
    expect(rejection.message).toContain('Perbarui aplikasi')
  })

  it('versi format berkas asing ditolak', async () => {
    const harness = await seededHarness(recordIdFor(43))
    const document = await harness.exportDocument()

    await expectRejectedWithoutMutation(
      harness,
      serializeBackup({ ...document, version: '99.0.0' }),
      'FORMAT_VERSION_UNSUPPORTED',
    )
  })

  it('berkas terenkripsi ditolak dengan alasan sendiri', async () => {
    const harness = await seededHarness(recordIdFor(44))
    const document = await harness.exportDocument()

    const rejection = await expectRejectedWithoutMutation(
      harness,
      JSON.stringify({ ...document, encrypted: true }),
      'ENCRYPTED_NOT_SUPPORTED',
    )
    expect(rejection.message).toContain('terenkripsi')
  })

  it('berkas terlalu besar ditolak sebelum di-parse', async () => {
    const harness = await seededHarness(recordIdFor(45))
    const document = await harness.exportDocument()

    const rejection = await expectRejectedWithoutMutation(
      harness,
      serializeBackup(document),
      'FILE_TOO_LARGE',
      { maxBytes: 16 },
    )
    expect(rejection.message).toContain('Berkas terlalu besar')
  })

  it('jumlah record melebihi batas ditolak', async () => {
    const harness = await seededHarness(recordIdFor(46))
    await harness.write(recordIdFor(47))
    const document = await harness.exportDocument()

    await expectRejectedWithoutMutation(harness, serializeBackup(document), 'TOO_MANY_RECORDS', {
      maxRecords: 1,
    })
  })

  it('dua record ber-id sama ditolak', async () => {
    const harness = await seededHarness(recordIdFor(48))
    const document = await harness.exportDocument()
    const record = document.records[0]

    const text = serializeBackup({
      ...document,
      records: [record, record].filter((entry): entry is BackupRecord => entry !== undefined),
    })

    await expectRejectedWithoutMutation(harness, text, 'DUPLICATE_ID')
  })

  it('struktur berkas yang tidak cocok ditolak dengan rincian masalah', async () => {
    const harness = await seededHarness(recordIdFor(49))
    const document = await harness.exportDocument()

    const rejection = await expectRejectedWithoutMutation(
      harness,
      JSON.stringify({ ...document, records: 'bukan array' }),
      'SCHEMA_MISMATCH',
    )
    expect(rejection.issues.length).toBeGreaterThan(0)
  })

  it('satu payload rusak menggagalkan seluruh berkas (all-or-nothing)', async () => {
    const harness = await seededHarness(recordIdFor(50))
    const document = await harness.exportDocument()

    const text = serializeBackup({
      ...document,
      records: [
        ...document.records,
        {
          id: recordIdFor(51),
          type: 'todo',
          hlc: `${NOW}-0-deviceb`,
          deleted: false,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: {},
        },
      ],
    })

    const rejection = await expectRejectedWithoutMutation(harness, text, 'INVALID_RECORD')
    expect(rejection.issues.some((issue) => issue.startsWith('todo/'))).toBe(true)
  })
})

describe('io/migrations', () => {
  it('berkas versi lama dimigrasikan sebelum validasi payload', async () => {
    const harness = createHarness()
    const targetId = recordIdFor(60)
    const migratedIds: string[] = []

    const migration: SchemaMigration = {
      from: 1,
      to: 2,
      description: 'uji: payload lama yang kosong diisi default',
      migrate: (record) => {
        migratedIds.push(record.id)
        return { ...record, schemaVersion: 2, data: prefsFor(record.id) }
      },
    }

    // Berkasnya sengaja berisi payload yang TIDAK sah untuk versi sekarang; jalur migrasilah yang
    // memperbaikinya, dan validasi penuh tetap dijalankan setelah migrasi.
    const legacy = {
      format: BACKUP_FORMAT,
      version: BACKUP_FORMAT_VERSION,
      schemaVersion: 1,
      exportedAtMs: NOW,
      encrypted: false,
      dataCount: { ...emptyDataCount(), user_prefs: 1 },
      records: [
        {
          id: targetId,
          type: 'user_prefs',
          hlc: `${NOW - 1_000}-0-deviceb`,
          deleted: false,
          schemaVersion: 1,
          data: {},
        },
      ],
    }

    const validation = validateBackupText(JSON.stringify(legacy), {
      targetSchemaVersion: 2,
      migrations: [migration],
    })

    expect(validation.ok).toBe(true)
    if (!validation.ok) return

    expect(validation.migratedFrom).toBe(1)
    expect(validation.migratedRecords).toBe(1)
    expect(migratedIds).toEqual([targetId])
    expect(validation.document.schemaVersion).toBe(2)
    expect(validation.document.records[0]?.data).toEqual(prefsFor(targetId))

    // Dan hasil migrasinya benar-benar bisa diimport.
    const applied = await applyImport({
      storage: harness.storage,
      document: validation.document,
      mode: 'replace-all',
    })
    expect(applied.written).toBe(1)
  })

  it('versi lama tanpa jalur migrasi ditolak', async () => {
    const harness = createHarness()
    await harness.write(recordIdFor(61))
    const document = await harness.exportDocument()

    const before = await harness.snapshot()
    const rejection = rejectionOf(
      validateBackupText(serializeBackup(document), {
        targetSchemaVersion: CURRENT_SCHEMA_VERSION + 2,
        migrations: SCHEMA_MIGRATIONS,
      }),
    )
    expect(rejection.reason).toBe('NO_MIGRATION_PATH')
    expect(await harness.snapshot()).toBe(before)
  })

  it('migrateRecords menempuh beberapa langkah berurutan', () => {
    const calls: string[] = []
    const step = (from: number, to: number): SchemaMigration => ({
      from,
      to,
      description: `uji ${from}->${to}`,
      migrate: (record) => {
        calls.push(`${from}->${to}`)
        return { ...record, schemaVersion: to }
      },
    })

    const record = {
      id: recordIdFor(62),
      type: 'user_prefs' as const,
      hlc: `${NOW}-0-devicea`,
      deleted: false,
      schemaVersion: 1,
      data: prefsFor(recordIdFor(62)),
    }

    const result = migrateRecords({
      records: [record],
      fromVersion: 1,
      toVersion: 3,
      migrations: [step(1, 2), step(2, 3)],
    })

    expect(calls).toEqual(['1->2', '2->3'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.records[0]?.schemaVersion).toBe(3)
  })

  it('migrateRecords berhenti kalau satu langkah hilang dan melaporkan versi tempat buntu', () => {
    const result = migrateRecords({
      records: [],
      fromVersion: 1,
      toVersion: 3,
      migrations: [
        {
          from: 1,
          to: 2,
          description: 'uji',
          migrate: (record) => ({ ...record, schemaVersion: 2 }),
        },
      ],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('NO_MIGRATION_PATH')
    expect(result.reached).toBe(2)
  })

  it('migrateRecords tanpa perubahan versi mengembalikan record apa adanya', () => {
    const result = migrateRecords({ records: [], fromVersion: 1, toVersion: 1 })
    expect(result).toEqual({ ok: true, records: [] })
  })
})
