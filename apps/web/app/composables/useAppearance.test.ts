import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { STYLE_STORAGE_KEY, THEME_STORAGE_KEY } from '~/stores/appearance'

import { useAppearance } from './useAppearance'

describe('useAppearance', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('default Cute + Kuning (PRD F16)', () => {
    const { theme, style } = useAppearance()
    expect(theme.value).toBe('kuning')
    expect(style.value).toBe('cute')
  })

  it('tema & gaya independen dan tersimpan', () => {
    const { theme, style, setTheme, setStyle } = useAppearance()
    setStyle('elegan')
    setTheme('ungu')
    expect(style.value).toBe('elegan')
    expect(theme.value).toBe('ungu')
    expect(localStorage.getItem(STYLE_STORAGE_KEY)).toBe('elegan')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('ungu')
  })

  it('restore mengabaikan nilai yang tidak dikenal', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'merah')
    localStorage.setItem(STYLE_STORAGE_KEY, '<script>')
    const { theme, style, restore } = useAppearance()
    restore()
    expect(theme.value).toBe('kuning')
    expect(style.value).toBe('cute')

    localStorage.setItem(THEME_STORAGE_KEY, 'hijau')
    localStorage.setItem(STYLE_STORAGE_KEY, 'tegas')
    restore()
    expect(theme.value).toBe('hijau')
    expect(style.value).toBe('tegas')
  })

  it('popover "Tampilan" dibagi satu store lintas komponen', () => {
    const { isPickerOpen } = useAppearance()
    expect(isPickerOpen.value).toBe(false)
    isPickerOpen.value = true
    expect(useAppearance().isPickerOpen.value).toBe(true)
  })
})
