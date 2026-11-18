import { THEME_NAMES } from '@improve-personal/tokens'

/**
 * Tema warna (palet) + gaya (karakter visual) - dua pilihan independen (PRD F16).
 * State-nya di `useAppearanceStore` / `useUiStore`; ini cuma jembatan supaya komponen tetap
 * memakai API yang sama (ADR 9: komponen tidak menyentuh repo/store secara langsung).
 */
export function useAppearance() {
  const appearance = useAppearanceStore()
  const ui = useUiStore()
  const { theme, style } = storeToRefs(appearance)
  const { isPickerOpen } = storeToRefs(ui)

  return {
    theme: readonly(theme),
    style: readonly(style),
    themes: THEME_NAMES,
    /** Writable: dibuka ShellUserMenu / ShellMenuSheet, ditutup AppearanceDialog. */
    isPickerOpen,
    setTheme: appearance.setTheme,
    setStyle: appearance.setStyle,
    restore: appearance.restore,
  }
}
