/**
 * QA T25 (F16) - token tampilan: 3 tema × 7 gaya.
 *
 * Yang dibuktikan di sini adalah kontrak yang bisa dibaca dari CSS hasil build, bukan detail
 * implementasi komponen: tema/gaya mana yang ada, apakah tiap kombinasi punya nilai lengkap, dan
 * apakah ganti gaya hanya mengganti token visual (font/radius/border/bayangan/warna) - bukan token
 * layout, karena token layout yang ikut berganti berarti halaman bergeser saat gaya diganti.
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_THEME, THEME_COLOR_KEYS, THEME_NAMES, palette, themes } from './colors.ts'
import { toCssVariables } from './css.ts'
import { DEFAULT_STYLE, STYLE_FONT_FAMILIES, STYLE_NAMES, uiStyles } from './styles.ts'

const css = toCssVariables()

/** Font yang sudah dimuat untuk gaya default (Baloo 2, Nunito, Patrick Hand). */
const DEFAULT_FONTS = new Set(['Baloo 2', 'Nunito', 'Patrick Hand'])
/** Fallback generik CSS - bukan berkas font. */
const GENERIC_FAMILIES = new Set(['sans-serif', 'serif', 'monospace', 'cursive', 'system-ui'])

function familyNames(fontStack: string): string[] {
  return fontStack
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter((name) => name.length > 0 && !name.startsWith('var(') && !GENERIC_FAMILIES.has(name))
}

