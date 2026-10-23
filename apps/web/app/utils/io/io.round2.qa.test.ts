import {
  DEFAULT_USER_PREFS,
  buildRecordWrite,
  commitLocalWrite,
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  validateBackupText,
  type CryptoProvider,
  type SecureKeyMaterial,
  type StorageAdapter,
} from '@improve-personal/core'
import { describe, expect, it } from 'vitest'

import { createRepository } from '../storage/repository'
import { createBackupFile } from './export'
import { applyBackupDocument } from './import'

/**
 * Verifikasi QA putaran 2 (task #26, T12) - jalur SHELL yang dipakai halaman Import & Export.
 *
 * Test milik developer menguji dua ujungnya secara terpisah: `export.test.ts` membuktikan berkas
 * hasil export lolos `validateBackupText`, `import.test.ts` membuktikan dokumen yang dibuat manual
 * bisa ditulis. Yang belum dibuktikan di sana adalah rantai penuh yang dialami user:
 * `createBackupFile` -> berkas -> `validateBackupText` -> `applyBackupDocument` -> dibaca lagi.
 *
 * Ditulis ulang dari nol (bukan menyalin helper test developer) supaya kalau salah satu helper test
 * itu keliru, test ini tetap bisa gagal.
 */

const NOW = 1_700_000_000_000
const DEVICE_ID = 'qa-device'

/** Kripto diganti plaintext: yang diuji alur shell, bukan libsodium (lihat `io.test.ts` core). */
const provider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => plaintext,
  openRecord: async ({ blob }) => blob,
}
const dataKey: SecureKeyMaterial = { kind: 'test', handle: null }

function idFor(n: number): string {
  return `018f2c4e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

function todoData(id: string): Record<string, unknown> {
  return {
    id,
    title: `task ${id.slice(-2)}`,
    note: null,
    deadlineAt: NOW + 3_600_000,
    priority: 'medium',
    isDone: false,
    completedAt: null,
    scheduleId: null,
    scheduleOccurrenceAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function prefsData(id: string): Record<string, unknown> {
  return { id, ...DEFAULT_USER_PREFS, updatedAt: NOW }
}

type Seed = {
  readonly id: string
  readonly type: 'todo' | 'user_prefs'
  readonly deleted?: boolean
  readonly data: Record<string, unknown>
}

async function seedStorage(storage: StorageAdapter, seeds: readonly Seed[]): Promise<void> {
  for (const [index, seed] of seeds.entries()) {
    const deleted = seed.deleted ?? false
    await commitLocalWrite({
      storage,
      write: buildRecordWrite({
        sealed: {
          id: seed.id,
          hlc: `${NOW}-${index}-${DEVICE_ID}`,
          deleted,
          blob: JSON.stringify({ type: seed.type, schemaVersion: 1, data: seed.data }),
        },
        index: {
          recordId: seed.id,
          entityType: seed.type,
          rangeStartMs: null,
          rangeEndMs: null,
          updatedAtMs: NOW,
        },
        op: deleted ? 'delete' : 'put',
        outbox: { id: `seed-${index}`, queuedAtMs: NOW },
      }),
    })
  }
}

async function readAll(storage: StorageAdapter, type: 'todo' | 'user_prefs') {
  const records = await createRepository<unknown>({ storage, provider, dataKey }, type).listAll({
    includeDeleted: true,
  })

  return records
    .map((record) => ({
      id: record.id,
      type: record.type,
      hlc: record.hlc,
      deleted: record.deleted,
      data: record.data,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

describe('QA putaran 2: round-trip penuh lewat jalur shell (export -> validasi -> import)', () => {
  it('data hasil import identik dengan aslinya, termasuk tombstone dan jumlah outbox', async () => {
    const sourceStorage = createMemoryStorage({ clock: createManualClock(NOW) })
    const seeds: Seed[] = [
      { id: idFor(1), type: 'todo', data: todoData(idFor(1)) },
      { id: idFor(2), type: 'todo', data: todoData(idFor(2)), deleted: true },
      { id: idFor(3), type: 'user_prefs', data: prefsData(idFor(3)) },
    ]
    await seedStorage(sourceStorage, seeds)

    const before = [
      ...(await readAll(sourceStorage, 'todo')),
      ...(await readAll(sourceStorage, 'user_prefs')),
    ]
    expect(before).toHaveLength(3)

    const file = await createBackupFile({
      source: { storage: sourceStorage, provider, dataKey },
      exportedAtMs: NOW,
      tz: 'UTC',
    })

    const validation = validateBackupText(file.text)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return

    const targetStorage = createMemoryStorage({ clock: createManualClock(NOW) })
    const target = {
      storage: targetStorage,
      provider,
      dataKey,
      hlc: createHlcGenerator({ deviceId: 'target', clock: createManualClock(NOW) }),
    }

    const result = await applyBackupDocument({
      target,
      document: validation.document,
      mode: 'replace-all',
      nowMs: NOW,
    })

    expect(result).toMatchObject({ mode: 'replace-all', written: 3, skipped: 0, outboxRows: 3 })

    const after = [
      ...(await readAll(targetStorage, 'todo')),
      ...(await readAll(targetStorage, 'user_prefs')),
    ]
    expect(after).toEqual(before)

    // Record hasil import harus ikut tersinkron (PRD F10: "execute import -> sync").
    expect(await targetStorage.countOutbox()).toBe(3)
  })

  it('berkas yang sama diimpor dua kali (mode gabung) tidak menggandakan data', async () => {
    const sourceStorage = createMemoryStorage({ clock: createManualClock(NOW) })
    await seedStorage(sourceStorage, [{ id: idFor(10), type: 'todo', data: todoData(idFor(10)) }])

    const file = await createBackupFile({
      source: { storage: sourceStorage, provider, dataKey },
      exportedAtMs: NOW,
      tz: 'UTC',
    })

    const targetStorage = createMemoryStorage({ clock: createManualClock(NOW) })
    const target = {
      storage: targetStorage,
      provider,
      dataKey,
      hlc: createHlcGenerator({ deviceId: 'target', clock: createManualClock(NOW) }),
    }

    const validation = validateBackupText(file.text)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return

    const first = await applyBackupDocument({
      target,
      document: validation.document,
      mode: 'merge',
      nowMs: NOW,
    })
    const second = await applyBackupDocument({
      target,
      document: validation.document,
      mode: 'merge',
      nowMs: NOW,
    })

    expect(first.written).toBe(1)
    expect(second).toMatchObject({ written: 0, skipped: 1 })
    expect(await readAll(targetStorage, 'todo')).toHaveLength(1)
  })
})
