import { describe, expect, it } from 'vitest'

import { THEME_COLOR_KEYS, THEME_NAMES, palette, themes } from './colors.ts'
import { toCssVariables } from './css.ts'

describe('toCssVariables', () => {
  const css = toCssVariables()

  it('menaruh tema default (kuning) dan palet tetap di :root', () => {
    const root = css.slice(css.indexOf(':root'), css.indexOf('}'))
    expect(root).toContain(`--bg: ${themes.kuning.bg};`)
    expect(root).toContain(`--ink: ${palette.ink};`)
    expect(root).toContain('--radius-leaf: 13px 13px 13px 5px;')
  })

  it('membuat blok override untuk tiap tema non-default', () => {
    for (const name of THEME_NAMES.filter((theme) => theme !== 'kuning')) {
      expect(css).toContain(`[data-theme='${name}'] {`)
      expect(css).toContain(`--accent: ${themes[name].accent};`)
    }
    expect(css).not.toContain(`[data-theme='kuning']`)
  })

  it('merender alias semantik sebagai referensi var()', () => {
    expect(css).toContain('--surface-page: var(--bg);')
    expect(css).toContain('--action: var(--accent);')
  })

  it('tiap tema punya set key yang sama persis (tidak ada token bocor antar tema)', () => {
    const keys = [...THEME_COLOR_KEYS].sort()
    for (const name of THEME_NAMES) expect(Object.keys(themes[name]).sort()).toEqual(keys)
  })
})
