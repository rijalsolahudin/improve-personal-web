// @vitest-environment node
//
// Jalur data lokal web: penulis record + repository di atas adaptor IndexedDB + kripto nyata.
//
// Yang diuji bukan "fungsi mengembalikan nilai", tapi janji yang dipakai fitur:
// data bertahan setelah reload, blob di disk benar-benar ciphertext, hapus jadi tombstone yang ikut
// terkirim, query rentang lewat index, dan record rusak/versi lebih baru DITOLAK - bukan jadi data kosong.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  buildRecordWrite,
  commitLocalWrite,
  createHlcGenerator,
  createManualClock,
  uuidV7Schema,
  type ManualClock,
  type RepositorySet,
  type SecureKeyMaterial,
  type Todo,
} from '@improve-personal/core'

import { createMasterKey, deriveDataKey } from '../crypto/master-key'
import { createSodiumCryptoProvider } from '../crypto/provider'
import { loadSodium } from '../crypto/sodium'
import { createWebKeyStore } from '../crypto/key-store'
import { saveDeviceUnlock, unlockMasterKeyWithDevice } from '../crypto/device-slot'
import { createIndexedDbStorage } from './indexeddb'
import { deleteRecord, updateRecord, writeRecord, type RecordWriterDeps } from './record-writer'
import { createRepositorySet } from './repository'

const START_MS = 1_700_000_000_000
const DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d1'

/**
 * Runtime test (node) tidak punya syarat browser yang diperiksa `openLocalDataSession`
 * (`isSecureContext`, `navigator.locks`). Dinyatakan di sini supaya yang diuji adalah jalur
 * baca-tulis record, bukan kelengkapan browser.
 */
Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })

let databaseCounter = 0

type Harness = RecordWriterDeps & {
  readonly clock: ManualClock
  readonly databaseName: string
  readonly repos: RepositorySet
}

/**
 * Harness: adaptor + kripto nyata + repository.
 *
 * `dataKey` bisa diteruskan supaya test "reload" benar-benar memakai kunci yang sama - instance baru
 * berarti adaptor/repository/HLC dibuat ulang, bukan berarti kuncinya berubah (kunci perangkat justru
 * yang membuat data lama tetap bisa dibuka).
 */
async function makeHarness(
  options: { databaseName?: string; dataKey?: SecureKeyMaterial } = {},
): Promise<Harness> {
  const sodium = await loadSodium()
  const clock = createManualClock(START_MS)
  const name = options.databaseName ?? `ip-repo-test-${(databaseCounter += 1)}`

  const storage = createIndexedDbStorage({
    clock,
    databaseName: name,
    runExclusive: (work) => work(),
  })
  const provider = await createSodiumCryptoProvider()
  const dataKey = options.dataKey ?? deriveDataKey(sodium, createMasterKey(sodium))
  const hlc = createHlcGenerator({ deviceId: DEVICE_ID, clock })

  return {
    storage,
    provider,
    dataKey,
    hlc,
    clock,
    databaseName: name,
    repos: createRepositorySet({ storage, provider, dataKey }),
  }
}

