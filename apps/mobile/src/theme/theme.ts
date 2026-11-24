import {
  border,
  motion,
  palette,
  radius,
  shadow,
  space,
  themes,
  typography,
  type ThemeColors,
} from '@improve-personal/tokens'

import { FONT_FAMILY } from './fonts'
import { tokenPx } from './tokenPx'

/** Tema yang dirilis di mobile (rencana #181 F5); tema lain di tokens menyusul. */
export const MOBILE_THEMES = ['kuning', 'hijau', 'ungu'] as const
export type MobileThemeName = (typeof MOBILE_THEMES)[number]
export const DEFAULT_MOBILE_THEME: MobileThemeName = 'kuning'

/**
 * Anak tangga spasi, nilainya sama dengan `SPACE_STEPS` di tokens. `SPACE_STEPS` belum diekspor dari
 * barrel `@improve-personal/tokens`, jadi di sini hanya anak tangga yang dipakai (#181: minta export).
 */
const SPACING = {
  4: 4,
  6: 6,
  8: 8,
  10: 10,
  12: 12,
  14: 14,
  16: 16,
  20: 20,
  24: 24,
  32: 32,
} as const

/** Radius pill penuh (tokens: `FULL_PILL`) - dipakai chip, segmented, dock. */
const PILL_RADIUS = 999

/** Umpan balik sentuh instan (<= 100 ms, performance.md) tanpa animasi di JS thread. */
const PRESSED_OPACITY = 0.85

const MS_PER_SECOND = 1000

export type Theme = Readonly<{
  name: MobileThemeName
  colors: ThemeColors & typeof palette
  spacing: typeof SPACING
  radius: Readonly<{
    panel: number
    card: number
    hero: number
    row: number
    inner: number
    sticker: number
    tabbar: number
    btnSquare: number
    pill: number
  }>
  border: Readonly<{ thin: number; base: number; thick: number }>
  layout: Readonly<{ gap: number; tapMin: number }>
  fonts: typeof FONT_FAMILY
  fontSize: Readonly<{
    h1: number
    h2: number
    h3: number
    bodyLg: number
    body: number
    bodySm: number
    caption: number
    meta: number
    eyebrow: number
  }>
  shadow: Readonly<{ drop: string }>
  pressedOpacity: number
  /** Durasi transisi standar (tokens `motion.dur`) dalam ms untuk Animated. */
  durationMs: number
}>

export function createTheme(name: MobileThemeName): Theme {
  return {
    name,
    colors: { ...themes[name], ...palette },
    spacing: SPACING,
    radius: {
      panel: tokenPx(radius['radius-panel']),
      card: tokenPx(radius['radius-card']),
      hero: tokenPx(radius['radius-hero']),
      row: tokenPx(radius['radius-row']),
      inner: tokenPx(radius['radius-inner']),
      sticker: tokenPx(radius['radius-sticker']),
      tabbar: tokenPx(radius['radius-tabbar']),
      btnSquare: tokenPx(radius['radius-btn-sq']),
      pill: PILL_RADIUS,
    },
    border: {
      thin: tokenPx(border['border-thin']),
      base: tokenPx(border.border),
      thick: tokenPx(border['border-thick']),
    },
    layout: {
      gap: tokenPx(space['gap-mobile']),
      tapMin: tokenPx(space['tap-min']),
    },
    fonts: FONT_FAMILY,
    fontSize: {
      h1: tokenPx(typography['fs-h1']),
      h2: tokenPx(typography['fs-h2']),
      h3: tokenPx(typography['fs-h3']),
      bodyLg: tokenPx(typography['fs-body-lg']),
      body: tokenPx(typography['fs-body']),
      bodySm: tokenPx(typography['fs-body-sm']),
      caption: tokenPx(typography['fs-caption']),
      meta: tokenPx(typography['fs-meta']),
      eyebrow: tokenPx(typography['fs-eyebrow']),
    },
    // Bayangan keras tanpa blur; RN New Arch membaca `boxShadow` berformat CSS.
    shadow: { drop: resolvePaletteVars(shadow['shadow-drop']) },
    pressedOpacity: PRESSED_OPACITY,
    durationMs: Number.parseFloat(motion.dur) * MS_PER_SECOND,
  }
}

const CSS_VAR = /var\(--([a-z-]+)\)/g

/** Ganti `var(--x)` dengan nilai palet - RN tidak punya CSS custom property. */
export function resolvePaletteVars(value: string): string {
  return value.replace(CSS_VAR, (whole, key: string) =>
    key in palette ? palette[key as keyof typeof palette] : whole,
  )
}
