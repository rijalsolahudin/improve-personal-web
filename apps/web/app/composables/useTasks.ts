import { createSystemClock } from '@improve-personal/core'

import {
  applyTaskDraft,
  clearDoneFromMatrix,
  quickTask,
  validateTaskDraft,
  type Priority,
  type Quadrant,
  type Task,
  type TaskDraft,
  type TaskDraftError,
} from '~/utils/tasks'
import { loadTasks, persistTask, removeTask } from '~/utils/tasks/persistence'
import type { LocalDataSession } from '~/utils/storage/session'
import { createUuidV7Generator } from '~/utils/storage/uuid'

import { useLocalData } from './useLocalData'

/**
 * Data task (PRD F2 untuk To-do, F3 untuk kuadran) untuk To-do, Eisenhower, Kalender, dan Home.
 *
 * Data disimpan di `todo` + `eisenhower_placement` lewat sesi data lokal (IndexedDB + terenkripsi),
 * jadi reload tidak menghilangkan apa pun. Mock fase 1 sudah dibuang.
 *
 * Bentuk API sengaja TETAP sinkron seperti sebelumnya (`tasks`, `add`, `save`, `toggle`, `remove`,
 * `setQuadrant`) supaya enam pemakainya tidak perlu ikut berubah - dan karena UI memang harus langsung
 * responsif: perubahan masuk ke state lokal lebih dulu, penyimpanan menyusul. Itu prinsip §5 "tulis
 * lokal dulu, selalu": UI tidak pernah menunggu penyimpanan, apalagi jaringan.
 *
 * Kegagalan penyimpanan TIDAK disembunyikan: ia muncul di `error`. Data yang gagal disimpan sama
 * artinya dengan data yang hilang saat reload, jadi diam bukan pilihan.
 */

export type UseTasksOptions = {
  /**
   * Sumber sesi. Default: sesi data lokal aplikasi.
   *
   * Disuntik di test supaya logika ini bisa diuji tanpa Nuxt (dan test bisa memakai adaptor memori core
   * alih-alih IndexedDB), tanpa mem-mock modul internal.
   */
  readonly session?: () => Promise<LocalDataSession | null>
}

/**
 * Hydrate yang sedang berjalan, dibagi seluruh komponen.
 *
 * Di level modul, bukan per-pemanggil `useTasks()`: dua komponen yang memakai task harus menunggu
 * hydrate yang SAMA, bukan masing-masing memuat sendiri. Aman di server karena hydrate tidak pernah
 * melakukan apa pun di sana (`getSession` mengembalikan `null`).
 */
let hydrateInFlight: Promise<void> | null = null

/**
 * Dipakai test supaya hydrate antar kasus tidak saling mewarisi.
 *
 * Di aplikasi nyata ini tidak pernah dipanggil: satu halaman = satu hydrate.
 */
export function resetTasksHydrationForTest(): void {
  hydrateInFlight = null
}

