import type { GoalLink, LinkableItemType } from '@improve-personal/core'

import { goalLinkKey } from '@improve-personal/core'

import { loadGoalLinks } from '~/utils/goals/links'
import type { LocalDataSession } from '~/utils/storage/session'

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
/** Sesi yang tautannya sudah dimuat. Sesi baru (ganti akun/test) wajib memuat ulang. */
let hydratedSession: LocalDataSession | null = null

export function resetGoalLinksHydrationForTest(): void {
  hydrateInFlight = null
  hydratedSession = null
}

export function useGoalLinks(options: UseGoalLinksOptions = {}) {
  const localData = useLocalData()
  const getSession = options.session ?? localData.ensure
  const links = useState<GoalLink[]>('goalLinks', () => [])

  function hydrate(): Promise<void> {
    hydrateInFlight ??= (async () => {
      try {
        const session = await getSession()
        if (session === null || session === hydratedSession) return
        links.value = await loadGoalLinks(session)
        hydratedSession = session
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

  return {
    links: computed(() => links.value),
    hydrate,
    apply,
  }
}
