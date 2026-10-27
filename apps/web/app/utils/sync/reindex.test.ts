import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type RecordIndexEntry,
  type SecureKeyMaterial,
} from '@improve-personal/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createRepositorySet } from '../storage/repository'
import { createRecordWriter } from '../storage/record-writer'
import type { LocalDataSession } from '../storage/session'
import { createUuidV7Generator } from '../storage/uuid'
import { resetSyncReloadersForTest } from './refresh'
import { reindexQuarantined } from './reindex'
import {
  QUARANTINE_STORAGE_KEY,
  QUARANTINE_TTL_MS,
  clearQuarantineForTest,
  isQuarantined,
  listQuarantined,
  quarantineRecord,
  quarantinedCount,
} from './quarantine'
import { TEST_KID_WIRE } from '../../../tests/nuxt/record-key'

/**
 * `reindexQuarantined()` - satu-satunya jalan pulih untuk record yang dulu dikarantina.
 *
 * Yang dijaga di sini bukan "fungsi mengembalikan angka": record hasil pull yang dulu gagal dibuka
 * SUDAH tersimpan di `record` dengan `index: 'keep'`, dan cursor sudah melewatinya - server tidak akan
 * mengirimnya lagi. Jadi test ini menguji tiga hal yang membuat pemulihan itu nyata:
 *
 * 1. baris `record_index` benar-benar terbentuk, sehingga record kembali muncul di query berbasis index;
 * 2. `sync_outbox` TIDAK bertambah (index yang belum terbangun bukan perubahan data);
 * 3. blob yang masih tidak bisa dibuka, atau payload asing, tidak pernah menghapus index lama.
 */

const USER = '018f2c4e-0000-7000-8000-00000000000a'
const DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d1'
const NOW_MS = 1_700_000_000_000
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }

const ID_A = '018f2c4e-0000-7000-8000-0000000000a1'
const ID_B = '018f2c4e-0000-7000-8000-0000000000b1'
const ID_C = '018f2c4e-0000-7000-8000-0000000000c1'
const ID_MISSING = '018f2c4e-0000-7000-8000-0000000000d2'

function todoPayload(id: string): string {
  return JSON.stringify({
    type: 'todo',
    schemaVersion: 1,
    data: {
      id,
      title: 'Tugas yang dulu tidak bisa dibuka',
      note: null,
      deadlineAt: NOW_MS,
      priority: 'medium',
      isDone: false,
      completedAt: null,
      scheduleId: null,
      scheduleOccurrenceAt: null,
      createdAt: NOW_MS - 1_000,
      updatedAt: NOW_MS - 1_000,
    },
  })
}

type Harness = {
  readonly session: LocalDataSession
  /** Id yang TIDAK bisa dibuka dengan kunci sekarang (RecordKeyError). */
  readonly broken: Set<string>
  /** Tulis record apa adanya ke tabel `record`, tanpa baris index - keadaan hasil pull `keep`. */
  readonly seed: (recordId: string, plaintext: string) => Promise<void>
  readonly indexOf: (recordId: string) => Promise<RecordIndexEntry | undefined>
  readonly inRange: (recordId: string) => Promise<boolean>
}

function createHarness(): Harness {
  const clock = createManualClock(NOW_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: DEVICE_ID, clock })
  const broken = new Set<string>()

  // Provider base64: cukup untuk menguji perilaku index, dan bisa "merusak" kunci per record.
  const provider: CryptoProvider = {
    sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
    openRecord: async ({ recordId, blob }) => {
      if (broken.has(recordId)) throw new Error('kunci data tidak cocok')
      return Buffer.from(blob, 'base64').toString('utf8')
    },
  }

  const session: LocalDataSession = {
    userId: USER,
    provider,
    clock,
    dataKey: DATA_KEY,
    kid: TEST_KID_WIRE,
    hlc,
    deviceId: DEVICE_ID,
    isFreshKey: false,
    keyStore: {
      has: async () => true,
      put: async () => undefined,
      get: async () => null,
      remove: async () => undefined,
    },
    newId: createUuidV7Generator({ clock }),
    withMasterKey: async (work) => work(new Uint8Array(32)),
    storage,
    repos: createRepositorySet({ storage, provider, dataKey: DATA_KEY }),
    writer: createRecordWriter({ storage, provider, dataKey: DATA_KEY, hlc, clock }),
  }

  return {
    session,
    broken,
    seed: async (recordId, plaintext) => {
      await storage.runTransaction('seed', async (tx) => {
        await tx.putRecord({
          sealed: {
            id: recordId,
            hlc: '1000-0-device-a',
            deleted: false,
            blob: Buffer.from(plaintext, 'utf8').toString('base64'),
          },
          index: 'keep',
          op: 'put',
          outbox: { id: `outbox-${recordId}`, queuedAtMs: NOW_MS },
        })
      })
      // Baris outbox dibuang: keadaan yang diuji adalah record yang SUDAH ada di server, bukan tulisan
      // lokal yang menunggu dikirim.
      await storage.deleteOutboxRows([`outbox-${recordId}`])
    },
    indexOf: async (recordId) =>
      (await storage.listIndexByType('todo')).find((entry) => entry.recordId === recordId),
    inRange: async (recordId) => {
      const rows = await storage.queryByRange({
        entityTypes: ['todo'],
        fromMs: NOW_MS - 60_000,
        toMs: NOW_MS + 60_000,
      })
      return rows.some((row) => row.id === recordId)
    },
  }
}

