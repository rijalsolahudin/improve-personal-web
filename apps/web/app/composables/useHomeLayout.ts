import {
  defaultHomeLayout,
  isSameLayout,
  parseHomeLayout,
  type HomeLayout,
} from '~/utils/homeLayout'

/**
 * Preferensi tampilan (bukan data sensitif) → localStorage. Nanti pindah ke packages/core
 * supaya ikut sync antar perangkat; isi storage selalu divalidasi lewat `parseHomeLayout`.
 */
export const HOME_LAYOUT_STORAGE_KEY = 'ip-home-layout'

function readStoredLayout(): HomeLayout {
  if (!import.meta.client) return defaultHomeLayout()
  try {
    const stored = localStorage.getItem(HOME_LAYOUT_STORAGE_KEY)
    return stored ? parseHomeLayout(JSON.parse(stored)) : defaultHomeLayout()
  } catch {
    // JSON rusak atau storage diblokir: mulai dari default.
    return defaultHomeLayout()
  }
}

function writeStoredLayout(layout: HomeLayout): void {
  try {
    localStorage.setItem(HOME_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Storage penuh/diblokir: layout tetap berlaku untuk sesi ini.
  }
}

export function useHomeLayout() {
  const layout = useState<HomeLayout>('home-layout', readStoredLayout)
  const isEditing = useState<boolean>('home-layout-editing', () => false)

  /** `persist: false` dipakai selama drag supaya tidak menulis storage tiap pointermove. */
  function update(next: HomeLayout, { persist = true } = {}): void {
    if (isSameLayout(next, layout.value)) return
    layout.value = next
    if (persist) writeStoredLayout(next)
  }

  function commit(): void {
    writeStoredLayout(layout.value)
  }

  function reset(): void {
    update(defaultHomeLayout())
  }

  function setEditing(next: boolean): void {
    isEditing.value = next
  }

  return {
    layout: readonly(layout),
    isEditing: readonly(isEditing),
    update,
    commit,
    reset,
    setEditing,
  }
}
