import {
  BackupImportInvariantError,
  DEFAULT_USER_PREFS,
  buildBackupDocument,
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  emptyDataCount,
  type BackupDocument,
  type BackupRecordInput,
  type CryptoProvider,
  type SecureKeyMaterial,
  type StorageAdapter,
} from '@improve-personal/core'
import { compareHlc } from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import { createRepository } from '../storage/repository'
import { applyBackupDocument, backupIndexEntry, describeImportResult } from './import'

/**
 * Import F10 pada lapisan shell: yang diuji adalah WIRING yang tidak dimiliki core - enkripsi record,
 * baris index per tipe, id outbox, dan adopsi HLC dari berkas.
 *
 * QA T12 mencatat "adapter asli belum diuji untuk import". Test ini menutup bagian yang bisa diuji
 * tanpa IndexedDB: adapter memori core (kontraknya sama dengan IndexedDB) + provider plaintext.
 */

const NOW = 1_700_000_000_000
const DEVICE_ID = 'devicea'

const provider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => plaintext,
  openRecord: async ({ blob }) => blob,
}
const dataKey: SecureKeyMaterial = { kind: 'test', handle: null }

function recordIdFor(n: number): string {
  return `018f2c4e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

const TODO_ID = recordIdFor(1)
const PREFS_ID = recordIdFor(2)
const DEADLINE_AT = NOW + 3_600_000
/** HLC berkas sengaja di masa depan: perangkat asal jamnya lebih maju. */
const IMPORTED_HLC = `${NOW + 600_000}-0-sourcedevice`

function todoPayload(id: string): unknown {
  return {
    id,
    title: 'Belajar import',
    note: null,
    deadlineAt: DEADLINE_AT,
    priority: 'medium',
    isDone: false,
    completedAt: null,
    scheduleId: null,
    scheduleOccurrenceAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function prefsPayload(id: string): unknown {
  return { id, ...DEFAULT_USER_PREFS, updatedAt: NOW }
}

function backupRecords(): BackupRecordInput[] {
  return [
    {
      id: TODO_ID,
      type: 'todo',
      hlc: IMPORTED_HLC,
      deleted: false,
      data: todoPayload(TODO_ID),
    },
    {
      id: PREFS_ID,
      type: 'user_prefs',
      hlc: `${NOW}-0-sourcedevice`,
      deleted: true,
      data: prefsPayload(PREFS_ID),
    },
  ]
}

function createTarget(): {
  storage: StorageAdapter
  hlc: ReturnType<typeof createHlcGenerator>
} {
  const clock = createManualClock(NOW)
  return {
    storage: createMemoryStorage({ clock }),
    hlc: createHlcGenerator({ deviceId: DEVICE_ID, clock }),
  }
}

describe('applyBackupDocument', () => {
  it('menulis record, baris index, dan outbox supaya hasil import langsung terlihat & tersinkron', async () => {
    const { storage, hlc } = createTarget()
    const document = buildBackupDocument({ records: backupRecords(), exportedAtMs: NOW })

    const result = await applyBackupDocument({
      target: { storage, provider, dataKey, hlc },
      document,
      mode: 'merge',
      nowMs: NOW,
    })

    expect(result).toMatchObject({ mode: 'merge', written: 2, skipped: 0, outboxRows: 2 })

    // Terbaca lewat repository - jalur yang sama dengan UI, bukan membuka blob langsung.
    const todos = await createRepository<unknown>({ storage, provider, dataKey }, 'todo').listAll()
    expect(todos).toHaveLength(1)
    expect(todos[0]?.data).toEqual(todoPayload(TODO_ID))

    const todoIndex = await storage.listIndexByType('todo')
    expect(todoIndex).toHaveLength(1)
    expect(todoIndex[0]).toMatchObject({ rangeStartMs: DEADLINE_AT, rangeEndMs: null })

    // Entitas tanpa dimensi waktu tetap punya baris index - tanpa itu record tidak akan pernah
    // ditemukan `listAll` lagi.
    const prefsIndex = await storage.listIndexByType('user_prefs')
    expect(prefsIndex).toHaveLength(1)
    expect(prefsIndex[0]?.rangeStartMs).toBeNull()

    const outbox = await storage.listOutbox(10)
    expect(outbox).toHaveLength(2)
  })

  it('mengadopsi HLC dari berkas supaya edit berikutnya tidak kalah LWW', async () => {
    const { storage, hlc } = createTarget()
    const document = buildBackupDocument({ records: backupRecords(), exportedAtMs: NOW })

    await applyBackupDocument({
      target: { storage, provider, dataKey, hlc },
      document,
      mode: 'merge',
      nowMs: NOW,
    })

    expect(compareHlc(hlc.tick(), IMPORTED_HLC)).toBe(1)
  })

  it('menolak dokumen yang datanya tidak konsisten TANPA menulis apa pun (defense-in-depth)', async () => {
    const { storage, hlc } = createTarget()
    const document = buildBackupDocument({ records: backupRecords(), exportedAtMs: NOW })
    const tampered: BackupDocument = {
      ...document,
      dataCount: { ...document.dataCount, todo: 99 },
    }

    await expect(
      applyBackupDocument({
        target: { storage, provider, dataKey, hlc },
        document: tampered,
        mode: 'replace-all',
        nowMs: NOW,
      }),
    ).rejects.toBeInstanceOf(BackupImportInvariantError)

    expect(await storage.getRecords([TODO_ID, PREFS_ID])).toHaveLength(0)
    expect(await storage.listIndexByType('todo')).toHaveLength(0)
  })
})

describe('backupIndexEntry', () => {
  it('memakai rentang yang sama dengan fiturnya: jadwal berdurasi, check-in harian, prefs tanpa waktu', () => {
    const schedule = backupIndexEntry(
      {
        id: recordIdFor(10),
        type: 'schedule',
        hlc: IMPORTED_HLC,
        deleted: false,
        schemaVersion: 1,
        data: { startAt: NOW, durationMs: 1_800_000 },
      },
      NOW,
    )
    expect(schedule).toMatchObject({
      rangeStartMs: NOW,
      rangeEndMs: NOW + 1_800_000,
      updatedAtMs: NOW,
    })

    const checkin = backupIndexEntry(
      {
        id: recordIdFor(11),
        type: 'habit_checkin',
        hlc: IMPORTED_HLC,
        deleted: false,
        schemaVersion: 1,
        data: { localDate: '2026-10-23' },
      },
      NOW,
    )
    expect(checkin.rangeStartMs).toBe(new Date('2026-10-23T00:00:00').getTime())

    const prefs = backupIndexEntry(
      {
        id: recordIdFor(12),
        type: 'user_prefs',
        hlc: IMPORTED_HLC,
        deleted: false,
        schemaVersion: 1,
        data: prefsPayload(recordIdFor(12)),
      },
      NOW,
    )
    expect(prefs).toMatchObject({ rangeStartMs: null, rangeEndMs: null })
  })
})

describe('describeImportResult', () => {
  it('menyebut jumlah data yang benar-benar tertulis dan yang dilewati', () => {
    const perType = emptyDataCount()

    expect(
      describeImportResult({ mode: 'merge', written: 2, skipped: 0, perType, outboxRows: 2 }),
    ).toBe('Import selesai, 2 data masuk.')

    expect(
      describeImportResult({ mode: 'merge', written: 1, skipped: 1, perType, outboxRows: 1 }),
    ).toBe(
      'Import selesai, 1 data masuk. 1 data dilewati karena versi di perangkat ini lebih baru.',
    )

    expect(
      describeImportResult({ mode: 'replace-all', written: 2, skipped: 0, perType, outboxRows: 2 }),
    ).toBe('Semua data diganti. Import selesai, 2 data masuk.')
  })
})
