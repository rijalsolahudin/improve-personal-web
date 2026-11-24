import { palette, themes } from '@improve-personal/tokens'

import { MOBILE_THEMES, createTheme, resolvePaletteVars } from './theme'

describe('createTheme', () => {
  it.each(MOBILE_THEMES)('memakai warna tema %s dari tokens', (name) => {
    const theme = createTheme(name)

    expect(theme.colors.primary).toBe(themes[name].primary)
    expect(theme.colors.ink).toBe(palette.ink)
  })

  it('mengubah token CSS jadi angka untuk RN', () => {
    const theme = createTheme('kuning')

    expect(theme.radius.card).toBe(22)
    expect(theme.layout.tapMin).toBe(44)
    expect(theme.fontSize.body).toBe(15)
    expect(theme.durationMs).toBe(200)
  })

  it('bayangan tidak menyisakan var CSS', () => {
    expect(createTheme('hijau').shadow.drop).not.toContain('var(')
  })
})

describe('resolvePaletteVars', () => {
  it('membiarkan var yang tidak ada di palet', () => {
    expect(resolvePaletteVars('0 1px 0 var(--tidak-ada)')).toBe('0 1px 0 var(--tidak-ada)')
  })
})
