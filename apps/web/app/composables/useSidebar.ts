/**
 * Sidebar shell app: state-nya di `useUiStore`, ini cuma jembatan supaya komponen tetap memakai
 * API yang sama. Hanya dibaca - mengubahnya lewat `toggle()`.
 */
export function useSidebar() {
  const ui = useUiStore()

  return {
    isCollapsed: computed(() => ui.isCollapsed),
    toggle: ui.toggleSidebar,
  }
}
