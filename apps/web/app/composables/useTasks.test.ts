import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'

import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { loadTasks, persistTask } from '~/utils/tasks/persistence'
import type { Task } from '~/utils/tasks'
import { emptyTaskDraft } from '~/utils/tasks'
import type { LocalDataSession } from '~/utils/storage/session'

import { useTasks, resetTasksHydrationForTest } from './useTasks'

const START_MS = 1_700_000_000_000
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }

/**
 * Kripto tiruan untuk test composable.
 *
 * Jalur kripto sungguhan sudah diuji di `persistence.test.ts` (node + IndexedDB + libsodium); di sini
 * yang diuji adalah WIRING-nya (hydrate, urutan state, persist di belakang layar), jadi ciphertext
 * tidak perlu asli. Sengaja tidak memakai IndexedDB: environment `nuxt` tidak punya.
 */
const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

/** Sesi data lokal palsu di atas adaptor memori core - semua port lain nyata. */
function memorySession(): LocalDataSession {
  const clock = createManualClock(START_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: '018f2c4e-0000-7000-8000-0000000000d1', clock })

  return {
    storage,
    provider: fakeProvider,
    clock,
    dataKey: DATA_KEY,
    hlc,
    deviceId: '018f2c4e-0000-7000-8000-0000000000d1',
    userId: '018f2c4e-0000-7000-8000-00000000000a',
    isFreshKey: true,
    // Test ini tidak menyentuh kunci: penyimpanan kunci cukup memenuhi kontrak sesi.
    keyStore: {
      has: async () => false,
      put: async () => undefined,
      get: async () => null,
      remove: async () => undefined,
    },
    newId: createUuidV7Generator({ clock }),
    // Test ini tidak pernah membuat envelope kunci; `withMasterKey` disediakan supaya bentuknya sesuai
    // kontrak sesi. Implementasi aslinya diuji di `session.test.ts`.
    withMasterKey: async (work) => work(new Uint8Array(32)),
    repos: createRepositorySet({ storage, provider: fakeProvider, dataKey: DATA_KEY }),
    writer: createRecordWriter({ storage, provider: fakeProvider, dataKey: DATA_KEY, hlc, clock }),
  }
}

function taskOf(session: LocalDataSession, id: string, title: string): Task {
  return {
    id,
    title,
    priority: 'medium',
    deadline: null,
    done: false,
    scheduleId: null,
    quadrant: null,
    position: 0,
  }
}

beforeEach(() => {
  clearNuxtState(['tasks', 'tasksStatus', 'tasksError', 'localData'])
  resetTasksHydrationForTest()
})

describe('useTasks', () => {
  it('tambah cepat, centang, kuadran, hapus - state lokal langsung berubah', async () => {
    const session = memorySession()
    const { tasks, add, toggle, setQuadrant, remove, findTask, hydrate } = useTasks({
      session: async () => session,
    })
    await hydrate()

    expect(add('  ', 'low', null)).toBeNull()

    const id = add('Bayar listrik', 'urgent', null)
    expect(id).toEqual(expect.any(String))
    expect(tasks.value).toHaveLength(1)

    toggle(id!)
    setQuadrant(id!, 'delegate')
    expect(findTask(id!)).toMatchObject({ done: true, quadrant: 'delegate' })

    remove(id!)
    expect(findTask(id!)).toBeUndefined()
    expect(tasks.value).toEqual([])
  })

  it('simpan dari form: error validasi atau buat/edit', async () => {
    const session = memorySession()
    const { save, findTask, hydrate } = useTasks({ session: async () => session })
    await hydrate()

    const draft = emptyTaskDraft('2026-10-10')
    expect(save(draft, null)).toEqual({ error: 'titleRequired' })

    const result = save({ ...draft, title: 'Rapat' }, null)
    if (!('id' in result)) throw new Error('gagal simpan')

    save({ ...draft, title: 'Rapat tim', priority: 'urgent' }, result.id)
    expect(findTask(result.id)).toMatchObject({ title: 'Rapat tim', priority: 'urgent' })
  })

  it('task tertaut ke jadwal baru benar-benar tersimpan ke penyimpanan lokal', async () => {
    const session = memorySession()
    const { save, hydrate } = useTasks({ session: async () => session })
    await hydrate()

    const scheduleId = createUuidV7Generator({ clock: createManualClock(START_MS) })()
    const result = save({ ...emptyTaskDraft('2026-10-10'), title: 'Belajar', scheduleId }, null)
    if (!('id' in result)) throw new Error('gagal simpan')

    await vi.waitFor(async () => {
      const stored = await loadTasks(session)
      expect(stored).toEqual([expect.objectContaining({ id: result.id, scheduleId })])
    })
  })

  it('move menyimpan kuadran + posisi hasil reorder', async () => {
    const session = memorySession()
    const { tasks, add, move, hydrate } = useTasks({ session: async () => session })
    await hydrate()

    const a = add('A', 'medium', null)!
    const b = add('B', 'medium', null)!
    const c = add('C', 'medium', null)!

    move(a, 'do')
    move(b, 'do')
    move(c, 'do', 0)

    expect(
      tasks.value
        .filter((task) => task.quadrant === 'do')
        .sort((left, right) => left.position - right.position)
        .map((task) => task.title),
    ).toEqual(['C', 'A', 'B'])

    await vi.waitFor(async () => {
      const stored = await loadTasks(session)
      const ordered = stored
        .filter((task) => task.quadrant === 'do')
        .sort((left, right) => left.position - right.position)
      expect(ordered.map((task) => task.title)).toEqual(['C', 'A', 'B'])
      expect(ordered.map((task) => task.position)).toEqual([0, 1, 2])
    })
  })

  it('menulis ke penyimpanan, bukan cuma ke state (inilah yang bikin reload tidak kehilangan data)', async () => {
    const session = memorySession()
    const { add, hydrate } = useTasks({ session: async () => session })
    await hydrate()

    const id = add('Tersimpan', 'medium', null)

    // Penyimpanan berjalan di belakang layar; tunggu satu putaran microtask + I/O adaptor.
    await vi.waitFor(async () => {
      const stored = await loadTasks(session)
      expect(stored.map((task) => task.title)).toContain('Tersimpan')
    })

    const stored = await loadTasks(session)
    expect(stored.find((task) => task.id === id)?.title).toBe('Tersimpan')
  })

  it('hydrate memuat data yang sudah ada di penyimpanan (bukan mulai dari mock)', async () => {
    const session = memorySession()
    const existing = taskOf(session, session.newId(), 'Punya sesi sebelumnya')
    await persistTask(session, existing)

    const { tasks, hydrate, status } = useTasks({ session: async () => session })
    await hydrate()

    expect(status.value).toBe('ready')
    expect(tasks.value).toEqual([existing])
  })

  it('tanpa sesi (mis. SSR): daftar kosong dan status kembali idle, bukan error', async () => {
    const { tasks, hydrate, status } = useTasks({ session: async () => null })
    await hydrate()

    expect(tasks.value).toEqual([])
    expect(status.value).toBe('idle')
  })
})
