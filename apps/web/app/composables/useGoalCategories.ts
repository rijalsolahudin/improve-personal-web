import {
  GENERAL_GOAL_CATEGORY_KEY,
  addGoalCategory,
  canDeleteGoalCategory,
  createSystemClock,
  latestGoalCategories,
  nextGoalCategoryColor,
  resolveGoalCategory,
  validateGoalCategoryLabel,
  type GoalCategory,
  type GoalCategoryAddError,
  type GoalCategoryColor,
} from '@improve-personal/core'

import { createUuidV7Generator } from '~/utils/storage/uuid'
import type { LocalDataSession } from '~/utils/storage/session'
import {
  deleteCategory,
  loadGoalCategories,
  seedDefaultGoalCategories,
  toGoalCategoryView,
  writeCategory,
  type GoalCategoryView,
} from '~/utils/goals/categories'
import { moveGoalsToCategory } from '~/utils/goals/persistence'
import {
  isReloadSessionActive,
  readAfterWrites,
  registerSyncReloader,
  reloadSession,
} from '~/utils/sync/refresh'

/**
 * Kategori goal (PRD F13) di atas record `goal_category`.
 *
 * Kenapa bukan `localStorage` seperti mockup: penyimpanan lokal dipisah per akun dan penulisan lewat
 * `RecordWriter` menulis record + index + outbox dalam satu transaksi, jadi kategori ikut sync ke
 * perangkat lain. Aturan domain (validasi label, `general` tidak bisa dihapus, warna otomatis, pindah
 * goal ke `general`) ada di core supaya web & mobile memakai aturan yang sama.
 *
 * API ini sengaja tidak menyentuh komponen: UI modal memakai `categories` + operasi di bawah, dan
 * `resolve()` dipakai saat menampilkan label/warna sebuah goal (kategori tak dikenal → General).
 */

export type UseGoalCategoriesOptions = {
  /** Dipakai test: sesi data lokal tiruan, tanpa membuka IndexedDB/kripto. */
  readonly session?: () => Promise<LocalDataSession | null>
}

export type GoalCategoriesStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Sebab operasi kategori ditolak. Semua alasan ini berarti TIDAK ada yang ditulis. */
export type GoalCategoryActionError = GoalCategoryAddError | 'not_found' | 'general' | 'not_ready'

export type GoalCategoryActionResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: GoalCategoryActionError }

export type GoalCategoryAddResult =
  | { readonly ok: true; readonly key: string }
  | { readonly ok: false; readonly reason: GoalCategoryActionError }

/** Antrean tulis di level modul: dua instance composable tetap satu urutan. */
let writeQueue: Promise<void> = Promise.resolve()
/** Reload setelah pull; satu pun untuk seluruh komponen. */
let reloadInFlight: Promise<void> | null = null

const newCategoryId = createUuidV7Generator({ clock: createSystemClock() })

export function resetGoalCategoriesForTest(): void {
  writeQueue = Promise.resolve()
  reloadInFlight = null
}