/** Karantina kedaluwarsa ditulis apa adanya: `quarantineRecord` selalu memakai waktu sekarang. */
function quarantineAsDue(ownerId: string, recordId: string): void {
  const atMs = Date.now() - QUARANTINE_TTL_MS - 60_000
  localStorage.setItem(
    QUARANTINE_STORAGE_KEY,
    JSON.stringify({ version: 2, owners: { [ownerId]: [{ atMs, ids: [recordId] }] } }),
  )
}

beforeEach(() => {
  clearQuarantineForTest()
  resetSyncReloadersForTest()
})

afterEach(() => {
  clearQuarantineForTest()
  resetSyncReloadersForTest()
  vi.restoreAllMocks()
})

describe('reindexQuarantined', () => {
  it('membangun ulang index record yang pulih dan mengeluarkannya dari karantina', async () => {
    const { session, seed, indexOf, inRange } = createHarness()
    await seed(ID_A, todoPayload(ID_A))
    quarantineRecord(USER, ID_A)

    // Keadaan awal: blob ada, tapi tidak ada baris index - record tidak muncul di query mana pun.
    expect(await indexOf(ID_A)).toBeUndefined()
    expect(await inRange(ID_A)).toBe(false)
    const outboxBefore = await session.storage.countOutbox()

    const result = await reindexQuarantined(session, { dueOnly: false })

    expect(result).toEqual({ recovered: 1, remaining: 0 })
    expect(await indexOf(ID_A)).toMatchObject({ recordId: ID_A, entityType: 'todo' })
    expect(await inRange(ID_A)).toBe(true)
    expect(isQuarantined(USER, ID_A)).toBe(false)
    expect(listQuarantined(USER)).toEqual([])
    // Index yang dibangun ulang bukan perubahan data: tidak ada yang perlu dikirim ke server.
    expect(await session.storage.countOutbox()).toBe(outboxBefore)
  })

  it('kunci masih salah: tetap terkarantina dan index lama tidak disentuh', async () => {
    const { session, broken, seed, indexOf } = createHarness()
    await seed(ID_A, todoPayload(ID_A))
    broken.add(ID_A)

    // Index lama dari sebelum record ini gagal dibuka.
    const previous: RecordIndexEntry = {
      recordId: ID_A,
      entityType: 'todo',
      rangeStartMs: NOW_MS - 5_000,
      rangeEndMs: NOW_MS - 4_000,
      updatedAtMs: NOW_MS - 5_000,
    }
    await session.storage.runTransaction('seed.index', async (tx) => {
      await tx.putRecordIndex(ID_A, previous)
    })
    quarantineRecord(USER, ID_A)

    const result = await reindexQuarantined(session, { dueOnly: false })

    expect(result).toEqual({ recovered: 0, remaining: 1 })
    expect(isQuarantined(USER, ID_A)).toBe(true)
    expect(await indexOf(ID_A)).toEqual(previous)
  })

  it('record tidak ada di storage: keluar dari karantina tanpa membuat index', async () => {
    const { session, indexOf } = createHarness()
    quarantineRecord(USER, ID_MISSING)

    const result = await reindexQuarantined(session, { dueOnly: false })

    expect(result).toEqual({ recovered: 0, remaining: 0 })
    expect(isQuarantined(USER, ID_MISSING)).toBe(false)
    expect(await indexOf(ID_MISSING)).toBeUndefined()
  })

  it('payload/skema tidak dikenal: tetap terkarantina, index lama dibiarkan (tidak menulis null)', async () => {
    const { session, seed, indexOf } = createHarness()
    // Skema lebih baru dari build ini: bukan kegagalan kunci, isinya sengaja tidak ditebak.
    await seed(
      ID_B,
      JSON.stringify({ type: 'todo', schemaVersion: 99, data: { id: ID_B, title: 'baru' } }),
    )
    const previous: RecordIndexEntry = {
      recordId: ID_B,
      entityType: 'todo',
      rangeStartMs: NOW_MS,
      rangeEndMs: null,
      updatedAtMs: NOW_MS,
    }
    await session.storage.runTransaction('seed.index', async (tx) => {
      await tx.putRecordIndex(ID_B, previous)
    })
    quarantineRecord(USER, ID_B)

    const result = await reindexQuarantined(session, { dueOnly: false })

    expect(result).toEqual({ recovered: 0, remaining: 1 })
    expect(isQuarantined(USER, ID_B)).toBe(true)
    expect(await indexOf(ID_B)).toEqual(previous)
  })

  it('satu record gagal tidak menghentikan record lain', async () => {
    const { session, broken, seed, inRange } = createHarness()
    await seed(ID_A, todoPayload(ID_A))
    await seed(ID_B, 'bukan json payload record')
    await seed(ID_C, todoPayload(ID_C))
    broken.add(ID_A)
    quarantineRecord(USER, ID_A)
    quarantineRecord(USER, ID_B)
    quarantineRecord(USER, ID_C)

    const result = await reindexQuarantined(session, { dueOnly: false })

    expect(result).toEqual({ recovered: 1, remaining: 2 })
    expect(isQuarantined(USER, ID_A)).toBe(true)
    // Payload bukan JSON yang sah juga bukan `RecordKeyError`: tetap terkarantina, bukan dilewati diam-diam.
    expect(isQuarantined(USER, ID_B)).toBe(true)
    expect(isQuarantined(USER, ID_C)).toBe(false)
    expect(await inRange(ID_C)).toBe(true)
  })

  it('`dueOnly` hanya menyentuh entri yang sudah kedaluwarsa', async () => {
    const { session, seed, inRange } = createHarness()
    await seed(ID_A, todoPayload(ID_A))
    await seed(ID_C, todoPayload(ID_C))
    // Yang kedaluwarsa ditulis lebih dulu; `quarantineRecord` membaca ulang daftar (dan memindahkan
    // entri basi ke antrean "due") sebelum menambahkan entri baru.
    quarantineAsDue(USER, ID_A)
    quarantineRecord(USER, ID_C)

    const result = await reindexQuarantined(session, { dueOnly: true })

    expect(result).toEqual({ recovered: 1, remaining: 1 })
    expect(await inRange(ID_A)).toBe(true)
    expect(await inRange(ID_C)).toBe(false)
    expect(isQuarantined(USER, ID_C)).toBe(true)

    // `dueOnly: false` (aksi user / setelah pemulihan kunci) menyentuh sisanya.
    expect(await reindexQuarantined(session, { dueOnly: false })).toEqual({
      recovered: 1,
      remaining: 0,
    })
    expect(await inRange(ID_C)).toBe(true)
  })

  it('storage menolak pembacaan: tidak melempar dan daftar dibiarkan apa adanya', async () => {
    const { session, seed } = createHarness()
    await seed(ID_A, todoPayload(ID_A))
    quarantineRecord(USER, ID_A)
    vi.spyOn(session.storage, 'getRecords').mockRejectedValue(new Error('storage diblokir'))

    const result = await reindexQuarantined(session, { dueOnly: false })

    expect(result).toEqual({ recovered: 0, remaining: 1 })
    expect(isQuarantined(USER, ID_A)).toBe(true)
  })

  it('tanpa karantina: tidak membaca storage sama sekali', async () => {
    const { session } = createHarness()
    const getRecords = vi.spyOn(session.storage, 'getRecords')

    const result = await reindexQuarantined(session, { dueOnly: true })

    expect(result).toEqual({ recovered: 0, remaining: 0 })
    expect(getRecords).not.toHaveBeenCalled()
    expect(quarantinedCount(USER)).toBe(0)
  })
})
