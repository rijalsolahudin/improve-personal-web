// @vitest-environment node
//
// Persistensi task: `Task` (UI) <-> record `todo` + `eisenhower_placement`, lewat sesi data lokal nyata
// (IndexedDB + kripto sungguhan).
//
// Yang diuji adalah hal-hal yang gampang rusak tanpa terlihat: field lama yang hilang saat menimpa,
// terjemahan kosakata kuadran, dan apakah data benar-benar bertahan setelah halaman dimuat ulang.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import { createManualClock, type ManualClock } from '@improve-personal/core'

import { openLocalDataSession, type LocalDataSession } from '../storage/session'
import type { Task } from '../tasks'
import {
  QUADRANT_FROM_CORE,
  QUADRANT_TO_CORE,
  loadTasks,
  persistTask,
  removeTask,
} from './persistence'

const START_MS = 1_700_000_000_000
/** Akun uji: penyimpanan lokal sekarang dipisah per akun (lihat `account-scope.test.ts`). */
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'

/**
 * Runtime test (node) tidak punya syarat browser yang diperiksa `openLocalDataSession`
 * (`isSecureContext`, `navigator.locks`). Dinyatakan di sini supaya yang diuji adalah pemetaan
 * task <-> record, bukan kelengkapan browser.
 */
Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })

let counter = 0

function names() {
  counter += 1
  return {
    databaseName: `ip-tasks-test-${counter}`,
    keysDatabaseName: `ip-tasks-test-keys-${counter}`,
  }
}

async function openSession(dbNames: ReturnType<typeof names>): Promise<OpenSession> {
  const clock = createManualClock(START_MS)
  const session = await openLocalDataSession({ userId: USER_ID, clock, ...dbNames })

  return { ...session, clock }
}

/**
 * Sesi + jamnya.
 *
 * Jam dikembalikan terpisah karena `LocalDataSession.clock` sengaja bertipe port `Clock`, yang tidak
 * punya `advance` - test butuh memajukan waktu (mis. untuk `completedAt`).
 */
type OpenSession = LocalDataSession & { readonly clock: ManualClock }

