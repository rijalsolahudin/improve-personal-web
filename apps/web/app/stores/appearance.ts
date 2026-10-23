import {
  DEFAULT_STYLE,
  DEFAULT_THEME,
  STYLE_NAMES,
  THEME_NAMES,
  type StyleName,
  type ThemeName,
} from '@improve-personal/tokens'

import {
  APPEARANCE_OWNER_STORAGE_KEY,
  STYLE_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from '#shared/appearance'

/**
 * Preferensi tampilan (PRD F16): tema warna + gaya, dua pilihan independen.
 *
 * Sumber kebenaran pilihan user adalah record `user_prefs` per akun (lihat `useAppearancePrefs`) supaya
 * bertahan setelah restart DAN ikut sync antar perangkat. Store ini menyimpan state untuk render plus
 * cache `localStorage` yang dipakai skrip pra-render (`shared/appearance.ts`) agar paint pertama tidak
 * kedip. Cache itu diberi tanda pemilik (`ip-appearance-owner`) supaya pilihan akun A tidak terbawa ke
 * akun B di browser yang sama.
 */

export { APPEARANCE_OWNER_STORAGE_KEY, STYLE_STORAGE_KEY, THEME_STORAGE_KEY }

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

function writeStored(key: string, value: string | null): void {
  if (!import.meta.client) return
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage bisa diblokir (mode privat); pilihan tetap berlaku untuk sesi ini.
  }
}

export const useAppearanceStore = defineStore('appearance', () => {
  const theme = ref<ThemeName>(DEFAULT_THEME)
  const style = ref<StyleName>(DEFAULT_STYLE)
  /** Akun pemilik cache tampilan; `null` = belum ada pilihan yang bisa dipastikan pemiliknya. */
  const ownerUserId = ref<string | null>(readStored(APPEARANCE_OWNER_STORAGE_KEY))

  function cache(nextTheme: ThemeName, nextStyle: StyleName): void {
    writeStored(THEME_STORAGE_KEY, nextTheme)
    writeStored(STYLE_STORAGE_KEY, nextStyle)
  }

  function setOwner(userId: string | null): void {
    ownerUserId.value = userId
    writeStored(APPEARANCE_OWNER_STORAGE_KEY, userId)
  }

  function setTheme(next: ThemeName): void {
    theme.value = next
    cache(next, style.value)
  }

  function setStyle(next: StyleName): void {
    style.value = next
    cache(theme.value, next)
  }

  /**
   * Pasang pilihan yang berasal dari record `user_prefs` (atau default saat akun belum punya record).
   * Cache ikut ditulis supaya paint berikutnya langsung benar.
   */
  function applyPrefs(next: { theme: ThemeName; style: StyleName }, userId: string | null): void {
    theme.value = next.theme
    style.value = next.style
    cache(next.theme, next.style)
    setOwner(userId)
  }

  /**
   * Cache hanya boleh dipakai kalau pemiliknya akun yang sedang login. Akun baru di browser yang sama
   * mulai dari default (PRD F16: pilihan tersimpan PER AKUN), lalu record akun itu yang menimpa.
   */
  function adopt(userId: string | null): void {
    if (ownerUserId.value === userId) return
    applyPrefs({ theme: DEFAULT_THEME, style: DEFAULT_STYLE }, userId)
  }

  /** Logout / akun dilepas: cache milik akun sebelumnya tidak boleh jadi pilihan akun berikutnya. */
  function forget(): void {
    theme.value = DEFAULT_THEME
    style.value = DEFAULT_STYLE
    writeStored(THEME_STORAGE_KEY, null)
    writeStored(STYLE_STORAGE_KEY, null)
    setOwner(null)
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
    ownerUserId.value = readStored(APPEARANCE_OWNER_STORAGE_KEY)
  }

  return {
    theme,
    style,
    ownerUserId,
    setTheme,
    setStyle,
    applyPrefs,
    adopt,
    forget,
    restore,
  }
})
