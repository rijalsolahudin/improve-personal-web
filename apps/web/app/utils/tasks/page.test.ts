// @vitest-environment node
//
// Jalur baca To-do berjendela (#138): filter/urut/hitung dari `record_index` ber-flag, dekripsi hanya
// untuk halaman yang tampil. Baris index lama (tanpa flag) di-backfill sekali.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createHlcGenerator,
  createManualClock,
  type RecordIndexEntry,
} from '@improve-personal/core'

import { createMasterKey, deriveDataKey } from '~/utils/crypto/master-key'
import { createSodiumCryptoProvider } from '~/utils/crypto/provider'
import { loadSodium } from '~/utils/crypto/sodium'
import { createIndexedDbStorage } from '~/utils/storage/indexeddb'
import { writeRecord } from '~/utils/storage/record-writer'
import type { LocalDataSession } from '~/utils/storage/session'
import { todoFlagsOf } from '~/utils/tasks/flags'
import {
  BACKFILL_CHUNK,
  countTodoEntries,
  loadTodoIndex,
  loadTodoPage,
  matchesTodoEntry,
  selectTodoIds,
  type TodoIndexEntry,
} from '~/utils/tasks/page'

const NOW = new Date(2026, 9, 30, 10, 0, 0).getTime()
const DAY = 86_400_000
const USER_ID = '018f2c4e-0000-7000-8000-0000000000aa'
const DEVICE_ID = '018f2c4e-0000-7000-8000-0000000000d1'

let counter = 0

function entry(id: string, overrides: Partial<TodoIndexEntry> = {}): TodoIndexEntry {
  return {
    recordId: id,
    entityType: 'todo',
    rangeStartMs: null,
    rangeEndMs: null,
    updatedAtMs: NOW,
    doneRank: 0,
    priorityRank: 1,
    ...overrides,
  }
}

describe('flag index todo', () => {
  it('memetakan selesai + prioritas ke peringkat angka', () => {
    expect(todoFlagsOf('todo', { isDone: true, priority: 'urgent' })).toEqual({
      doneRank: 1,
      priorityRank: 0,
    })
    expect(todoFlagsOf('todo', { isDone: false, priority: 'low' })).toEqual({
      doneRank: 0,
      priorityRank: 2,
    })
    // Entitas lain tidak punya flag.
    expect(todoFlagsOf('goal', { isDone: true })).toEqual({})
  })
})

describe('filter & urut dari baris index', () => {
  const late = entry('late', { rangeStartMs: NOW - DAY })
  const today = entry('today', { rangeStartMs: NOW + 3_600_000 })
  const tomorrow = entry('tomorrow', { rangeStartMs: NOW + DAY })
  const noDeadline = entry('no-deadline', { priorityRank: 0 })
  const done = entry('done', { doneRank: 1, rangeStartMs: NOW - 2 * DAY })

  it('setiap filter memakai status selesai + deadline tanpa dekripsi', () => {
    expect(matchesTodoEntry(late, 'terlambat', NOW)).toBe(true)
    expect(matchesTodoEntry(today, 'terlambat', NOW)).toBe(false)
    expect(matchesTodoEntry(today, 'hari', NOW)).toBe(true)
    expect(matchesTodoEntry(tomorrow, 'hari', NOW)).toBe(false)
    expect(matchesTodoEntry(tomorrow, 'mendatang', NOW)).toBe(true)
    expect(matchesTodoEntry(noDeadline, 'mendatang', NOW)).toBe(false)
    expect(matchesTodoEntry(done, 'semua', NOW)).toBe(false)
    expect(matchesTodoEntry(done, 'selesai', NOW)).toBe(true)
  })

  it('deadline kosong selalu di bawah; prioritas mendahulukan urgent', () => {
    const entries = [noDeadline, tomorrow, late, today]

    expect(selectTodoIds(entries, { filter: 'semua', sort: 'deadline', nowMs: NOW })).toEqual([
      'late',
      'today',
      'tomorrow',
      'no-deadline',
    ])
    expect(selectTodoIds(entries, { filter: 'semua', sort: 'prioritas', nowMs: NOW })[0]).toBe(
      'no-deadline',
    )
  })

  it('offset/limit mengambil satu halaman saja', () => {
    const entries = Array.from({ length: 150 }, (_, index) =>
      entry(`task-${index}`, { rangeStartMs: NOW + index * 1000 }),
    )

    const ids = selectTodoIds(entries, {
      filter: 'semua',
      sort: 'deadline',
      nowMs: NOW,
      offset: 100,
      limit: 100,
    })

    expect(ids).toHaveLength(50)
    expect(ids[0]).toBe('task-100')
  })

  it('hitungan chip memakai aturan filter yang sama', () => {
    const counts = countTodoEntries([late, today, tomorrow, noDeadline, done], NOW)

    // `mendatang` = deadline > sekarang, jadi task "hari ini" yang belum lewat ikut terhitung -
    // sama dengan `matchesFilter` di UI.
    expect(counts).toEqual({ semua: 4, hari: 1, mendatang: 2, terlambat: 1, selesai: 1 })
  })
})

