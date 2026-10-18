import { ERROR_CODES, SYNC_MAX_BATCH } from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import { runStorageAdapterContractTests } from './adapters/contract.ts'
import {
  BACKUP_FORMAT,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_USER_PREFS,
  ENTITY_TYPES,
  HttpError,
  MS_PER_DAY,
  STORAGE_TABLES,
  SYNC_DEBOUNCE_MS,
  SYNC_OPS,
  SYNC_STATUSES,
  SYNC_TRIGGERS,
  appStyleSchema,
  applyBackupImport,
  buildBackupDocument,
  buildPullUrl,
  buildRecordWrite,
  compareIndexEntries,
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  decideMerge,
  deriveSyncStatus,
  dueSyncTriggers,
  entityTypeSchema,
  expandOccurrenceTimes,
  habitStreak,
  pointIndex,
  pullDelta,
  pushOutbox,
  readSyncStatus,
  schedulePayloadSchema,
  serializeBackup,
  shouldPullNow,
  syncDebounceRemainingMs,
  validateBackupText,
  type Clock,
  type StorageAdapter,
} from './index.ts'

/**
 * Test barrel `src/index.ts`.
 *
 * `export *` dari beberapa sub-barrel punya satu jebakan: kalau nama yang sama keluar dari dua
 * sub-barrel, ESM membuangnya TANPA error - jadi `import { X } from '@improve-personal/core'` bisa
 * gagal di build app, bukan di sini. Karena itu nama perwakilan dari setiap modul diimpor lewat barrel
 * ini; nama yang hilang membuat test ini gagal, bukan menjadi bug misterius di web/mobile.
 *
 * Suite kontrak adapter sengaja TIDAK di sini: dia bergantung `vitest` dan jalurnya
 * `@improve-personal/core/testing` (lihat `package.json`), supaya kode runtime core tetap bersih.
 */

describe('barrel @improve-personal/core', () => {
  it('mengekspor domain: enums, envelope, entitas, storage', () => {
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(1)
    expect(ENTITY_TYPES).toContain('todo')
    expect(SYNC_OPS).toEqual(['put', 'delete'])
    expect(SYNC_STATUSES).toContain('synced')
    expect(STORAGE_TABLES.syncOutbox).toBe('sync_outbox')
    expect(entityTypeSchema.safeParse('habit').success).toBe(true)
    expect(appStyleSchema).toBeDefined()
    expect(schedulePayloadSchema).toBeDefined()
    expect(DEFAULT_USER_PREFS).toBeDefined()
  })

  it('mengekspor recurrence, calc, dan helper index rentang', () => {
    expect(typeof habitStreak).toBe('function')
    expect(typeof expandOccurrenceTimes).toBe('function')
    expect(MS_PER_DAY).toBe(86_400_000)
    expect(typeof compareIndexEntries).toBe('function')
    expect(pointIndex('018f2c4e-0000-7000-8000-000000000001', 'todo', 0, 0).rangeEndMs).toBeNull()
  })

  it('mengekspor port: StorageAdapter, Clock, dan HttpError', () => {
    const clock: Clock = createManualClock(1_700_000_000_000)
    const storage: StorageAdapter = createMemoryStorage({ clock })

    expect(typeof storage.runTransaction).toBe('function')
    expect(clock.monotonicMs()).toBe(1_700_000_000_000)

    const error = new HttpError(409, ERROR_CODES[0] ?? null, 'contoh')
    expect(error.status).toBe(409)
    expect(error.name).toBe('HttpError')
  })

  it('mengekspor sync: HLC, LWW, jadwal, status, push/pull', () => {
    const clock = createManualClock(1_700_000_000_000)
    const hlc = createHlcGenerator({ deviceId: 'devicea', clock })

    expect(typeof hlc.tick()).toBe('string')
    expect(decideMerge(null, { id: 'x', hlc: hlc.tick(), deleted: false }).action).toBe('insert')
    expect(dueSyncTriggers({ online: false, nowMs: 0 })).toEqual([])
    expect(shouldPullNow({ triggers: [], lastSyncAtMs: null, nowMs: 0 })).toBe(false)
    expect(syncDebounceRemainingMs(0, null)).toBe(0)
    expect(SYNC_DEBOUNCE_MS).toBe(2_000)
    expect(SYNC_TRIGGERS).toContain('reconnect')
    expect(deriveSyncStatus({ online: true, pendingCount: 0, hasError: false })).toBe('synced')
    expect(typeof readSyncStatus).toBe('function')
    expect(buildPullUrl('/v1/sync/pull', 0, 10)).toContain('cursor=0')
    expect(typeof pushOutbox).toBe('function')
    expect(typeof pullDelta).toBe('function')
    expect(typeof buildRecordWrite).toBe('function')
    expect(SYNC_MAX_BATCH).toBe(500)
  })

  it('mengekspor io: export/import + migrasi versi skema', () => {
    const document = buildBackupDocument({ records: [], exportedAtMs: 1_700_000_000_000 })

    expect(document.format).toBe(BACKUP_FORMAT)
    expect(document.encrypted).toBe(false)
    expect(validateBackupText(serializeBackup(document)).ok).toBe(true)
    expect(typeof applyBackupImport).toBe('function')
  })

  it('suite kontrak adapter tersedia untuk IndexedDB & SQLite (AC T23)', () => {
    expect(typeof runStorageAdapterContractTests).toBe('function')
  })
})