function task(session: LocalDataSession, overrides: Partial<Task> = {}): Task {
  return {
    id: session.newId(),
    title: 'Beli kopi',
    priority: 'medium',
    deadline: null,
    done: false,
    scheduleId: null,
    quadrant: null,
    position: 0,
    ...overrides,
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('persistensi task', () => {
  it('simpan lalu muat: task kembali utuh', async () => {
    const session = await openSession(names())
    const saved = task(session, {
      title: 'Kirim laporan',
      priority: 'urgent',
      deadline: START_MS + 3_600_000,
    })

    await persistTask(session, saved)

    expect(await loadTasks(session)).toEqual([saved])
  })

  it('data benar-benar bertahan setelah halaman dimuat ulang (sesi baru, database sama)', async () => {
    const dbNames = names()

    const first = await openSession(dbNames)
    const saved = task(first, { title: 'Tetap ada', deadline: START_MS + 1_000, quadrant: 'plan' })
    await persistTask(first, saved)

    // Sesi baru: kunci dibuka ulang dari perangkat, repository dibuat dari nol.
    const reopened = await openSession(dbNames)

    expect(await loadTasks(reopened)).toEqual([saved])
  })

  it('mengubah task TIDAK menghapus field yang UI belum punya, dan createdAt tidak ikut berubah', async () => {
    const session = await openSession(names())
    const original = task(session, { title: 'Baca buku' })

    // Ditulis langsung dengan catatan + waktu dibuat yang berbeda, meniru data dari fitur lain.
    await session.writer.write({
      id: original.id,
      type: 'todo',
      data: () => ({
        id: original.id,
        title: original.title,
        note: 'catatan penting jangan hilang',
        deadlineAt: null,
        priority: 'medium',
        isDone: false,
        completedAt: null,
        scheduleId: null,
        scheduleOccurrenceAt: null,
        createdAt: START_MS - 500_000,
        updatedAt: START_MS - 500_000,
      }),
      index: { rangeStartMs: null, rangeEndMs: null },
    })

    session.clock.advance(60_000)
    await persistTask(session, { ...original, priority: 'urgent' })

    const stored = await session.repos.todo.getById(original.id)
    const payload = stored?.data as Record<string, unknown>

    expect(payload.note).toBe('catatan penting jangan hilang')
    expect(payload.createdAt).toBe(START_MS - 500_000)
    expect(payload.updatedAt).toBe(START_MS + 60_000)
    expect(payload.priority).toBe('urgent')
  })

  it('selesai mengisi completedAt, dan membuka lagi menghapusnya', async () => {
    const session = await openSession(names())
    const saved = task(session)

    session.clock.advance(10_000)
    await persistTask(session, { ...saved, done: true })
    const done = (await session.repos.todo.getById(saved.id))?.data as Record<string, unknown>
    expect(done.completedAt).toBe(START_MS + 10_000)

    session.clock.advance(10_000)
    await persistTask(session, { ...saved, done: false })
    const reopened = (await session.repos.todo.getById(saved.id))?.data as Record<string, unknown>
    expect(reopened.completedAt).toBeNull()
  })

  it('kuadran diterjemahkan dua arah, dan dikeluarkan dari kuadran = penempatan dihapus', async () => {
    const session = await openSession(names())
    const saved = task(session)

    // Kosakata UI sengaja berbeda dari kosakata data: ini yang gampang salah tanpa test.
    expect(QUADRANT_TO_CORE).toEqual({
      do: 'do',
      plan: 'schedule',
      delegate: 'delegate',
      drop: 'delete',
    })
    expect(QUADRANT_FROM_CORE.schedule).toBe('plan')
    expect(QUADRANT_FROM_CORE.delete).toBe('drop')

    await persistTask(session, { ...saved, quadrant: 'plan' })
    const placements = await session.storage.listIndexByType('eisenhower_placement')
    expect(placements).toHaveLength(1)

    const storedPlacement = await session.storage.getRecord(placements[0]!.recordId)
    expect(
      await session.provider.openRecord({
        recordId: storedPlacement!.id,
        hlc: storedPlacement!.hlc,
        deleted: storedPlacement!.deleted,
        dataKey: session.dataKey,
        blob: storedPlacement!.blob,
      }),
    ).toContain('"quadrant":"schedule"')

    expect((await loadTasks(session))[0]?.quadrant).toBe('plan')

    // Pindah kuadran: tetap satu penempatan, bukan menumpuk baris baru.
    await persistTask(session, { ...saved, quadrant: 'drop' })
    expect(await session.storage.listIndexByType('eisenhower_placement')).toHaveLength(1)
    expect((await loadTasks(session))[0]?.quadrant).toBe('drop')

    // Dikeluarkan dari kuadran: penempatannya hilang, bukan tertinggal.
    await persistTask(session, { ...saved, quadrant: null })
    expect(await loadTasks(session)).toEqual([{ ...saved, quadrant: null }])
  })

  it('posisi di dalam kuadran ikut tersimpan', async () => {
    const session = await openSession(names())
    const first = task(session, { title: 'A', quadrant: 'do', position: 0 })
    const second = task(session, { title: 'B', quadrant: 'do', position: 1 })

    await persistTask(session, first)
    await persistTask(session, second)

    const loaded = await loadTasks(session)
    expect(loaded.find((item) => item.id === first.id)?.position).toBe(0)
    expect(loaded.find((item) => item.id === second.id)?.position).toBe(1)
  })

  it('hapus task ikut menghapus penempatannya', async () => {
    const dbNames = names()
    const session = await openSession(dbNames)
    const saved = task(session, { quadrant: 'delegate' })

    await persistTask(session, saved)
    await removeTask(session, saved.id)

    expect(await loadTasks(session)).toEqual([])

    // Sesi baru: penempatan lama tidak boleh "menghidupkan" task atau kuadrannya lagi.
    const reopened = await openSession(dbNames)
    expect(await loadTasks(reopened)).toEqual([])
  })
})