/** Payload `todo` yang sah menurut `todoSchema` di core. */
function todoPayload(id: string, overrides: Partial<Todo> = {}): Todo {
  return {
    id,
    title: 'Beli kopi',
    note: null,
    deadlineAt: null,
    priority: 'medium',
    isDone: false,
    completedAt: null,
    scheduleId: null,
    scheduleOccurrenceAt: null,
    createdAt: START_MS,
    updatedAt: START_MS,
    ...overrides,
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('penulis record + repository', () => {
  it('tulis lalu baca: payload utuh, id UUIDv7, dan blob di disk bukan plaintext', async () => {
    const harness = await makeHarness()

    const { id, hlc } = await writeRecord(harness, {
      type: 'todo',
      data: (recordId) => todoPayload(recordId, { title: 'Rahasia: jangan terbaca' }),
      index: { rangeStartMs: START_MS + 60_000, rangeEndMs: null },
    })

    expect(uuidV7Schema.safeParse(id).success).toBe(true)

    const record = await harness.repos.todo.getById(id)
    expect(record?.type).toBe('todo')
    expect(record?.hlc).toBe(hlc)
    expect((record?.data as Todo).title).toBe('Rahasia: jangan terbaca')

    // Yang benar-benar ada di disk: ciphertext. Kalau ini pernah lolos, seluruh klaim E2EE gugur.
    const stored = await harness.storage.getRecord(id)
    expect(stored?.blob).not.toContain('Rahasia')
    expect(() => JSON.parse(stored?.blob ?? '')).toThrow()

    // Dan barisnya sudah masuk antrean kirim - bukan cuma tersimpan lokal.
    const outbox = await harness.storage.listOutbox(10)
    expect(outbox).toHaveLength(1)
    expect(outbox[0]?.op).toBe('put')
    expect(outbox[0]?.recordId).toBe(id)
  })

  it('data bertahan setelah halaman dimuat ulang: kunci dibuka ulang dari perangkat, lalu record dibaca', async () => {
    const sodium = await loadSodium()
    const databaseName = `ip-repo-test-${(databaseCounter += 1)}`
    const keysDatabaseName = `ip-keys-test-${databaseCounter}`
    const masterKey = createMasterKey(sodium)

    // Sesi pertama: kunci utama disimpan lewat pembuka perangkat, lalu data ditulis.
    await saveDeviceUnlock(createWebKeyStore({ databaseName: keysDatabaseName }), masterKey)
    const first = await makeHarness({ databaseName, dataKey: deriveDataKey(sodium, masterKey) })

    const { id } = await writeRecord(first, {
      type: 'todo',
      data: (recordId) => todoPayload(recordId, { title: 'Tetap ada' }),
    })

    // Muat ulang: kunci utama TIDAK diketahui lagi - harus dibuka dari pembuka perangkat, persis
    // seperti aplikasi yang baru dibuka.
    const unlocked = await unlockMasterKeyWithDevice(
      createWebKeyStore({ databaseName: keysDatabaseName }),
    )
    const reopened = await makeHarness({
      databaseName,
      dataKey: deriveDataKey(sodium, unlocked),
    })

    const record = await reopened.repos.todo.getById(id)
    expect((record?.data as Todo | undefined)?.title).toBe('Tetap ada')
  })

  it('update: data berubah, hlc naik, dan perubahan ikut masuk antrean', async () => {
    const harness = await makeHarness()
    const { id, hlc: firstHlc } = await writeRecord(harness, {
      type: 'todo',
      data: (recordId) => todoPayload(recordId),
    })

    harness.clock.advance(1_000)
    const { hlc: secondHlc } = await updateRecord<Todo>(harness, {
      id,
      update: (record) => ({ ...record.data, isDone: true, completedAt: harness.clock.nowMs() }),
    })

    expect(secondHlc).not.toBe(firstHlc)
    const record = await harness.repos.todo.getById(id)
    expect((record?.data as Todo).isDone).toBe(true)
    expect(await harness.storage.countOutbox()).toBe(2)
  })

  it('hapus = tombstone: hilang dari getById, tetap ada di listAll, dan dikirim sebagai delete', async () => {
    const harness = await makeHarness()
    const { id } = await writeRecord(harness, {
      type: 'todo',
      data: (recordId) => todoPayload(recordId),
    })

    // Jam dimajukan sebelum hapus: `listOutbox` mengurutkan `queuedAtMs` naik lalu id sebagai
    // tie-break, jadi dengan waktu yang sama urutannya tidak bermakna.
    harness.clock.advance(1_000)
    await deleteRecord(harness, { id })

    expect(await harness.repos.todo.getById(id)).toBeNull()

    const all = await harness.repos.todo.listAll()
    expect(all.map((record) => record.id)).toEqual([id])
    expect(all[0]?.deleted).toBe(true)

    const outbox = await harness.storage.listOutbox(10)
    expect(outbox.map((row) => row.op)).toEqual(['put', 'delete'])
  })

  it('listByRange: hanya rentang yang beririsan, urut, hormati limit dan urutan turun', async () => {
    const harness = await makeHarness()

    const write = (deadlineAt: number, title: string) =>
      writeRecord(harness, {
        type: 'todo',
        data: (recordId) => todoPayload(recordId, { title, deadlineAt }),
        index: { rangeStartMs: deadlineAt, rangeEndMs: null },
      })

    await write(START_MS + 1_000, 'pagi')
    await write(START_MS + 5_000, 'siang')
    await write(START_MS + 9_000, 'malam')
    // Record tanpa deadline: rentangnya null, jadi TIDAK ikut query berentang - tapi tetap ada di listAll.
    await writeRecord(harness, {
      type: 'todo',
      data: (recordId) => todoPayload(recordId, { title: 'tanpa deadline' }),
    })

    const inRange = await harness.repos.todo.listByRange({
      fromMs: START_MS,
      toMs: START_MS + 2_000,
    })
    expect((inRange[0]?.data as Todo).title).toBe('pagi')
    expect(inRange).toHaveLength(1)

    const limited = await harness.repos.todo.listByRange({
      fromMs: START_MS,
      toMs: START_MS + 20_000,
      limit: 2,
    })
    expect(limited.map((record) => (record.data as Todo).title)).toEqual(['pagi', 'siang'])

    const descending = await harness.repos.todo.listByRange({
      fromMs: START_MS,
      toMs: START_MS + 20_000,
      order: 'desc',
    })
    expect(descending.map((record) => (record.data as Todo).title)).toEqual([
      'malam',
      'siang',
      'pagi',
    ])

    expect(await harness.repos.todo.listAll()).toHaveLength(4)
  })

  it('record tanpa dimensi waktu tetap ditemukan listAll (baris index selalu ditulis)', async () => {
    // Kalau baris index dilewati untuk entitas tanpa dimensi waktu, record-nya hilang dari `listAll` -
    // dan itu berarti hilang dari export.
    const harness = await makeHarness()
    const { id } = await writeRecord(harness, {
      type: 'todo',
      data: (recordId) => todoPayload(recordId, { title: 'tanpa waktu' }),
    })

    const entries = await harness.storage.listIndexByType('todo')
    expect(entries.map((entry) => entry.recordId)).toEqual([id])
    expect(entries[0]?.rangeStartMs).toBeNull()

    const all = await harness.repos.todo.listAll()
    expect(all.map((record) => record.id)).toEqual([id])
  })

  it('payload tidak sah ditolak saat dibaca, bukan jadi data kosong', async () => {
    const harness = await makeHarness()
    const { id } = await writeRecord(harness, {
      type: 'todo',
      data: (recordId) => todoPayload(recordId, { title: '' }),
    })

    await expect(harness.repos.todo.getById(id)).rejects.toThrow(/tidak sah/)
  })

  it('record dari app versi lebih baru ditolak dengan alasan yang jelas', async () => {
    const harness = await makeHarness()
    const id = '018f2c4e-0000-7000-8000-0000000000ff'

    // Ditulis langsung lewat storage: meniru data yang dibuat app versi lebih baru, yang belum tentu
    // dipahami build ini - dan menebaknya jauh lebih berbahaya daripada menolaknya.
    const blob = await harness.provider.sealRecord({
      recordId: id,
      dataKey: harness.dataKey,
      plaintext: JSON.stringify({ type: 'todo', schemaVersion: 99, data: todoPayload(id) }),
    })

    await commitLocalWrite({
      storage: harness.storage,
      write: buildRecordWrite({
        sealed: { id, hlc: '1700000000000-0-devicea', deleted: false, blob },
        index: {
          recordId: id,
          entityType: 'todo',
          rangeStartMs: null,
          rangeEndMs: null,
          updatedAtMs: START_MS,
        },
        op: 'put',
        outbox: { id: 'outbox-tes', queuedAtMs: START_MS },
      }),
    })

    await expect(harness.repos.todo.getById(id)).rejects.toThrow(/versi lebih baru/)
  })

  it('repository tipe lain menolak record bertipe beda', async () => {
    const harness = await makeHarness()
    const { id } = await writeRecord(harness, {
      type: 'todo',
      data: (recordId) => todoPayload(recordId),
    })

    await expect(harness.repos.countdown.getById(id)).rejects.toThrow(/bertipe/)
  })
})
