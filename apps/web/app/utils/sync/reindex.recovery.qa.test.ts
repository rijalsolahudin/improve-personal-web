// @vitest-environment node
//
// QA T79 (Ergonio #79) - pemulihan record terkarantina, diuji dengan KRIPTO SUNGGUHAN.
//
// `reindex.test.ts` (milik pengembang) memakai provider base64: cukup untuk membuktikan alur, tetapi
// tidak membuktikan bahwa blob yang benar-benar tersegel (XChaCha20-Poly1305, AAD = recordId) bisa
// dibuka ulang dari penyimpanan lokal setelah kunci yang benar terpasang. Di sini provider produksi
// dipakai, jadi kegagalan `RecordKeyError` yang asli (kunci salah / blob rusak) ikut teruji.
//
// `localStorage` di-stub karena environment-nya `node` (libsodium butuh Node, bukan happy-dom):
// daftar karantina memang hidup di `localStorage`, bukan di IndexedDB.

import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
  type StoredSyncState,
} from '@improve-personal/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSodiumCryptoProvider, rawDataKeyMaterial } from '../crypto/provider'
import { encodeRecord } from '../storage/record-codec'
import { createRecordWriter } from '../storage/record-writer'
import { createRepositorySet } from '../storage/repository'
import type { LocalDataSession } from '../storage/session'
import { createUuidV7Generator } from '../storage/uuid'
import { resetSyncReloadersForTest } from './refresh'
import { reindexQuarantined } from './reindex'
import {
  QUARANTINE_DUE_STORAGE_KEY,
  QUARANTINE_STORAGE_KEY,
  QUARANTINE_TTL_MS,
  clearQuarantineForTest,
  isQuarantined,
  listQuarantined,
  quarantineRecord,
} from './quarantine'

const USER_A = '018f2c4e-0000-7000-8000-00000000000a'
const USER_B = '018f2c4e-0000-7000-8000-00000000000b'
const DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d1'
const NOW_MS = 1_700_000_000_000

const ID_A = '018f2c4e-0000-7000-8000-0000000000a1'
const ID_B = '018f2c4e-0000-7000-8000-0000000000b1'

/** `localStorage` palsu: cukup untuk daftar karantina, tanpa menyentuh milik happy-dom. */
function fakeLocalStorage(): Storage {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key)
    },
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  } as Storage
}

function todoData(id: string): unknown {
  return {
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
  }
}

type Harness = {
  readonly session: LocalDataSession
  /** Tulis record tersegel seperti hasil pull yang dulu tidak bisa di-index (`index: 'keep'`). */
  readonly seed: (
    recordId: string,
    sealed: Awaited<ReturnType<typeof encodeRecord>>,
  ) => Promise<void>
  readonly inRange: (recordId: string) => Promise<boolean>
}

function createHarness(
  provider: CryptoProvider,
  dataKey: SecureKeyMaterial,
  userId = USER_A,
): Harness {
  const clock = createManualClock(NOW_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: DEVICE_ID, clock })

  const session: LocalDataSession = {
    userId,
    provider,
    clock,
    dataKey,
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
    repos: createRepositorySet({ storage, provider, dataKey }),
    writer: createRecordWriter({ storage, provider, dataKey, hlc, clock }),
  }

  return {
    session,
    seed: async (recordId, sealed) => {
      await storage.runTransaction('seed.keep', async (tx) => {
        await tx.putRecord({
          sealed,
          index: 'keep',
          op: 'put',
          outbox: { id: `outbox-${recordId}`, queuedAtMs: NOW_MS },
        })
      })
      // Keadaan yang diuji: record SUDAH ada di server (cursor sudah lewat), bukan tulisan lokal.
      await storage.deleteOutboxRows([`outbox-${recordId}`])
    },
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

async function sealTodo(provider: CryptoProvider, dataKey: SecureKeyMaterial, recordId: string) {
  return await encodeRecord(provider, dataKey, {
    id: recordId,
    type: 'todo',
    hlc: `1000-0-${recordId.slice(-4)}`,
    deleted: false,
    schemaVersion: 1,
    data: todoData(recordId),
  })
}

/** Karantina kedaluwarsa ditulis apa adanya: `quarantineRecord` selalu memakai waktu sekarang. */
function quarantineAsDue(ownerId: string, recordIds: readonly string[]): void {
  localStorage.setItem(
    QUARANTINE_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      owners: {
        [ownerId]: [{ atMs: Date.now() - QUARANTINE_TTL_MS - 60_000, ids: recordIds }],
      },
    }),
  )
}

function dueIds(ownerId: string): readonly string[] {
  const raw = localStorage.getItem(QUARANTINE_DUE_STORAGE_KEY)
  if (raw === null) return []

  const parsed = JSON.parse(raw) as { owners: Record<string, { ids: string[] }[]> }
  return (parsed.owners[ownerId] ?? []).flatMap((entry) => entry.ids)
}

const SYNC_STATE: StoredSyncState = {
  deviceId: DEVICE_ID,
  cursor: 42,
  status: 'synced',
  lastPullAtMs: NOW_MS - 5_000,
  lastPushAtMs: NOW_MS - 6_000,
}

