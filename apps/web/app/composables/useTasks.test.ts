import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

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
import { resetSyncReloadersForTest } from '~/utils/sync/refresh'
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

/**
 * Sesi yang tulisannya ditahan sampai `release()` dipanggil.
 *
 * Mensimulasikan antrean tulis yang belum mendarat: reload yang tidak menunggu antrean akan membaca
 * penyimpanan lebih dulu dan mengembalikan UI ke nilai lama.
 */
function withWriteGate(session: LocalDataSession): {
  readonly session: LocalDataSession
  readonly release: () => void
} {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const writer = session.writer

  return {
    release,
    session: {
      ...session,
      writer: {
        ...writer,
        write: async (input) => {
          await gate
          return writer.write(input)
        },
      },
    },
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

describe('useTasks: muat ulang setelah pull (AC T77)', () => {
  beforeEach(() => {
    clearNuxtState(['tasks', 'tasksStatus', 'tasksError', 'localData'])
    resetTasksHydrationForTest()
    resetSyncReloadersForTest()
  })

  it('reload memuat task dari perangkat lain tanpa pernah berstatus loading', async () => {
    const session = memorySession()
    await persistTask(session, taskOf(session, session.newId(), 'Lokal'))

    const { tasks, hydrate, reload, status } = useTasks({ session: async () => session })
    await hydrate()
    expect(tasks.value.map((task) => task.title)).toEqual(['Lokal'])

    await persistTask(session, taskOf(session, session.newId(), 'Dari perangkat lain'))

    const pending = reload()
    // Skeleton hanya untuk hydrate pertama; reload menukar daftar di belakang layar.
    expect(status.value).toBe('ready')
    await pending

    expect(tasks.value.map((task) => task.title).sort()).toEqual(['Dari perangkat lain', 'Lokal'])
    expect(status.value).toBe('ready')
  })

  it('reload menunggu tulisan lokal yang belum mendarat', async () => {
    const gated = withWriteGate(memorySession())
    const { tasks, add, hydrate, reload } = useTasks({ session: async () => gated.session })
    await hydrate()

    add('Baru diklik', 'urgent', null)
    expect(tasks.value.map((task) => task.title)).toEqual(['Baru diklik'])

    const pending = reload()
    await flushPromises()
    // Kalau reload membaca sebelum antrean tulis selesai, task ini sudah hilang di titik ini.
    expect(tasks.value.map((task) => task.title)).toEqual(['Baru diklik'])

    gated.release()
    await pending
    expect(tasks.value.map((task) => task.title)).toEqual(['Baru diklik'])
  })

  it('store yang belum pernah di-hydrate tidak memuat apa pun', async () => {
    const getSession = vi.fn(async () => null)
    const { status, reload } = useTasks({ session: getSession })
    await vi.waitFor(() => expect(status.value).toBe('idle'))
    getSession.mockClear()

    await reload()

    expect(getSession).not.toHaveBeenCalled()
    expect(status.value).toBe('idle')
  })

  it('reload yang gagal menandai status error beserta pesannya', async () => {
    const session = memorySession()
    const { hydrate, reload, status, error } = useTasks({ session: async () => session })
    await hydrate()

    vi.spyOn(session.repos.todo, 'listAll').mockRejectedValue(new Error('storage rusak'))
    await reload()

    expect(status.value).toBe('error')
    expect(error.value).toBe('storage rusak')
  })
})
