import { DEFAULT_THEME, THEME_NAMES, type ThemeName } from '@improve-personal/tokens'

/** Preferensi tampilan saja (bukan data sensitif), jadi aman di localStorage. */
export const THEME_STORAGE_KEY = 'ip-theme'

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && (THEME_NAMES as readonly string[]).includes(value)
}

export function useColorTheme() {
  const theme = useState<ThemeName>('color-theme', () => DEFAULT_THEME)

  function setTheme(next: ThemeName): void {
    theme.value = next
    if (!import.meta.client) return
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Storage bisa diblokir (mode privat); tema tetap berlaku untuk sesi ini.
    }
  }

  function cycleTheme(): void {
    const index = THEME_NAMES.indexOf(theme.value)
    setTheme(THEME_NAMES[(index + 1) % THEME_NAMES.length] ?? DEFAULT_THEME)
  }

  return { theme: readonly(theme), themes: THEME_NAMES, setTheme, cycleTheme }
}
