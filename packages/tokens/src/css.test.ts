import { describe, expect, it } from 'vitest'

import { THEME_COLOR_KEYS, THEME_NAMES, palette, themes } from './colors.ts'
import { toCssVariables } from './css.ts'
import { STYLE_NAMES, uiStyles } from './styles.ts'

describe('toCssVariables', () => {
  const css = toCssVariables()

  it('menaruh tema default (kuning) dan palet tetap di :root', () => {
    const root = css.slice(css.indexOf(':root'), css.indexOf('}'))
    expect(root).toContain(`--bg: ${themes.kuning.bg};`)
    expect(root).toContain(`--ink: ${palette.ink};`)
    expect(root).toContain(
      '--radius-leaf: calc(13px * var(--rk)) calc(13px * var(--rk)) calc(13px * var(--rk)) calc(5px * var(--rk));',
    )
    expect(root).toContain('--rk: 1;')
    expect(root).toContain('--outline: var(--ink);')
  })

  it('tidak mendeklarasikan token yang sama dua kali di :root', () => {
    const root = css.slice(css.indexOf(':root'), css.indexOf('}'))
    const names = [...root.matchAll(/--([\w-]+):/g)].map((match) => match[1])
    expect(new Set(names).size).toBe(names.length)
  })

  it('membuat blok override untuk tiap gaya non-default, aksen per tema pakai selector gabungan', () => {
    for (const name of STYLE_NAMES.filter((style) => style !== 'cute')) {
      expect(css).toContain(`[data-style='${name}'] {`)
      expect(css).toContain(`--rk: ${uiStyles[name].radiusScale};`)
    }
    expect(css).toContain(`[data-style='elegan'][data-theme='ungu'] {`)
    expect(css).not.toContain(`[data-style='cute']`)
    expect(css).not.toContain(`[data-style='cute-pure'] [data-deco-builtin]`)
  })

  it('gaya tanpa dekorasi mematikan pola titik dan dekorasi', () => {
    const kertas = css.slice(css.indexOf(`[data-style='kertas'] {`))
    expect(kertas).toContain(`[data-style='kertas'] [data-deco-builtin] {`)
    expect(kertas).toContain('--pattern-dots: none;')
    expect(kertas).toContain('--grid: transparent;')
    expect(kertas).toContain('--nav-icon-bg: transparent;')
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
