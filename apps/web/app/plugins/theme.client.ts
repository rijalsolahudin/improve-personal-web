function readStoredTheme(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    // Storage diblokir (mode privat): pakai tema default.
    return null
  }
}

export default defineNuxtPlugin({
  name: 'color-theme',
  parallel: true,
  setup() {
    const stored = readStoredTheme()
    if (isThemeName(stored)) useColorTheme().setTheme(stored)
  },
})