let provider: CryptoProvider
let dataKey: SecureKeyMaterial
/** Kunci "lama" yang tidak bisa membuka record hasil rekey: hanya dipakai untuk menyegel. */
let wrongKey: SecureKeyMaterial

beforeEach(async () => {
  vi.stubGlobal('localStorage', fakeLocalStorage())
  clearQuarantineForTest()
  resetSyncReloadersForTest()
  provider = await createSodiumCryptoProvider()
  dataKey = rawDataKeyMaterial(new Uint8Array(32).fill(7))
  wrongKey = rawDataKeyMaterial(new Uint8Array(32).fill(9))
})

afterEach(() => {
  clearQuarantineForTest()
  resetSyncReloadersForTest()
  vi.unstubAllGlobals()
})

describe('AC1 - pemulihan dari blob lokal dengan kripto sungguhan', () => {
  it('index terbentuk dari blob terenkripsi, record & sync_state utuh, outbox tidak bertambah', async () => {
    const harness = createHarness(provider, dataKey)
    await harness.seed(ID_A, await sealTodo(provider, dataKey, ID_A))
    await harness.session.storage.putSyncState(SYNC_STATE)
    quarantineRecord(USER_A, ID_A)

    const recordBefore = await harness.session.storage.getRecord(ID_A)
    const stateBefore = await harness.session.storage.getSyncState()
    const outboxBefore = await harness.session.storage.countOutbox()

    // Keadaan awal: blob ada, tapi tanpa baris index ia tidak muncul di query mana pun.
    expect(await harness.inRange(ID_A)).toBe(false)
    expect(outboxBefore).toBe(0)

    const result = await reindexQuarantined(harness.session, { dueOnly: false })

    expect(result).toEqual({ recovered: 1, remaining: 0 })
    // Record kembali muncul lewat query berbasis `record_index` - bukan hanya "ada di tabel record".
    expect(await harness.inRange(ID_A)).toBe(true)
    expect(listQuarantined(USER_A)).toEqual([])

    // Konsistensi: hanya `record_index` yang ditulis.
    expect(await harness.session.storage.getRecord(ID_A)).toEqual(recordBefore)
    expect(await harness.session.storage.getSyncState()).toEqual(stateBefore)
    expect(await harness.session.storage.countOutbox()).toBe(outboxBefore)
  })
})

describe('AC2 - hanya record yang benar-benar bisa dibuka yang dipulihkan', () => {
  it('record dengan kunci lama tetap terkarantina, index lamanya tidak dihapus, dan tetap terhitung', async () => {
    const harness = createHarness(provider, dataKey)
    // ID_A disegel dengan kunci yang salah: kegagalan `RecordKeyError` yang sesungguhnya.
    await harness.seed(ID_A, await sealTodo(provider, wrongKey, ID_A))
    await harness.seed(ID_B, await sealTodo(provider, dataKey, ID_B))
    await harness.session.storage.putSyncState(SYNC_STATE)

    // Index lama ID_A dari sebelum record ini gagal dibuka - tidak boleh hilang.
    const previousIndex = {
      recordId: ID_A,
      entityType: 'todo' as const,
      rangeStartMs: NOW_MS - 9_000,
      rangeEndMs: null,
      updatedAtMs: NOW_MS - 9_000,
    }
    await harness.session.storage.runTransaction('seed.index', async (tx) => {
      await tx.putRecordIndex(ID_A, previousIndex)
    })

    quarantineRecord(USER_A, ID_A)
    quarantineRecord(USER_A, ID_B)

    const result = await reindexQuarantined(harness.session, { dueOnly: false })

    expect(result).toEqual({ recovered: 1, remaining: 1 })
    // Yang bisa dibuka pulih dan tampil.
    expect(await harness.inRange(ID_B)).toBe(true)
    expect(isQuarantined(USER_A, ID_B)).toBe(false)
    // Yang tidak bisa dibuka TETAP terkarantina dan TETAP dihitung (tidak hilang diam-diam).
    expect(isQuarantined(USER_A, ID_A)).toBe(true)
    expect(listQuarantined(USER_A).map((entry) => entry.recordId)).toEqual([ID_A])
    // Index lama tidak dihapus (menulis `null` akan menghilangkannya dari UI selamanya).
    const indexed = (await harness.session.storage.listIndexByType('todo')).find(
      (entry) => entry.recordId === ID_A,
    )
    expect(indexed).toEqual(previousIndex)
    // Konsekuensi index lama yang sengaja dipertahankan (perilaku T76): record masih muncul di query
    // berbasis rentang, walaupun isinya belum bisa dibuka. Yang dijaga di sini adalah "index-nya tidak
    // DIHAPUS", bukan "record tidak muncul sama sekali".
    expect(await harness.inRange(ID_A)).toBe(true)
    expect(await harness.session.storage.countOutbox()).toBe(0)
  })

  it('karantina milik akun lain tidak disentuh dan recordnya tidak dibaca', async () => {
    const harness = createHarness(provider, dataKey)
    await harness.seed(ID_A, await sealTodo(provider, dataKey, ID_A))
    quarantineRecord(USER_B, ID_A)

    const result = await reindexQuarantined(harness.session, { dueOnly: false })

    expect(result).toEqual({ recovered: 0, remaining: 0 })
    expect(isQuarantined(USER_B, ID_A)).toBe(true)
    expect(await harness.inRange(ID_A)).toBe(false)
  })
})

