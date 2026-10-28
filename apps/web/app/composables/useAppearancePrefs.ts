import {
  DEFAULT_APP_STYLE,
  normalizeAppStyle,
  normalizeUserPrefs,
  userPrefsSchema,
  type AppStyle,
  type UserPrefs,
} from '@improve-personal/core'
import {
  DEFAULT_STYLE,
  DEFAULT_THEME,
  STYLE_NAMES,
  type StyleName,
  type ThemeName,
} from '@improve-personal/tokens'

import { newestRecord } from '~/utils/storage/newest-record'
import type { LocalDataSession } from '~/utils/storage/session'
import {
  isReloadSessionActive,
  readAfterWrites,
  registerSyncReloader,
  reloadSession,
} from '~/utils/sync/refresh'

/**
 * Penyimpanan preferensi tampilan ke `user_prefs` (PRD F16): PER AKUN dan ikut sync antar perangkat.
 *
 * Kenapa lewat sesi data lokal, bukan `localStorage`:
 * - Penyimpanan lokal sudah dipisah per akun (nama database memuat `userId`), jadi akun B tidak bisa
 *   membaca record akun A - syarat "tersimpan per akun".
 * - Penulisan lewat `RecordWriter` menulis record + index + baris outbox dalam satu transaksi, jadi
 *   pilihan user benar-benar ikut antrean sync (F15), bukan hanya menetap di satu browser.
 * `localStorage` tetap dipakai, tetapi hanya sebagai cache paint pertama (lihat `stores/appearance`).
 *
 * Kosakata gaya: KANONIKNYA kebab-case (`cute-pure`) dan dipakai apa adanya oleh CSS/`data-style`
 * maupun `user_prefs` (core & DB). Ejaan lama `cute_pure` hanya dibaca lewat `normalizeAppStyle`
 * dari core - tidak ada tabel pemetaan kedua di sini, supaya daftar gaya tidak bisa divergen dan
 * Cute Pure tidak diam-diam jatuh ke Cute saat sync/import (QA T25 B2).
 */

export type AppearancePrefsSession = Pick<
  LocalDataSession,
  'userId' | 'repos' | 'writer' | 'newId' | 'clock'
>

export type UseAppearancePrefsOptions = {
  /** Dipakai test: sesi data lokal tiruan, tanpa membuka IndexedDB/kripto. */
  readonly session?: () => Promise<AppearancePrefsSession | null>
}

export type AppearancePrefsStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Antrean tulis di level modul: dua instance composable (mis. remount layout) tetap satu urutan. */
let writeQueue: Promise<void> = Promise.resolve()

/** Reload setelah pull; satu pun untuk seluruh komponen. */
let reloadInFlight: Promise<void> | null = null

/** `StyleName` (CSS) → `AppStyle` (`user_prefs`); keduanya kanonik, alias ikut dinormalkan core. */
export function toPrefStyle(style: StyleName): AppStyle {
  return normalizeAppStyle(style) ?? DEFAULT_APP_STYLE
}

/**
 * `AppStyle` (`user_prefs`) → `StyleName` (CSS). Menerima ejaan lama (`cute_pure`) lewat
 * `normalizeAppStyle`, tetapi hanya mengembalikan nilai yang dikenal tokens.
 * `null` = nilai tak dikenal → caller pakai default.
 */
export function fromPrefStyle(style: unknown): StyleName | null {
  const canonical = normalizeAppStyle(style)
  if (canonical === null) return null
  // Daftar kanonik core harus sama dengan daftar gaya UI; kalau tidak, jangan karang `data-style`.
  return (STYLE_NAMES as readonly string[]).includes(canonical) ? (canonical as StyleName) : null
}

type AppearancePrefs = { readonly theme: ThemeName; readonly style: StyleName }

