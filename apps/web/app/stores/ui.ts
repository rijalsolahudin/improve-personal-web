import { breakpoints } from '@improve-personal/tokens'

export const SIDEBAR_STORAGE_KEY = 'ip-sb'

function readInitialCollapsed(): boolean {
  if (!import.meta.client) return false
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (stored === '1' || stored === '0') return stored === '1'
  } catch {
    // Storage tidak tersedia: pakai default berdasarkan lebar layar.
  }
  // Design: sidebar otomatis ciut di bawah 1200px kecuali user memilih sendiri.
  return window.matchMedia(`(max-width: ${breakpoints.sidebarExpanded - 1}px)`).matches
}

/**
 * UI state lintas fitur (ADR 9) - bukan data core, cuma tampilan. Route `/app/**` dirender di
 * client (`ssr: false`), jadi nilai awal boleh dibaca dari localStorage saat store dibuat.
 */
export const useUiStore = defineStore('ui', () => {
  /** Sidebar shell app ciut atau tidak. */
  const isCollapsed = ref(readInitialCollapsed())
  /** Popover "Tampilan": bisa dibuka dari header maupun menu akun ("Preferensi"). */
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