describe('putRecordIndex - index tidak bisa menunjuk record yang salah', () => {
  it('`recordId` argumen menang atas `recordId` di entri, dan record lain tidak ikut terindeks', async () => {
    const harness = createHarness(provider, dataKey)
    await harness.seed(ID_A, await sealTodo(provider, dataKey, ID_A))

    await harness.session.storage.runTransaction('qa.reindex', async (tx) => {
      await tx.putRecordIndex(ID_A, {
        recordId: ID_B,
        entityType: 'todo',
        rangeStartMs: NOW_MS,
        rangeEndMs: null,
        updatedAtMs: NOW_MS,
      })
    })

    // Satu baris, untuk ID_A - entri "asing" tidak boleh memindahkan index ke record lain.
    expect(
      (await harness.session.storage.listIndexByType('todo')).map((row) => row.recordId),
    ).toEqual([ID_A])
    expect(await harness.inRange(ID_A)).toBe(true)
  })

  it('record yang tidak ada tidak meninggalkan baris index yatim', async () => {
    const harness = createHarness(provider, dataKey)

    await harness.session.storage.runTransaction('qa.reindex', async (tx) => {
      await tx.putRecordIndex(ID_B, {
        recordId: ID_B,
        entityType: 'todo',
        rangeStartMs: NOW_MS,
        rangeEndMs: null,
        updatedAtMs: NOW_MS,
      })
    })

    expect(await harness.session.storage.listIndexByType('todo')).toEqual([])
  })
})

describe('antrean "due" - angka tidak dobel, id tidak hilang', () => {
  it('id yang sempat ada di dua daftar (proses berhenti di antara dua tulisan) dihitung sekali', async () => {
    quarantineAsDue(USER_A, [ID_A])
    // Keadaan sisa crash: id yang sama juga masih ada di daftar utama dengan umur baru.
    const main = JSON.parse(localStorage.getItem(QUARANTINE_STORAGE_KEY) ?? '{}') as {
      owners: Record<string, { atMs: number; ids: string[] }[]>
    }
    main.owners[USER_A]?.push({ atMs: Date.now(), ids: [ID_A] })
    localStorage.setItem(QUARANTINE_STORAGE_KEY, JSON.stringify(main))

    expect(listQuarantined(USER_A).map((entry) => entry.recordId)).toEqual([ID_A])
  })

  it('entri due yang masih gagal dibuka tetap terkarantina dan tetap dihitung tepat sekali', async () => {
    const harness = createHarness(provider, dataKey)
    // Record ada tetapi blob-nya tidak bisa dibuka dengan kunci sekarang.
    await harness.seed(ID_A, await sealTodo(provider, wrongKey, ID_A))
    quarantineAsDue(USER_A, [ID_A])

    expect(listQuarantined(USER_A)).toEqual([
      expect.objectContaining({ recordId: ID_A, isDue: true }),
    ])

    const first = await reindexQuarantined(harness.session, { dueOnly: true })
    const second = await reindexQuarantined(harness.session, { dueOnly: true })

    // Tidak ada data yang "pulih" secara palsu, dan tidak ada yang hilang dari hitungan.
    expect(first).toEqual({ recovered: 0, remaining: 1 })
    expect(second).toEqual({ recovered: 0, remaining: 1 })
    expect(listQuarantined(USER_A).map((entry) => entry.recordId)).toEqual([ID_A])
    expect(dueIds(USER_A)).toEqual([ID_A])
    expect(await harness.inRange(ID_A)).toBe(false)
  })

  it('antrean due yang gagal ditulis tidak membuat id hilang dari penyimpanan', async () => {
    const harness = createHarness(provider, dataKey)
    await harness.seed(ID_A, await sealTodo(provider, dataKey, ID_A))
    quarantineAsDue(USER_A, [ID_A])

    const backend = localStorage as Storage & { setItem: Storage['setItem'] }
    const original = backend.setItem.bind(backend)
    backend.setItem = (key: string, value: string): void => {
      if (key === QUARANTINE_DUE_STORAGE_KEY) throw new Error('kuota penuh')
      original(key, value)
    }

    try {
      listQuarantined(USER_A)
    } finally {
      backend.setItem = original
    }

    // Id TIDAK boleh lenyap dari dua-duanya: daftar utama masih memegangnya, jadi percobaan
    // berikutnya (setelah kuota lega) masih menemukannya.
    expect(localStorage.getItem(QUARANTINE_STORAGE_KEY) ?? '').toContain(ID_A)

    expect(listQuarantined(USER_A).map((entry) => entry.recordId)).toEqual([ID_A])
    expect((await reindexQuarantined(harness.session, { dueOnly: true })).recovered).toBe(1)
    expect(await harness.inRange(ID_A)).toBe(true)
    expect(listQuarantined(USER_A)).toEqual([])
  })
})
