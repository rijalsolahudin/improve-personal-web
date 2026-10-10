import { breakpoints } from '@improve-personal/tokens'

const SIDEBAR_STORAGE_KEY = 'ip-sb'

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

export function useSidebar() {
  const isCollapsed = useState<boolean>('sidebar-collapsed', readInitialCollapsed)

  function toggle(): void {
    isCollapsed.value = !isCollapsed.value
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, isCollapsed.value ? '1' : '0')
    } catch {
      // Abaikan: preferensi cuma berlaku di sesi ini.
    }
  }

  return { isCollapsed: readonly(isCollapsed), toggle }
}
