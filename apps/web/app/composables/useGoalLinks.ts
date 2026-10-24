import type { GoalLink, LinkableItemType } from '@improve-personal/core'

import { goalLinkKey } from '@improve-personal/core'

import { loadGoalLinks } from '~/utils/goals/links'
import type { LocalDataSession } from '~/utils/storage/session'
import { isReloadSessionActive, registerSyncReloader, reloadSession } from '~/utils/sync/refresh'

import { useLocalData } from './useLocalData'

/**
 * Snapshot tautan item → goal untuk UI.
 *
 * Tautan disimpan sebagai record `goal_link` (bukan kolom item). State ini hanya cermin reaktif
 * supaya halaman Goals langsung tahu saat form task/habit/jadwal menautkan item - sumber kebenaran
 * tetap repository. Penulisan dilakukan pemilik item (`utils/goals/links.ts`).
 */
export type UseGoalLinksOptions = {
  readonly session?: () => Promise<LocalDataSession | null>
}

let hydrateInFlight: Promise<void> | null = null
/** Reload setelah pull; satu pun untuk seluruh komponen. */
let reloadInFlight: Promise<void> | null = null
/** Sesi yang tautannya sudah dimuat. Sesi baru (ganti akun/test) wajib memuat ulang. */
let hydratedSession: LocalDataSession | null = null

export function resetGoalLinksHydrationForTest(): void {
  hydrateInFlight = null
  reloadInFlight = null
  hydratedSession = null
}

export function useGoalLinks(options: UseGoalLinksOptions = {}) {
  const localData = useLocalData()
  const getSession = options.session ?? localData.ensure
  const links = useState<GoalLink[]>('goalLinks', () => [])

  /**
   * Muat tautan sekali per sesi.
   *
   * `session` opsional dipakai `reload` store pemilik item: mereka sudah memegang sesi yang terbuka,
   * jadi meminta sesi lewat `ensure()` di sini hanya menambah permintaan yang tidak perlu (dan dulu
   * menulis `status = 'loading'` - M1 review #77).
   */
  function hydrate(session?: LocalDataSession): Promise<void> {
    hydrateInFlight ??= (async () => {
      try {
        const active = session ?? (await getSession())
        if (active === null || active === hydratedSession) return

        const loaded = await loadGoalLinks(active)

        // Akun bisa berganti selama pembacaan (jalur yang sama dengan `isReloadSessionActive` di
        // `utils/sync/refresh`): tautan akun lama tidak boleh mendarat di layar akun baru. Cek
        // dilakukan sebelum menulis, bukan sesudah, karena `links.value` adalah state yang tampil.
        const owner = localData.current()
        if (owner !== null && owner.userId !== active.userId) return

        links.value = loaded
        hydratedSession = active
      } finally {
        hydrateInFlight = null
      }
    })()
    return hydrateInFlight
  }

  /** Samakan cermin setelah item disimpan/dihapus; `null` = tautan dilepas. */
  function apply(itemType: LinkableItemType, itemId: string, link: GoalLink | null): void {
    const key = `${itemType}:${itemId}`
    const others = links.value.filter((current) => goalLinkKey(current) !== key)
    links.value = link === null ? others : [...others, link]
  }

  /**
   * Muat ulang setelah pull menerapkan tautan dari perangkat lain.
   *
   * Beda dengan `hydrate` yang berhenti saat sesi sudah pernah dimuat (`hydratedSession`), reload
   * selalu membaca ulang. Snapshot lama tetap tampil selama pembacaan, lalu ditukar - dan
   * `hydratedSession` diperbarui supaya hydrate milik task/jadwal/habit tidak membaca tabel ini lagi
   * di putaran yang sama.
   *
   * Tidak ada `status` di sini: tautan adalah pelengkap item, bukan sumber kebenaran. Kegagalan baca
   * cukup mempertahankan snapshot lama; store pemilik item yang melaporkan error-nya sendiri.
   */
  function reload(): Promise<void> {
    reloadInFlight ??= (async () => {
      try {
        const target = await reloadSession(localData.current, getSession)
        if (target === null) return

        const loaded = await loadGoalLinks(target.session)

        // Sesi bisa berganti pemilik selama pembacaan (lihat `isReloadSessionActive`).
        if (!isReloadSessionActive(target, localData.current)) return

        links.value = loaded
        hydratedSession = target.session
      } catch {
        // Sengaja tanpa state error: lihat komentar di atas.
      } finally {
        reloadInFlight = null
      }
    })()

    return reloadInFlight
  }

  // Ganti akun: tautan akun lama tidak boleh terlihat di akun baru.
  // Optional chaining: watcher bisa dieksekusi setelah Nuxt app test dibongkar.
  watch(
    () => localData.state?.value?.userId ?? null,
    (next, previous) => {
      if (next === previous || next === null) return
      links.value = []
      hydratedSession = null
      hydrateInFlight = null
      void hydrate()
    },
  )

  void hydrate()

  // Tautan dimuat paling awal di registry: task/jadwal/habit membangun goalId dari snapshot ini.
  registerSyncReloader('goalLinks', reload)

  return {
    links: computed(() => links.value),
    hydrate,
    reload,
    apply,
  }
}