describe('backfill baris index lama', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
  })

  async function openSession(): Promise<LocalDataSession> {
    const clock = createManualClock(NOW)
    const storage = createIndexedDbStorage({ clock, databaseName: `ip-page-${(counter += 1)}` })
    const provider = await createSodiumCryptoProvider()
    const sodium = await loadSodium()
    const dataKey = deriveDataKey(sodium, createMasterKey(sodium), USER_ID)
    const hlc = createHlcGenerator({ deviceId: DEVICE_ID, clock })

    return { storage, provider, dataKey, hlc, clock } as unknown as LocalDataSession
  }

  async function seed(
    session: LocalDataSession,
    overrides: { isDone?: boolean; priority?: string; deadlineAt?: number | null } = {},
  ): Promise<string> {
    const { id } = await writeRecord(
      {
        storage: session.storage,
        provider: session.provider,
        dataKey: session.dataKey,
        hlc: session.hlc,
        clock: session.clock,
      },
      {
        type: 'todo',
        data: (recordId) => ({
          id: recordId,
          title: `Task ${recordId}`,
          note: null,
          deadlineAt: overrides.deadlineAt ?? null,
          priority: overrides.priority ?? 'medium',
          isDone: overrides.isDone ?? false,
          completedAt: null,
          scheduleId: null,
          scheduleOccurrenceAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        }),
        index: { rangeStartMs: overrides.deadlineAt ?? null, rangeEndMs: null },
      },
    )

    return id
  }

  /** Baris index dibuat ulang tanpa flag - mensimulasikan database sebelum #138. */
  async function stripFlags(session: LocalDataSession, id: string): Promise<void> {
    const rows = await session.storage.listIndexByType('todo')
    const row = rows.find((candidate) => candidate.recordId === id)
    expect(row).toBeDefined()
    const legacy: RecordIndexEntry = {
      recordId: row!.recordId,
      entityType: row!.entityType,
      rangeStartMs: row!.rangeStartMs,
      rangeEndMs: row!.rangeEndMs,
      updatedAtMs: row!.updatedAtMs,
    }
    await session.storage.runTransaction('test.stripFlags', async (tx) => {
      await tx.putRecordIndex(id, legacy)
    })
  }

  it('mengisi flag dari record dan tidak mengulang dekripsi setelahnya', async () => {
    const session = await openSession()
    const doneId = await seed(session, { isDone: true, priority: 'urgent' })
    const openId = await seed(session, { priority: 'low', deadlineAt: NOW + DAY })
    await stripFlags(session, doneId)
    await stripFlags(session, openId)

    const filled = await loadTodoIndex(session)
    const byId = new Map(filled.map((item) => [item.recordId, item]))

    expect(byId.get(doneId)).toMatchObject({ doneRank: 1, priorityRank: 0 })
    expect(byId.get(openId)).toMatchObject({ doneRank: 0, priorityRank: 2 })

    // Panggilan kedua membaca flag yang sudah tersimpan (tidak ada baris tanpa flag).
    expect(await loadTodoIndex(session)).toEqual(filled)
  })

  it('backfill dipecah per chunk dan melaporkan progres', async () => {
    const session = await openSession()
    const ids: string[] = []
    for (let index = 0; index < BACKFILL_CHUNK + 40; index += 1) {
      ids.push(await seed(session, { deadlineAt: NOW + index * 1000 }))
    }
    for (const id of ids) await stripFlags(session, id)

    const progress: Array<[number, number]> = []
    const filled = await loadTodoIndex(session, {
      onProgress: (done, total) => progress.push([done, total]),
    })

    expect(filled).toHaveLength(BACKFILL_CHUNK + 40)
    expect(progress[0]).toEqual([0, BACKFILL_CHUNK + 40])
    expect(progress.at(-1)).toEqual([BACKFILL_CHUNK + 40, BACKFILL_CHUNK + 40])
    // Lebih dari satu putaran: chunk pertama selesai sebelum sisanya.
    expect(progress.some(([done]) => done === BACKFILL_CHUNK)).toBe(true)
  })

  it('halaman hanya mendekripsi baris yang diminta', async () => {
    const session = await openSession()
    const ids: string[] = []
    for (let index = 0; index < 12; index += 1) {
      ids.push(await seed(session, { deadlineAt: NOW + index * 1000 }))
    }

    const page = await loadTodoPage(session, {
      filter: 'semua',
      sort: 'deadline',
      nowMs: NOW,
      limit: 5,
    })

    expect(page.tasks.map((task) => task.id)).toEqual(ids.slice(0, 5))
    expect(page.counts.semua).toBe(12)
  })
})