/** Isi deklarasi di dalam blok `[data-style='<name>'] { ... }`. */
function styleBlock(gaya: string): string {
  const start = css.indexOf(`[data-style='${gaya}'] {`)
  if (start < 0) throw new Error(`blok gaya tidak ditemukan: ${gaya}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

function declarations(block: string): string[] {
  return [...block.matchAll(/--([\w-]+):/g)]
    .map((m) => m[1] ?? '')
    .filter((nama) => nama.length > 0)
}

describe('token tampilan (F16)', () => {
  it('menyediakan tepat 3 tema warna dan 7 gaya sesuai PRD', () => {
    expect([...THEME_NAMES]).toEqual(['kuning', 'hijau', 'ungu'])
    expect([...STYLE_NAMES]).toEqual([
      'cute',
      'cute-pure',
      'kertas',
      'simple',
      'elegan',
      'vintage',
      'tegas',
    ])
  })

  it('default Cute + Kuning', () => {
    expect(DEFAULT_THEME).toBe('kuning')
    expect(DEFAULT_STYLE).toBe('cute')
    expect(THEME_NAMES[0]).toBe(DEFAULT_THEME)
    expect(STYLE_NAMES[0]).toBe(DEFAULT_STYLE)
  })

  it('tiap tema punya seluruh token warna (tidak ada token bocor antar tema)', () => {
    for (const tema of THEME_NAMES) {
      expect(Object.keys(themes[tema]).sort()).toEqual([...THEME_COLOR_KEYS].sort())
    }
  })

  it('tiap gaya mendefinisikan font, bobot, radius, border, bayangan, pola & dekorasi', () => {
    for (const gaya of STYLE_NAMES) {
      const definisi = uiStyles[gaya]
      for (const font of [definisi.fonts.display, definisi.fonts.body, definisi.fonts.hand]) {
        expect(font.trim().length).toBeGreaterThan(0)
      }
      for (const bobot of Object.values(definisi.weights)) {
        expect(bobot).toMatch(/^\d{3}$/)
      }
      expect(definisi.radiusScale).toBeGreaterThanOrEqual(0)
      expect(definisi.borderScale).toBeGreaterThanOrEqual(0)
      expect(definisi.shadow.blur).toBeGreaterThanOrEqual(0)
      expect(typeof definisi.isPatterned).toBe('boolean')
      expect(typeof definisi.isDecorated).toBe('boolean')
    }
  })

  it('font non-default tiap gaya terdaftar untuk lazy-load, font default tidak ikut daftar', () => {
    const terdaftar = new Set<string>(STYLE_FONT_FAMILIES.map((font) => font.name))
    const dipakaiGaya = new Set<string>()

    for (const gaya of STYLE_NAMES) {
      for (const stack of Object.values(uiStyles[gaya].fonts)) {
        for (const nama of familyNames(stack)) dipakaiGaya.add(nama)
      }
    }

    for (const nama of dipakaiGaya) {
      if (DEFAULT_FONTS.has(nama)) continue
      expect(
        terdaftar.has(nama),
        `font "${nama}" dipakai gaya tapi tidak ada di STYLE_FONT_FAMILIES`,
      ).toBe(true)
    }
    // Font yang cuma dipakai gaya non-default tidak boleh ikut preload default.
    for (const nama of terdaftar) expect(DEFAULT_FONTS.has(nama)).toBe(false)
    // Cute & Cute Pure memakai keluarga font yang sama (desain), enam gaya lain berbeda.
    expect(uiStyles['cute'].fonts).toEqual(uiStyles['cute-pure'].fonts)
    const bodyFonts = new Set(STYLE_NAMES.map((gaya) => uiStyles[gaya].fonts.body))
    expect(bodyFonts.size).toBe(6)
  })

  it('CSS menaruh tema & gaya default di :root dan override lewat [data-theme]/[data-style]', () => {
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}'))
    expect(root).toContain(`--bg: ${themes.kuning.bg};`)
    expect(root).toContain('--rk: 1;')
    expect(root).toContain('--bk: 1;')

    for (const tema of THEME_NAMES.filter((nama) => nama !== 'kuning')) {
      expect(css).toContain(`[data-theme='${tema}'] {`)
      expect(css).toContain(`--accent: ${themes[tema].accent};`)
    }
    for (const gaya of STYLE_NAMES.filter((nama) => nama !== 'cute')) {
      expect(css).toContain(`[data-style='${gaya}'] {`)
      expect(css).toContain(`--rk: ${uiStyles[gaya].radiusScale};`)
    }
    // Gaya default tidak butuh blok sendiri: nilainya sudah di :root.
    expect(css).not.toContain(`[data-style='cute']`)
  })

  it('gaya yang mengubah palet mendapat aksen per tema lewat selector gabungan', () => {
    const bergaya = STYLE_NAMES.filter((gaya) => uiStyles[gaya].brand !== null)
    expect(bergaya.length).toBeGreaterThanOrEqual(6)
    for (const gaya of bergaya) {
      for (const tema of THEME_NAMES.filter((nama) => nama !== 'kuning')) {
        expect(css).toContain(`[data-style='${gaya}'][data-theme='${tema}'] {`)
      }
    }
  })

  it('dekorasi bawaan (washi tape/maskot) hanya tampil di Cute & Cute Pure', () => {
    expect(STYLE_NAMES.filter((gaya) => uiStyles[gaya].isDecorated)).toEqual(['cute', 'cute-pure'])
    for (const gaya of STYLE_NAMES.filter((nama) => !uiStyles[nama].isDecorated)) {
      expect(css).toContain(`[data-style='${gaya}'] [data-deco-builtin] {`)
    }
    expect(css).not.toContain(`[data-style='cute'] [data-deco-builtin]`)
    expect(css).not.toContain(`[data-style='cute-pure'] [data-deco-builtin]`)
  })

  it('ganti gaya tidak mengubah token layout (tanpa layout shift)', () => {
    // Token geometri: spasi, ukuran font, line-height, tracking, target tap, ukuran grid latar.
    const tokenLayout = /^(space-|gap-|fs-|lh-|tracking-|tap-min|grid-(desktop|mobile)$)/
    const pelanggaran: string[] = []

    for (const gaya of STYLE_NAMES.filter((nama) => nama !== DEFAULT_STYLE)) {
      const blok = styleBlock(gaya)
      for (const nama of declarations(blok)) {
        if (tokenLayout.test(nama)) pelanggaran.push(`${gaya}: --${nama}`)
      }
    }
    expect(pelanggaran).toEqual([])
  })

  it('setiap kombinasi gaya × tema punya nilai untuk seluruh token warna', () => {
    for (const gaya of STYLE_NAMES) {
      for (const tema of THEME_NAMES) {
        const nilai: Record<string, string> = {
          ...palette,
          ...themes[tema],
          ...uiStyles[gaya].neutrals,
          ...(uiStyles[gaya].brand?.[tema] ?? {}),
        }
        for (const key of THEME_COLOR_KEYS) {
          expect(nilai[key], `${gaya}/${tema}: --${key} kosong`).toBeTruthy()
        }
      }
    }
  })

  it('tema tetap mengubah aksen di semua gaya berwarna (bukan cuma nilai kertas)', () => {
    for (const gaya of STYLE_NAMES.filter((nama) => nama !== 'kertas')) {
      const aksen = THEME_NAMES.map(
        (tema) => uiStyles[gaya].brand?.[tema]?.['accent'] ?? themes[tema].accent,
      )
      expect(new Set(aksen).size, `${gaya} mengabaikan pilihan tema`).toBeGreaterThan(1)
    }
  })
})
