import { beforeEach, describe, expect, it } from 'vitest'

import { pointIndex, spanIndex, type EntityType } from '../domain/envelope.ts'
import type { RecordWrite, StorageAdapter, StoredSyncState } from '../ports.ts'
import { createManualClock, type ManualClock } from './clock.ts'

/**
 * Suite kontrak `StorageAdapter` (ARCHITECTURE.md §5, AC T23).
 *
 * Satu suite, dijalankan ke tiap adapter: memori (test), IndexedDB (web), SQLite (mobile). Kalau
 * salah satu adapter menyimpang dari kontrak ini, dia gagal di test yang sama - bukan ketahuan
 * belakangan saat kalender desktop dan HP menampilkan hasil berbeda.
 *
 * Yang diuji di sini adalah **kontrak**: atomisitas transaksi, bentuk data yang ditulis, urutan
 * outbox, semantik query rentang lewat index, dan status yang dibaca UI. Yang TIDAK bisa diuji
 * (properti backend, bukan kontrak) tetap wajib diuji di adapter masing-masing:
 * durability `strict`/`FULL`, lock satu-penulis antar tab, dan perilaku saat proses mati mendadak.
 */

/** Factory adapter. Jam di-inject supaya `created_at`/`updated_at` deterministik di semua adapter. */
export type StorageAdapterContractFactory = (
  clock: ManualClock,
) => StorageAdapter | Promise<StorageAdapter>

const START_MS = 1_700_000_000_000

