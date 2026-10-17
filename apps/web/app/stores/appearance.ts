import {
  DEFAULT_STYLE,
  DEFAULT_THEME,
  STYLE_NAMES,
  THEME_NAMES,
  type StyleName,
  type ThemeName,
} from '@improve-personal/tokens'

/** Preferensi tampilan saja (bukan data sensitif), jadi aman di localStorage. */
export const THEME_STORAGE_KEY = 'ip-theme'
export const STYLE_STORAGE_KEY = 'ip-style'

/** PRD F16: tema & gaya divalidasi terhadap daftar putih; nilai asing diabaikan. */
function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && (THEME_NAMES as readonly string[]).includes(value)
}

function isStyleName(value: unknown): value is StyleName {
  return typeof value === 'string' && (STYLE_NAMES as readonly string[]).includes(value)
}

function readStored(key: string): string | null {
  if (!import.meta.client) return null
  try {
    return localStorage.getItem(key)
  } catch {
    // Storage diblokir (mode privat): pakai tampilan default.
    return null
  }
}

function persist(key: string, value: string): void {
  if (!import.meta.client) return
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage bisa diblokir (mode privat); pilihan tetap berlaku untuk sesi ini.
  }
}

/** Tema warna (palet) + gaya (karakter visual) - dua pilihan independen (PRD F16). */
export const useAppearanceStore = defineStore('appearance', () => {
  const theme = ref<ThemeName>(DEFAULT_THEME)
  const style = ref<StyleName>(DEFAULT_STYLE)

  function setTheme(next: ThemeName): void {
    theme.value = next
    persist(THEME_STORAGE_KEY, next)
  }

  function setStyle(next: StyleName): void {
    style.value = next
    persist(STYLE_STORAGE_KEY, next)
  }

  /**
   * Muat pilihan tersimpan. Dipanggil setelah hydration: di route yang di-prerender, state di sini
   * sudah ditimpa payload hasil build, jadi localStorage harus dibaca ulang.
   * Nilai yang tidak dikenal diabaikan (tetap default).
   */
  function restore(): void {
    const storedTheme = readStored(THEME_STORAGE_KEY)
    const storedStyle = readStored(STYLE_STORAGE_KEY)
    if (isThemeName(storedTheme)) theme.value = storedTheme
    if (isStyleName(storedStyle)) style.value = storedStyle
  }

  return { theme, style, setTheme, setStyle, restore }
})
