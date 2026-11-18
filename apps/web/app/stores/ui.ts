export const SIDEBAR_STORAGE_KEY = 'ip-sb'

/** Sidebar ciut kecuali user pernah membukanya sendiri (pilihan tersimpan selalu dihormati). */
const DEFAULT_COLLAPSED = true

function readInitialCollapsed(): boolean {
  if (!import.meta.client) return DEFAULT_COLLAPSED
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (stored === '1' || stored === '0') return stored === '1'
  } catch {
    // Storage tidak tersedia: pakai default.
  }
  return DEFAULT_COLLAPSED
}

/**
 * UI state lintas fitur (ADR 9) - bukan data core, cuma tampilan. Route `/app/**` dirender di
 * client (`ssr: false`), jadi nilai awal boleh dibaca dari localStorage saat store dibuat.
 */
export const useUiStore = defineStore('ui', () => {
  /** Sidebar shell app ciut atau tidak. */
  const isCollapsed = ref(readInitialCollapsed())
  /** Modal "Tampilan" global: dibuka dari menu Profil (desktop) atau menu HP. */
  const isPickerOpen = ref(false)

  function toggleSidebar(): void {
    isCollapsed.value = !isCollapsed.value
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, isCollapsed.value ? '1' : '0')
    } catch {
      // Abaikan: preferensi cuma berlaku di sesi ini.
    }
  }

  return { isCollapsed, isPickerOpen, toggleSidebar }
})