export function useGoalCategories(options: UseGoalCategoriesOptions = {}) {
  const localData = useLocalData()
  const getSession = options.session ?? (() => localData.ensure())

  const categories = useState<GoalCategory[]>('goalCategories', () => [])
  const status = useState<GoalCategoriesStatus>('goalCategoriesStatus', () => 'idle')
  const error = useState<string | null>('goalCategoriesError', () => null)

  let hydrateInFlight: Promise<void> | null = null

  const views = computed<GoalCategoryView[]>(() =>
    categories.value.map((category) => toGoalCategoryView(category)),
  )

  /**
   * Kategori untuk ditampilkan. Kategori yang tidak ada di katalog (dihapus di perangkat lain, atau
   * belum tersinkron) tampil sebagai General - bukan baris tanpa label.
   */
  function resolve(key: unknown): GoalCategoryView {
    return toGoalCategoryView(resolveGoalCategory(views.value, key))
  }

  function findCategory(key: string): GoalCategory | undefined {
    return categories.value.find((category) => category.key === key)
  }

  function enqueue(work: (session: LocalDataSession) => Promise<void>): void {
    writeQueue = writeQueue.then(async () => {
      try {
        const session = await getSession()
        if (session === null) return
        await work(session)
        error.value = null
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : 'kategori goal gagal disimpan'
      }
    })
    void writeQueue
  }

  /** Ganti satu kategori di state lokal tanpa menunggu storage (UI instan, tulis di belakang). */
  function applyCategory(next: GoalCategory): void {
    categories.value = latestGoalCategories([
      ...categories.value.filter((category) => category.key !== next.key),
      next,
    ])
  }

  function applyRemoval(key: string): void {
    categories.value = categories.value.filter((category) => category.key !== key)
  }

  function hydrate(): Promise<void> {
    if (status.value === 'ready') return Promise.resolve()

    hydrateInFlight ??= (async () => {
      status.value = 'loading'
      try {
        const session = await getSession()
        if (session === null) {
          status.value = 'idle'
          return
        }

        const loaded = await loadGoalCategories(session)
        if (loaded.hasAnyRecord) {
          categories.value = loaded.categories
        } else {
          // Akun baru: kategori bawaan ditulis sebagai record supaya ikut sync dan bisa diubah user.
          categories.value = await seedDefaultGoalCategories(session, session.clock.nowMs())
        }

        status.value = 'ready'
        error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : 'kategori goal gagal dimuat'
        hydrateInFlight = null
      }
    })()

    return hydrateInFlight
  }

  /**
   * Muat ulang setelah pull menerapkan kategori dari perangkat lain.
   *
   * Tidak melakukan seeding: akun yang kategorinya sudah dihapus semua tidak boleh tiba-tiba
   * mendapat kategori bawaan lagi hanya karena pull terjadi.
   */
  function reload(): Promise<void> {
    if (status.value === 'idle') return Promise.resolve()

    reloadInFlight ??= (async () => {
      try {
        const target = await reloadSession(localData.current, getSession)
        if (target === null) return

        const loaded = await readAfterWrites(
          () => writeQueue,
          () => loadGoalCategories(target.session),
        )

        // Sesi bisa berganti pemilik selama pembacaan (lihat `isReloadSessionActive`).
        if (!isReloadSessionActive(target, localData.current)) return

        categories.value = loaded.categories
        status.value = 'ready'
        error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : 'kategori goal gagal dimuat'
      } finally {
        reloadInFlight = null
      }
    })()

    return reloadInFlight
  }

  /** Tambah kategori. Warna opsional: kalau kosong, dipakai warna yang belum terpakai. */
  function add(label: string, color?: GoalCategoryColor): GoalCategoryAddResult {
    if (status.value !== 'ready') return { ok: false, reason: 'not_ready' }

    const id = newCategoryId()
    const result = addGoalCategory(categories.value, {
      // `id` record dan `key` kategori sama-sama UUIDv7: kunci tidak berubah saat label diubah, dan
      // dua perangkat tidak mungkin membuat kunci yang sama.
      id,
      key: id,
      label,
      ...(color === undefined ? {} : { color }),
      updatedAt: Date.now(),
    })
    if (!result.ok) return result

    applyCategory(result.category)
    enqueue((session) => writeCategory(session, result.category))
    return { ok: true, key: result.category.key }
  }

  function rename(key: string, label: string): GoalCategoryActionResult {
    if (status.value !== 'ready') return { ok: false, reason: 'not_ready' }

    const current = findCategory(key)
    if (current === undefined) return { ok: false, reason: 'not_found' }

    const valid = validateGoalCategoryLabel(categories.value, label, { exceptKey: key })
    if (!valid.ok) return { ok: false, reason: valid.reason }

    const next: GoalCategory = { ...current, label: valid.label, updatedAt: Date.now() }
    applyCategory(next)
    enqueue((session) => writeCategory(session, next))
    return { ok: true }
  }

  function setColor(key: string, color: GoalCategoryColor): GoalCategoryActionResult {
    if (status.value !== 'ready') return { ok: false, reason: 'not_ready' }

    const current = findCategory(key)
    if (current === undefined) return { ok: false, reason: 'not_found' }

    const next: GoalCategory = { ...current, color, updatedAt: Date.now() }
    applyCategory(next)
    enqueue((session) => writeCategory(session, next))
    return { ok: true }
  }

  /**
   * Hapus kategori. `general` ditolak; goal yang masih memakai kategori ini dipindah ke `general`
   * SEBELUM tombstone ditulis, jadi tidak ada goal yang menunjuk kategori yang sudah hilang.
   */
  function remove(key: string): GoalCategoryActionResult {
    if (status.value !== 'ready') return { ok: false, reason: 'not_ready' }

    const current = findCategory(key)
    if (current === undefined) return { ok: false, reason: 'not_found' }
    if (!canDeleteGoalCategory(current)) return { ok: false, reason: 'general' }

    applyRemoval(key)
    enqueue(async (session) => {
      await moveGoalsToCategory(
        session,
        current.key,
        GENERAL_GOAL_CATEGORY_KEY,
        session.clock.nowMs(),
      )
      await deleteCategory(session, current.id)
    })
    return { ok: true }
  }

  /** Warna yang akan dipakai kalau user menambah kategori tanpa memilih warna. */
  function nextColor(): GoalCategoryColor {
    return nextGoalCategoryColor(categories.value)
  }

  // Sesi data lokal baru dibuka setelah akun jelas (guard + komposabel data).
  watch(
    () => localData.state.value?.status ?? 'idle',
    (next) => {
      if (next === 'ready') void hydrate()
    },
    { immediate: true },
  )

  // Akun berganti tanpa reload: kategori akun sebelumnya tidak boleh dipakai lagi.
  watch(
    () => localData.state.value?.userId ?? null,
    (next, previous) => {
      if (next === previous) return
      categories.value = []
      hydrateInFlight = null
      status.value = 'idle'
      if (next === null) return
      void hydrate()
    },
  )

  if (options.session) void hydrate()

  // Kategori dipakai di halaman Goals & filter; ikut dimuat ulang saat pull menerapkan data perangkat lain.
  registerSyncReloader('goalCategories', reload)

  return {
    categories: computed(() => views.value),
    status: computed(() => status.value),
    error: computed(() => error.value),
    hydrate,
    reload,
    resolve,
    nextColor,
    add,
    rename,
    setColor,
    remove,
  }
}