export function useTasks(options: UseTasksOptions = {}) {
  const localData = useLocalData()
  const getSession = options.session ?? localData.ensure

  const tasks = useState<Task[]>('tasks', () => [])
  const status = useState<'idle' | 'loading' | 'ready' | 'error'>('tasksStatus', () => 'idle')
  const error = useState<string | null>('tasksError', () => null)

  /**
   * Id task baru.
   *
   * UUIDv7, dan itu bukan preferensi: `todoSchema.id` menolak versi lain, jadi `crypto.randomUUID()`
   * (v4) akan menghasilkan record yang tidak bisa dibaca lagi. Generatornya sengaja dibuat di sini
   * (bukan menunggu sesi) supaya `add`/`save` tetap sinkron seperti sebelumnya.
   */
  const newTaskId = createUuidV7Generator({ clock: createSystemClock() })

  /**
   * Muat sekali per muat halaman; dipanggil komponen mana pun yang lebih dulu memakai task.
   *
   * Panggilan kedua MENUNGGU yang sedang jalan (bukan keluar lebih awal): beberapa komponen memakai
   * task, dan semuanya boleh menunggu "siap" yang sama tanpa memuat dua kali.
   */
  function hydrate(): Promise<void> {
    if (status.value === 'ready') return Promise.resolve()

    hydrateInFlight ??= (async () => {
      status.value = 'loading'
      try {
        const session = await getSession()
        if (session === null) {
          // SSR, atau sesi belum bisa dibuka: daftar kosong - bukan kegagalan.
          status.value = 'idle'
          return
        }

        tasks.value = await loadTasks(session)
        status.value = 'ready'
        error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : 'task tidak bisa dimuat'
        // Boleh dicoba lagi pada pemanggilan berikutnya (mis. storage sementara tidak bisa dibuka).
        hydrateInFlight = null
      }
    })()

    return hydrateInFlight
  }

  /**
   * Jalankan pekerjaan penyimpanan di belakang layar.
   *
   * `void` + `catch` sengaja: UI tidak menunggu, tapi kegagalannya tetap dilaporkan - bukan promise
   * yang tidak tertangani.
   */
  function background(work: (session: LocalDataSession) => Promise<void>, failure: string): void {
    void (async () => {
      try {
        const session = await getSession()
        if (session === null) return

        await work(session)
        error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : failure
      }
    })()
  }

  function findTask(id: string | null | undefined): Task | undefined {
    return id ? tasks.value.find((task) => task.id === id) : undefined
  }

  function persist(task: Task): void {
    background((session) => persistTask(session, task), 'task tidak bisa disimpan')
  }

  function replace(task: Task): void {
    tasks.value = tasks.value.map((current) => (current.id === task.id ? task : current))
    persist(task)
  }

  function update(id: string, change: Partial<Omit<Task, 'id'>>): void {
    const task = findTask(id)
    if (task) replace({ ...task, ...change })
  }

  function toggle(id: string): void {
    const task = findTask(id)
    if (task) update(id, { done: !task.done })
  }

  /** Tambah cepat; id task baru, atau `null` kalau judul kosong. */
  function add(title: string, priority: Priority, deadline: number | null): string | null {
    const task = quickTask(title, priority, deadline, newTaskId())
    if (!task) return null

    tasks.value = [...tasks.value, task]
    persist(task)

    return task.id
  }

  function save(
    draft: TaskDraft,
    editId: string | null,
  ): { id: string } | { error: TaskDraftError } {
    const draftError = validateTaskDraft(draft)
    if (draftError) return { error: draftError }

    const base = findTask(editId) ?? null
    const saved = applyTaskDraft(draft, base, base?.id ?? newTaskId())

    if (base) {
      replace(saved)
    } else {
      tasks.value = [...tasks.value, saved]
      persist(saved)
    }

    return { id: saved.id }
  }

  function remove(id: string): void {
    tasks.value = tasks.value.filter((task) => task.id !== id)
    background((session) => removeTask(session, id), 'task tidak bisa dihapus')
  }

  function setQuadrant(id: string, quadrant: Quadrant | null): void {
    update(id, { quadrant })
  }

  /** Bersihkan task selesai dari matrix; hanya yang benar-benar berubah yang disimpan. */
  function clearDoneQuadrants(): void {
    const before = new Map(tasks.value.map((task) => [task.id, task.quadrant]))
    const next = clearDoneFromMatrix(tasks.value)

    tasks.value = next

    for (const task of next) {
      if (before.get(task.id) !== task.quadrant) persist(task)
    }
  }

  // Di server ini tidak melakukan apa pun (sesi `null`), dan `status` tetap `idle`.
  void hydrate()

  return {
    tasks: computed(() => tasks.value),
    status: computed(() => status.value),
    error: computed(() => error.value),
    /** Status sesi data lokal (termasuk `isFreshKey` untuk peringatan recovery key). */
    localData: localData.state,
    hydrate,
    findTask,
    toggle,
    add,
    save,
    remove,
    setQuadrant,
    clearDoneQuadrants,
  }
}