/** UUIDv7-ish yang valid untuk test - tidak diacak supaya kegagalan bisa direproduksi. */
function id(n: number): string {
  return `018f2c4e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

function hlcOf(n: number, deviceId = 'devicea'): string {
  return `${START_MS + n}-0-${deviceId}`
}

function write(input: {
  readonly id: string
  readonly hlc: string
  readonly deleted?: boolean
  readonly blob?: string
  readonly index?: RecordWrite['index']
  readonly op?: RecordWrite['op']
  readonly outboxId?: string
  readonly queuedAtMs?: number
}): RecordWrite {
  return {
    sealed: {
      id: input.id,
      hlc: input.hlc,
      deleted: input.deleted ?? false,
      blob: input.blob ?? `blob-${input.id}`,
    },
    index: input.index === undefined ? null : input.index,
    op: input.op ?? (input.deleted === true ? 'delete' : 'put'),
    outbox: {
      id: input.outboxId ?? `outbox-${input.id}`,
      queuedAtMs: input.queuedAtMs ?? START_MS,
    },
  }
}

function rangeIndex(
  recordId: string,
  type: EntityType,
  fromMs: number,
  toMs: number | null,
): RecordWrite['index'] {
  return toMs === null
    ? pointIndex(recordId, type, fromMs, START_MS)
    : spanIndex(recordId, type, fromMs, toMs, START_MS)
}

export function runStorageAdapterContractTests(
  label: string,
  factory: StorageAdapterContractFactory,
): void {
  describe(`StorageAdapter contract (${label})`, () => {
    let clock: ManualClock
    let storage: StorageAdapter

    beforeEach(async () => {
      clock = createManualClock(START_MS)
      storage = await factory(clock)
    })

    describe('transaksi', () => {
      it('commit: semua tulisan di dalam transaksi jadi satu kesatuan', async () => {
        await storage.runTransaction('contract.write', async (tx) => {
          await tx.putRecord(
            write({ id: id(1), hlc: hlcOf(1), index: rangeIndex(id(1), 'todo', START_MS, null) }),
          )
          await tx.patchSyncState({ cursor: 7, status: 'pending' })
        })

        const record = await storage.getRecord(id(1))
        expect(record?.hlc).toBe(hlcOf(1))
        expect(await storage.countOutbox()).toBe(1)

        const state = await storage.getSyncState()
        expect(state?.cursor).toBe(7)
        expect(state?.status).toBe('pending')
      })

      it('rollback: tidak ada satu pun tulisan yang tersisa kalau fn melempar error', async () => {
        await storage.runTransaction('contract.seed', async (tx) => {
          await tx.putRecord(write({ id: id(1), hlc: hlcOf(1) }))
          await tx.patchSyncState({ cursor: 3, status: 'synced' })
        })

        await expect(
          storage.runTransaction('contract.fail', async (tx) => {
            await tx.putRecord(write({ id: id(2), hlc: hlcOf(2) }))
            await tx.putRecord(write({ id: id(1), hlc: hlcOf(9), blob: 'menimpa' }))
            await tx.patchSyncState({ cursor: 99 })
            throw new Error('gagal di tengah transaksi')
          }),
        ).rejects.toThrow('gagal di tengah transaksi')

        expect(await storage.getRecord(id(2))).toBeNull()
        expect((await storage.getRecord(id(1)))?.hlc).toBe(hlcOf(1))
        expect(await storage.countOutbox()).toBe(1)

        const state = await storage.getSyncState()
        expect(state?.cursor).toBe(3)
      })

      it('fn boleh dijalankan ulang adapter: percobaan gagal tidak meninggalkan sisa', async () => {
        let attempts = 0

        await expect(
          storage.runTransaction('contract.retry', async (tx) => {
            attempts += 1
            await tx.putRecord(write({ id: id(3), hlc: hlcOf(3) }))
            if (attempts === 1) throw new Error('retryable')
          }),
        ).rejects.toThrow('retryable')

        expect(attempts).toBe(1)
        expect(await storage.getRecord(id(3))).toBeNull()
        expect(await storage.countOutbox()).toBe(0)
      })
    })

    describe('record + index', () => {
      it('menyimpan envelope apa adanya dan pembukuan waktu lokal', async () => {
        await storage.runTransaction('contract.write', async (tx) => {
          await tx.putRecord(
            write({
              id: id(4),
              hlc: hlcOf(4),
              blob: 'ciphertext',
              index: rangeIndex(id(4), 'schedule', START_MS, START_MS + 3_600_000),
            }),
          )
        })

        const record = await storage.getRecord(id(4))
        expect(record).not.toBeNull()
        expect(record?.id).toBe(id(4))
        expect(record?.deleted).toBe(false)
        expect(record?.blob).toBe('ciphertext')
        expect(record?.createdAtMs).toBe(clock.nowMs())
        expect(record?.updatedAtMs).toBe(START_MS)
      })

      it('adapter tidak menerapkan LWW: record yang ditulis tetap apa adanya', async () => {
        await storage.runTransaction('contract.write', async (tx) => {
          await tx.putRecord(write({ id: id(5), hlc: hlcOf(50) }))
        })
        await storage.runTransaction('contract.write', async (tx) => {
          await tx.putRecord(write({ id: id(5), hlc: hlcOf(10), blob: 'lebih tua' }))
        })

        const record = await storage.getRecord(id(5))
        expect(record?.hlc).toBe(hlcOf(10))
        expect(record?.blob).toBe('lebih tua')
      })

      it('tombstone disimpan sebagai record biasa dengan deleted = true', async () => {
        await storage.runTransaction('contract.write', async (tx) => {
          await tx.putRecord(write({ id: id(6), hlc: hlcOf(6), deleted: true, op: 'delete' }))
        })

        expect((await storage.getRecord(id(6)))?.deleted).toBe(true)
        const outbox = await storage.listOutbox(10)
        expect(outbox[0]?.op).toBe('delete')
      })

      it('getRecord mengembalikan null untuk id yang tidak ada', async () => {
        expect(await storage.getRecord(id(99))).toBeNull()
      })

      it('getRecords melewati id yang tidak ada dan tidak menggandakan id', async () => {
        await storage.runTransaction('contract.write', async (tx) => {
          await tx.putRecord(write({ id: id(7), hlc: hlcOf(7) }))
          await tx.putRecord(write({ id: id(8), hlc: hlcOf(8) }))
        })

        const records = await storage.getRecords([id(7), id(8), id(7), id(99)])
        expect(records.map((record) => record.id).sort()).toEqual([id(7), id(8)])
      })

      it('hasil baca adalah salinan: memutasi hasil tidak mengubah isi storage', async () => {
        await storage.runTransaction('contract.write', async (tx) => {
          await tx.putRecord(write({ id: id(9), hlc: hlcOf(9) }))
        })

        const first = await storage.getRecord(id(9))
        expect(first).not.toBeNull()
        if (first !== null) (first as { hlc: string }).hlc = 'dirusak'

        expect((await storage.getRecord(id(9)))?.hlc).toBe(hlcOf(9))
      })

      it('putRecord dengan index null membuang baris index lama', async () => {
        await storage.runTransaction('contract.write', async (tx) => {
          await tx.putRecord(
            write({
              id: id(10),
              hlc: hlcOf(10),
              index: rangeIndex(id(10), 'todo', START_MS, null),
            }),
          )
        })
        expect(await storage.listIndexByType('todo')).toHaveLength(1)

        await storage.runTransaction('contract.write', async (tx) => {
          await tx.putRecord(write({ id: id(10), hlc: hlcOf(11), index: null }))
        })
        expect(await storage.listIndexByType('todo')).toHaveLength(0)
      })
    })

    describe('outbox', () => {
      it('listOutbox urut queued_at naik dan menghormati limit', async () => {
        await storage.runTransaction('contract.write', async (tx) => {
          await tx.putRecord(
            write({ id: id(11), hlc: hlcOf(11), outboxId: 'o-b', queuedAtMs: 200 }),
          )
          await tx.putRecord(
            write({ id: id(12), hlc: hlcOf(12), outboxId: 'o-a', queuedAtMs: 100 }),
          )
          await tx.putRecord(
            write({ id: id(13), hlc: hlcOf(13), outboxId: 'o-c', queuedAtMs: 300 }),
          )
        })

        const rows = await storage.listOutbox(2)
        expect(rows.map((row) => row.id)).toEqual(['o-a', 'o-b'])
        expect(rows[0]?.attempts).toBe(0)
        expect(rows[0]?.lastError).toBeNull()
        expect(rows[0]?.recordId).toBe(id(12))
      })

      it('markOutboxFailure menaikkan attempts dan menyimpan pesan generik', async () => {
        await storage.runTransaction('contract.write', async (tx) => {
          await tx.putRecord(write({ id: id(14), hlc: hlcOf(14) }))
        })

        const [row] = await storage.listOutbox(1)
        expect(row).toBeDefined()
        if (row === undefined) return

        await storage.markOutboxFailure(row.id, { lastError: 'HTTP 401' })
        await storage.markOutboxFailure(row.id, { lastError: 'REJECTED' })

        const [updated] = await storage.listOutbox(1)
        expect(updated?.attempts).toBe(2)
        expect(updated?.lastError).toBe('REJECTED')
      })

      it('markOutboxFailure untuk id tak dikenal tidak melempar error', async () => {
        await expect(
          storage.markOutboxFailure('tidak-ada', { lastError: 'REJECTED' }),
        ).resolves.toBeUndefined()
      })

      it('deleteOutboxRows membuang baris yang diminta saja', async () => {
        await storage.runTransaction('contract.write', async (tx) => {
          await tx.putRecord(write({ id: id(15), hlc: hlcOf(15), outboxId: 'o-1' }))
          await tx.putRecord(write({ id: id(16), hlc: hlcOf(16), outboxId: 'o-2' }))
        })

        await storage.deleteOutboxRows(['o-1'])
        expect(await storage.countOutbox()).toBe(1)
        expect((await storage.listOutbox(5))[0]?.id).toBe('o-2')

        await storage.deleteOutboxRows(['o-2', 'tidak-ada'])
        expect(await storage.countOutbox()).toBe(0)
      })

      it('commit konkuren diselesaikan serial: commit terakhir yang menang', async () => {
        const first = storage.runTransaction('contract.write', async (tx) => {
          await tx.putRecord(write({ id: id(17), hlc: hlcOf(17), blob: 'pertama' }))
        })
        const second = storage.runTransaction('contract.write', async (tx) => {
          await tx.putRecord(write({ id: id(17), hlc: hlcOf(18), blob: 'kedua' }))
        })

        await Promise.all([first, second])

        const record = await storage.getRecord(id(17))
        expect(record?.hlc).toBe(hlcOf(18))
        expect(record?.blob).toBe('kedua')
      })
    })

    describe('query rentang lewat index', () => {
      beforeEach(async () => {
        await storage.runTransaction('contract.seed', async (tx) => {
          await tx.putRecord(
            write({
              id: id(20),
              hlc: hlcOf(20),
              index: rangeIndex(id(20), 'todo', START_MS + 1_000, null),
            }),
          )
          await tx.putRecord(
            write({
              id: id(21),
              hlc: hlcOf(21),
              index: rangeIndex(id(21), 'todo', START_MS + 5_000, null),
            }),
          )
          await tx.putRecord(
            write({
              id: id(22),
              hlc: hlcOf(22),
              index: rangeIndex(id(22), 'schedule', START_MS, START_MS + 10_000),
            }),
          )
          await tx.putRecord(
            write({
              id: id(23),
              hlc: hlcOf(23),
              deleted: true,
              index: rangeIndex(id(23), 'todo', START_MS + 2_000, null),
            }),
          )
        })
      })

      it('memilih record yang rentangnya beririsan dan mengabaikan tipe lain', async () => {
        const todos = await storage.queryByRange({
          entityTypes: ['todo'],
          fromMs: START_MS,
          toMs: START_MS + 2_000,
        })
        expect(todos.map((record) => record.id)).toEqual([id(20)])

        const schedules = await storage.queryByRange({
          entityTypes: ['schedule'],
          fromMs: START_MS + 9_000,
          toMs: START_MS + 11_000,
        })
        expect(schedules.map((record) => record.id)).toEqual([id(22)])
      })

      it('tombstone tidak ikut kecuali includeDeleted', async () => {
        const visible = await storage.queryByRange({
          entityTypes: ['todo'],
          fromMs: 0,
          toMs: START_MS + 3_000,
        })
        expect(visible.map((record) => record.id)).toEqual([id(20)])

        const withDeleted = await storage.queryByRange({
          entityTypes: ['todo'],
          fromMs: 0,
          toMs: START_MS + 3_000,
          includeDeleted: true,
        })
        expect(withDeleted.map((record) => record.id)).toEqual([id(20), id(23)])
      })

      it('hasil urut naik berdasarkan range_start dan menghormati limit', async () => {
        const all = await storage.queryByRange({
          entityTypes: ['todo'],
          fromMs: 0,
          toMs: START_MS + 9_000,
        })
        expect(all.map((record) => record.id)).toEqual([id(20), id(21)])

        const limited = await storage.queryByRange({
          entityTypes: ['todo'],
          fromMs: 0,
          toMs: START_MS + 9_000,
          limit: 1,
        })
        expect(limited.map((record) => record.id)).toEqual([id(20)])
      })

      it('entityTypes kosong berarti semua tipe', async () => {
        const all = await storage.queryByRange({
          entityTypes: [],
          fromMs: 0,
          toMs: START_MS + 9_000,
        })
        expect(all.map((record) => record.id).sort()).toEqual([id(20), id(21), id(22)])
      })

      it('rentang terbalik menghasilkan hasil kosong, bukan error', async () => {
        const result = await storage.queryByRange({
          entityTypes: ['todo'],
          fromMs: START_MS + 9_000,
          toMs: START_MS,
        })
        expect(result).toEqual([])
      })

      it('query tanpa tipe dan tanpa rentang ditolak (scan penuh dilarang)', async () => {
        await expect(storage.queryByRange({})).rejects.toThrow()
      })

      it('listIndexByType hanya mengembalikan tipe yang diminta', async () => {
        const todos = await storage.listIndexByType('todo')
        expect(todos.map((entry) => entry.recordId)).toEqual([id(20), id(23), id(21)])
        expect(todos.every((entry) => entry.entityType === 'todo')).toBe(true)
        expect(await storage.listIndexByType('goal')).toEqual([])
      })
    })

    describe('sync_state', () => {
      it('null sebelum inisialisasi, lalu round-trip penuh', async () => {
        expect(await storage.getSyncState()).toBeNull()

        const state: StoredSyncState = {
          deviceId: 'devicea',
          cursor: 42,
          status: 'offline',
          lastPullAtMs: null,
          lastPushAtMs: START_MS,
        }
        await storage.putSyncState(state)

        expect(await storage.getSyncState()).toEqual(state)
      })

      it('patchSyncState hanya mengubah field yang dikirim', async () => {
        await storage.putSyncState({
          deviceId: 'devicea',
          cursor: 10,
          status: 'synced',
          lastPullAtMs: START_MS,
          lastPushAtMs: START_MS,
        })

        await storage.runTransaction('contract.state', async (tx) => {
          await tx.patchSyncState({ cursor: 0, lastPullAtMs: null })
        })

        const state = await storage.getSyncState()
        expect(state).toEqual({
          deviceId: 'devicea',
          cursor: 0,
          status: 'synced',
          lastPullAtMs: null,
          lastPushAtMs: START_MS,
        })
      })

      it('patchSyncState boleh jadi penulis pertama sync_state', async () => {
        await storage.runTransaction('contract.state', async (tx) => {
          await tx.patchSyncState({ deviceId: 'deviceb', status: 'pending' })
        })

        const state = await storage.getSyncState()
        expect(state?.deviceId).toBe('deviceb')
        expect(state?.cursor).toBe(0)
        expect(state?.status).toBe('pending')
      })
    })

    describe('metadata kunci & sticker', () => {
      it('local_key_meta: satu baris per slot, bisa ditimpa, lalu dihapus', async () => {
        expect(await storage.getKeyMeta('device')).toBeNull()

        await storage.putKeyMeta({
          id: id(30),
          slot: 'device',
          kdfHint: 'biometric',
          createdAtMs: START_MS,
          lastUsedAtMs: null,
        })
        await storage.putKeyMeta({
          id: id(31),
          slot: 'device',
          kdfHint: 'webauthn',
          createdAtMs: START_MS + 1,
          lastUsedAtMs: START_MS + 1,
        })
        await storage.putKeyMeta({
          id: id(32),
          slot: 'recovery',
          kdfHint: 'argon2id',
          createdAtMs: START_MS,
          lastUsedAtMs: null,
        })

        expect((await storage.getKeyMeta('device'))?.kdfHint).toBe('webauthn')
        expect((await storage.getKeyMeta('recovery'))?.id).toBe(id(32))

        await storage.deleteKeyMeta('device')
        expect(await storage.getKeyMeta('device')).toBeNull()
        expect((await storage.getKeyMeta('recovery'))?.id).toBe(id(32))
      })

      it('sticker_recent: terbaru dulu, limit dihormati', async () => {
        await storage.putRecentSticker({ stickerId: 's-1', usedAtMs: START_MS })
        await storage.putRecentSticker({ stickerId: 's-2', usedAtMs: START_MS + 5_000 })
        await storage.putRecentSticker({ stickerId: 's-3', usedAtMs: START_MS + 1_000 })

        expect((await storage.listRecentStickers(10)).map((entry) => entry.stickerId)).toEqual([
          's-2',
          's-3',
          's-1',
        ])
        expect((await storage.listRecentStickers(1)).map((entry) => entry.stickerId)).toEqual([
          's-2',
        ])
      })
    })

    describe('wipe', () => {
      it('menghapus record, index, outbox, sync_state, kunci, dan sticker', async () => {
        await storage.runTransaction('contract.seed', async (tx) => {
          await tx.putRecord(
            write({
              id: id(40),
              hlc: hlcOf(40),
              index: rangeIndex(id(40), 'todo', START_MS, null),
            }),
          )
          await tx.patchSyncState({ deviceId: 'devicea', cursor: 5, status: 'synced' })
        })
        await storage.putKeyMeta({
          id: id(41),
          slot: 'device',
          kdfHint: 'biometric',
          createdAtMs: START_MS,
          lastUsedAtMs: null,
        })
        await storage.putRecentSticker({ stickerId: 's-9', usedAtMs: START_MS })

        await storage.wipe()

        expect(await storage.getRecord(id(40))).toBeNull()
        expect(await storage.listIndexByType('todo')).toEqual([])
        expect(await storage.countOutbox()).toBe(0)
        expect(await storage.getSyncState()).toBeNull()
        expect(await storage.getKeyMeta('device')).toBeNull()
        expect(await storage.listRecentStickers(5)).toEqual([])
      })
    })
  })
}
