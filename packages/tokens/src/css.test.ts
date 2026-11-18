import { describe, expect, it } from 'vitest'

import { THEME_COLOR_KEYS, THEME_NAMES, palette, themes } from './colors.ts'
import { toCssVariables } from './css.ts'
import { DEFAULT_STYLE, STYLE_NAMES, uiStyles } from './styles.ts'

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
    expect(root).toContain(`--outline: ${uiStyles[DEFAULT_STYLE].outline};`)
  })

  it('tidak mendeklarasikan token yang sama dua kali di :root', () => {
    const root = css.slice(css.indexOf(':root'), css.indexOf('}'))
    const names = [...root.matchAll(/--([\w-]+):/g)].map((match) => match[1])
    expect(new Set(names).size).toBe(names.length)
  })

  it('membuat blok override untuk tiap gaya non-default, aksen per tema pakai selector gabungan', () => {
    for (const name of STYLE_NAMES.filter((style) => style !== DEFAULT_STYLE)) {
      expect(css).toContain(`[data-style='${name}'] {`)
      expect(css).toContain(`--rk: ${uiStyles[name].radiusScale};`)
    }
    expect(css).toContain(`[data-style='elegan'][data-theme='ungu'] {`)
    expect(css).not.toContain(`[data-style='${DEFAULT_STYLE}']`)
    expect(css).not.toContain(`[data-style='cute-pure'] [data-deco-builtin]`)
  })

  it('gaya non-default mengembalikan grid & warna bayangan yang ditimpa gaya default di :root', () => {
    const root = css.slice(css.indexOf(':root'), css.indexOf('}'))
    expect(root).toContain('--grid-line: transparent;')
    expect(root).toContain(`--shadow-color: ${uiStyles[DEFAULT_STYLE].shadow.color};`)

    const cute = css.slice(css.indexOf(`[data-style='cute'] {`))
    const body = cute.slice(0, cute.indexOf('}'))
    expect(body).toContain('--grid-line: var(--grid);')
    expect(body).toContain('--shadow-color: initial;')
  })

  it('gaya tanpa dekorasi mematikan pola titik dan dekorasi', () => {
    const kertas = css.slice(css.indexOf(`[data-style='kertas'] {`))
    expect(kertas).toContain(`[data-style='kertas'] [data-deco-builtin] {`)
    expect(kertas).toContain('--pattern-dots: none;')
    expect(kertas).toContain('--grid: transparent;')
    expect(kertas).toContain('--nav-icon-bg: transparent;')
  })

  it('ukuran font & spasi dikali pengali gaya, dengan pengali 1 di gaya default', () => {
    const root = css.slice(css.indexOf(':root'), css.indexOf('}'))
    expect(root).toContain('--fs-13: calc(13px * var(--fk));')
    expect(root).toContain('--fs-display-30: calc(30px * var(--fk-display));')
    expect(root).toContain('--fs-hand-19: calc(19px * var(--fk-hand));')
    expect(root).toContain('--space-12: calc(12px * var(--dk));')
    expect(root).toContain('--fs-h1: var(--fs-display-30);')
    for (const name of ['fk', 'fk-display', 'fk-hand', 'dk'])
      expect(root).toContain(`--${name}: 1;`)
    expect(root).toContain('--radius-pill: var(--pill);')
    expect(root).toContain('--pill: 999px;')
    expect(root).toContain('--fsa: 0.51;')
  })

  it('tiap gaya non-default menyetel pengali ukuran & radius pill-nya sendiri', () => {
    for (const name of STYLE_NAMES.filter((style) => style !== DEFAULT_STYLE)) {
      const block = css.slice(css.indexOf(`[data-style='${name}'] {`))
      const body = block.slice(0, block.indexOf('}'))
      const { typeScale, density, pillRadius, fontSizeAdjust } = uiStyles[name]
      expect(body).toContain(`--fk: ${typeScale.ui};`)
      expect(body).toContain(`--fk-display: ${typeScale.display};`)
      expect(body).toContain(`--fk-hand: ${typeScale.hand};`)
      expect(body).toContain(`--dk: ${density};`)
      expect(body).toContain(`--pill: ${pillRadius};`)
      expect(body).toContain(`--fsa: ${fontSizeAdjust};`)
    }
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
