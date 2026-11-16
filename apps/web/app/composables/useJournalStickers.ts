import { createSystemClock, type JournalSticker } from '@improve-personal/core'

import {
  JOURNAL_STICKER_MAX,
  clampPlacement,
  loadJournalStickers,
  nextPosition,
  persistJournalSticker,
  removeJournalSticker,
  type StickerPlacement,
} from '~/utils/memo/stickers'
import type { LocalDataSession } from '~/utils/storage/session'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import {
  isReloadSessionActive,
  readAfterWrites,
  registerDataReloader,
  reloadSession,
} from '~/utils/storage/reload'

import { useLocalData } from './useLocalData'

/** Penempatan sticker baru: dekat atas kertas, sedikit miring supaya terasa ditempel tangan. */
const DEFAULT_PLACEMENT: StickerPlacement = { x: 0.82, line: 1, rotate: -6, scale: 1 }

let writeQueue: Promise<void> = Promise.resolve()
let hydrateInFlight: Promise<void> | null = null
let reloadInFlight: Promise<void> | null = null

/** Dipakai test supaya antrean & hydrate antar kasus tidak saling mewarisi. */
export function resetJournalStickersForTest(): void {
  writeQueue = Promise.resolve()
  hydrateInFlight = null
  reloadInFlight = null
}

export function waitForJournalStickerWritesForTest(): Promise<void> {
  return writeQueue
}

export type UseJournalStickersOptions = {
  /** Disuntik di test supaya composable bisa diuji tanpa Nuxt/auth. */
  readonly session?: () => Promise<LocalDataSession | null>
}

/**
 * Sticker yang ditempel di kertas jurnal, per halaman (`entryId` record `journal_entry`).
 *
 * Perubahan optimistis: state berubah dulu, tulisan berjalan di antrean serial. Kalau tulisan gagal,
 * `error` terisi dan state dimuat ulang dari penyimpanan supaya UI tidak menampilkan sticker yang
 * sebenarnya tidak tersimpan.
 */
export function useJournalStickers(options: UseJournalStickersOptions = {}) {
  const localData = useLocalData()
  const getSession = options.session ?? localData.ensure

  const stickers = useState<JournalSticker[]>('journal-stickers', () => [])
  const status = useState<'idle' | 'ready'>('journal-stickers-status', () => 'idle')
  const error = useState<string | null>('journal-stickers-error', () => null)

  const newStickerId = createUuidV7Generator({ clock: createSystemClock() })

  function stickersOf(entryId: string | null): JournalSticker[] {
    if (entryId === null) return []
    return stickers.value
      .filter((sticker) => sticker.entryId === entryId)
      .sort((a, b) => a.position - b.position)
  }

  async function read(): Promise<void> {
    const session = await getSession()
    if (session === null) return
    stickers.value = await loadJournalStickers(session)
    status.value = 'ready'
  }

  function hydrate(): Promise<void> {
    if (status.value === 'ready') return Promise.resolve()
    hydrateInFlight ??= read()
      .catch(() => {
        error.value = 'sticker jurnal tidak bisa dimuat'
      })
      .finally(() => {
        hydrateInFlight = null
      })
    return hydrateInFlight
  }

  function reload(): Promise<void> {
    if (status.value === 'idle') return Promise.resolve()
    reloadInFlight ??= (async () => {
      try {
        const target = await reloadSession(localData.current, getSession)
        if (target === null) return
        const loaded = await readAfterWrites(
          () => writeQueue,
          () => loadJournalStickers(target.session),
        )
        if (!isReloadSessionActive(target, localData.current)) return
        stickers.value = loaded
      } catch {
        error.value = 'sticker jurnal tidak bisa dimuat'
      } finally {
        reloadInFlight = null
      }
    })()
    return reloadInFlight
  }

  function enqueue(work: (session: LocalDataSession) => Promise<void>): Promise<boolean> {
    const run = writeQueue.then(async () => {
      try {
        const session = await getSession()
        if (session === null) throw new Error('penyimpanan lokal belum bisa dibuka')
        await work(session)
        error.value = null
        return true
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : 'sticker tidak bisa disimpan'
        // Kembalikan state ke isi penyimpanan: sticker yang gagal ditulis tidak boleh tampil tersimpan.
        await read().catch(() => undefined)
        return false
      }
    })
    writeQueue = run.then(() => undefined)
    return run
  }

  /** Tempel sticker baru. `null` kalau halaman itu sudah penuh. */
  function add(entryId: string, stickerId: string): JournalSticker | null {
    const current = stickersOf(entryId)
    if (current.length >= JOURNAL_STICKER_MAX) return null

    const sticker: JournalSticker = {
      id: newStickerId(),
      entryId,
      stickerId,
      position: nextPosition(current),
      ...DEFAULT_PLACEMENT,
    }
    stickers.value = [...stickers.value, sticker]
    void enqueue((session) => persistJournalSticker(session, sticker))
    return sticker
  }

  /** Geser/putar/ubah ukuran; sticker yang disentuh naik ke tumpukan paling atas. */
  function place(id: string, placement: StickerPlacement): void {
    const existing = stickers.value.find((sticker) => sticker.id === id)
    if (existing === undefined) return

    const others = stickersOf(existing.entryId).filter((sticker) => sticker.id !== id)
    const next: JournalSticker = {
      ...existing,
      ...clampPlacement(placement),
      position: nextPosition(others),
    }
    stickers.value = stickers.value.map((sticker) => (sticker.id === id ? next : sticker))
    void enqueue((session) => persistJournalSticker(session, next))
  }

  function remove(id: string): void {
    if (!stickers.value.some((sticker) => sticker.id === id)) return
    stickers.value = stickers.value.filter((sticker) => sticker.id !== id)
    void enqueue((session) => removeJournalSticker(session, id))
  }

  /** Lepas semua sticker satu halaman (halaman jurnalnya dihapus). */
  function removeAllOf(entryId: string): void {
    const ids = stickersOf(entryId).map((sticker) => sticker.id)
    if (ids.length === 0) return
    stickers.value = stickers.value.filter((sticker) => sticker.entryId !== entryId)
    void enqueue(async (session) => {
      for (const id of ids) await removeJournalSticker(session, id)
    })
  }

  watch(
    () => localData.state.value.status,
    (next) => {
      if (next === 'ready') void hydrate()
    },
  )
  void hydrate()
  registerDataReloader('journalStickers', reload)

  return {
    stickersOf,
    error: computed(() => error.value),
    hasStickers: (entryId: string | null): boolean => stickersOf(entryId).length > 0,
    add,
    place,
    remove,
    removeAllOf,
  }
}