export function useAppearancePrefs(options: UseAppearancePrefsOptions = {}) {
  const localData = useLocalData()
  const getSession = options.session ?? (() => localData.ensure())
  const appearance = useAppearanceStore()
  const deco = useDeco()

  const status = useState<AppearancePrefsStatus>('appearancePrefsStatus', () => 'idle')
  const error = useState<string | null>('appearancePrefsError', () => null)

  /** Id record `user_prefs` milik akun ini; dibuat sekali supaya update menimpa, bukan menumpuk. */
  let recordId: string | null = null
  /** Nilai terakhir yang sudah ada di penyimpanan - mencegah tulis ulang saat hydrate. */
  let persisted: AppearancePrefs | null = null
  let hydrateInFlight: Promise<void> | null = null

  async function write(
    session: AppearancePrefsSession,
    next: AppearancePrefs,
    id: string,
  ): Promise<void> {
    const payload: UserPrefs = {
      id,
      themeColor: next.theme,
      style: toPrefStyle(next.style),
      // `hideDecorations` milik F14 tetap di sini supaya tulisan tema tidak menimpanya jadi `false`.
      hideDecorations: deco.isHidden.value,
      updatedAt: session.clock.nowMs(),
    }

    const valid = userPrefsSchema.safeParse(payload)
    if (!valid.success) throw new Error('preferensi tampilan tidak valid')

    await session.writer.write({ type: 'user_prefs', id, data: () => valid.data })
    recordId = id
    persisted = next
  }

  function enqueue(next: AppearancePrefs): void {
    writeQueue = writeQueue.then(async () => {
      try {
        const session = await getSession()
        if (session === null) return
        await write(session, next, recordId ?? session.newId())
        error.value = null
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : 'preferensi tampilan gagal disimpan'
      }
    })
    void writeQueue
  }

  /**
   * Terapkan record terbaru ke store tampilan. `recordId`/`persisted` ikut disamakan supaya watcher
   * di bawah tidak menulis balik nilai yang baru saja dibaca dari penyimpanan.
   */
  function applyRecord(
    record: { readonly id: string; readonly data: unknown },
    userId: string,
  ): void {
    const prefs = normalizeUserPrefs(record.data)
    const next: AppearancePrefs = {
      theme: prefs.themeColor,
      style: fromPrefStyle(prefs.style) ?? DEFAULT_STYLE,
    }
    appearance.applyPrefs(next, userId)
    recordId = record.id
    persisted = next
  }

  /**
   * Baca record `user_prefs` akun yang sedang terbuka, lalu jadikan pilihan aktif.
   * Akun tanpa record mulai dari default dan langsung di-seed, supaya perangkat lain menerima
   * pilihannya lewat sync walaupun user tidak pernah mengubah apa pun.
   */
  async function load(session: AppearancePrefsSession): Promise<void> {
    appearance.adopt(session.userId)
    const newest = newestRecord(await session.repos.userPrefs.listAll())

    if (newest === null) {
      const next: AppearancePrefs = { theme: DEFAULT_THEME, style: DEFAULT_STYLE }
      appearance.applyPrefs(next, session.userId)
      await write(session, next, session.newId())
      return
    }

    applyRecord(newest, session.userId)
  }

  /** Muat sekali per sesi; panggilan kedua menunggu hydrate yang sedang berjalan. */
  function hydrate(): Promise<void> {
    if (hydrateInFlight) return hydrateInFlight
    if (status.value === 'ready') return Promise.resolve()

    hydrateInFlight = (async () => {
      status.value = 'loading'
      try {
        const session = await getSession()
        if (session === null) {
          // SSR / akun terkunci / belum login: pakai cache lokal apa adanya.
          status.value = 'idle'
          return
        }

        await load(session)
        status.value = 'ready'
        error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : 'preferensi tampilan gagal dimuat'
        hydrateInFlight = null
      }
    })()

    return hydrateInFlight
  }

  /**
   * Muat ulang setelah pull menerapkan preferensi dari perangkat lain.
   *
   * `status` tidak diubah ke `loading`. Bedanya dengan hydrate: akun tanpa record TIDAK di-seed di
   * sini - menulis default saat reload akan menimpa pilihan yang sedang tampil hanya karena record
   * belum/tidak ada. `hideDecorations` juga bukan milik store ini (dibaca dari `useDeco` saat menulis),
   * jadi tidak ikut diubah.
   */
  function reload(): Promise<void> {
    if (status.value === 'idle') return Promise.resolve()

    reloadInFlight ??= (async () => {
      try {
        const target = await reloadSession(localData.current, getSession)
        if (target === null) return

        const newest = await readAfterWrites(
          () => writeQueue,
          async () => newestRecord(await target.session.repos.userPrefs.listAll()),
        )

        // Sesi bisa berganti pemilik selama pembacaan (lihat `isReloadSessionActive`).
        if (!isReloadSessionActive(target, localData.current)) return

        if (newest !== null) applyRecord(newest, target.session.userId)
        status.value = 'ready'
        error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : 'preferensi tampilan gagal dimuat'
      } finally {
        reloadInFlight = null
      }
    })()

    return reloadInFlight
  }

  /** Pilihan berubah dari UI: state sudah berubah, penulisan berjalan di belakang antrean. */
  watch([() => appearance.theme, () => appearance.style], () => {
    if (status.value !== 'ready') return
    const next: AppearancePrefs = { theme: appearance.theme, style: appearance.style }
    if (persisted?.theme === next.theme && persisted.style === next.style) return
    enqueue(next)
  })

  // Sesi data lokal baru dibuka setelah akun jelas (guard + komposabel data). Saat itulah record bisa
  // dibaca - termasuk sesudah unlock, ketika status berubah dari `locked` ke `ready`.
  watch(
    () => localData.state.value?.status ?? 'idle',
    (next) => {
      if (next === 'ready') void hydrate()
    },
    { immediate: true },
  )

  // Akun berganti tanpa reload: record & pilihan akun sebelumnya tidak boleh dipakai lagi.
  watch(
    () => localData.state.value?.userId ?? null,
    (next, previous) => {
      if (next === previous) return
      recordId = null
      persisted = null
      hydrateInFlight = null
      status.value = 'idle'
      if (next === null) {
        appearance.forget()
        return
      }
      void hydrate()
    },
  )

  if (options.session) void hydrate()

  // Preferensi tampilan dipakai layout dashboard, jadi ikut dimuat ulang saat pull menerapkan data
  // perangkat lain (mis. tema diganti di ponsel).
  registerSyncReloader('appearance', reload)

  return {
    status: computed(() => status.value),
    error: computed(() => error.value),
    hydrate,
    reload,
  }
}

/** Dipakai test: tidak ada antrean tulis yang bocor antar kasus. */
export function resetAppearancePrefsForTest(): void {
  writeQueue = Promise.resolve()
  reloadInFlight = null
}
