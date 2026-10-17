/**
 * Gaya tampilan (PRD F16 · Desktop.dc.html "Tampilan → Gaya"). Gaya independen dari tema warna:
 * gaya mengatur font, skala radius/border, bayangan, pola latar, dekorasi, dan ramp netral.
 * Semua dirender jadi CSS custom properties, jadi ganti gaya = ganti atribut `data-style`.
 */

import type { ThemeColorKey, ThemeName } from './colors.ts'

export const STYLE_NAMES = [
  'cute',
  'cute-pure',
  'kertas',
  'simple',
  'elegan',
  'vintage',
  'tegas',
] as const
export type StyleName = (typeof STYLE_NAMES)[number]
export const DEFAULT_STYLE: StyleName = 'cute'

type ColorOverrides = Readonly<Partial<Record<ThemeColorKey | 'ink', string>>>

export interface StyleDefinition {
  readonly fonts: Readonly<{ display: string; body: string; hand: string }>
  /** Bobot font: display = judul Baloo-equivalent, strong/body/medium = 800/700/600 di gaya Cute. */
  readonly weights: Readonly<{ display: string; strong: string; body: string; medium: string }>
  /** Pengali radius (`--rk`) dan ketebalan border (`--bk`). */
  readonly radiusScale: number
  readonly borderScale: number
  /** Warna outline kontrol; `null` = sama dengan `--ink`. */
  readonly outline: string | null
  /** Pengali offset bayangan (`--sx`/`--sy`), blur, dan warnanya (`null` = warna bawaan tiap komponen). */
  readonly shadow: Readonly<{ x: number; y: number; blur: number; color: string | null }>
  /** Pola kertas grafik di latar halaman. */
  readonly isPatterned: boolean
  /** Washi tape, dot grid, maskot (PRD F16: dekorasi bawaan hanya di Cute & Cute Pure). */
  readonly isDecorated: boolean
  /** Ramp netral (kertas, garis, teks redup) yang menimpa tema. */
  readonly neutrals: ColorOverrides
  /** Ramp aksen per tema; gaya Kertas memakai aksen monokrom yang sama untuk semua tema. */
  readonly brand: Readonly<Record<ThemeName, ColorOverrides>> | null
}

const CUTE_FONTS = {
  display: "'Baloo 2', 'Nunito', sans-serif",
  body: "'Nunito', sans-serif",
  hand: "'Patrick Hand', cursive",
} as const
const CUTE_WEIGHTS = { display: '800', strong: '800', body: '700', medium: '600' } as const
const HARD_SHADOW = { x: 0, y: 1, blur: 0, color: null } as const
const NO_SHADOW = { x: 0, y: 0, blur: 0, color: 'transparent' } as const

/** Aksen jenuh untuk gaya netral (Cute Pure, Simple, Tegas). */
const BRAND_BRIGHT = {
  kuning: {
    accent: '#EE6A1F',
    deep: '#C2520F',
    deeper: '#9A3F0A',
    soft: '#FDE4D3',
    hover: '#FEF1E8',
    primary: '#FDD9BF',
  },
  hijau: {
    accent: '#23935A',
    deep: '#1B7447',
    deeper: '#145837',
    soft: '#D9F0E2',
    hover: '#EEF8F2',
    primary: '#CDEBD9',
  },
  ungu: {
    accent: '#6D4AE0',
    deep: '#5535C0',
    deeper: '#41279A',
    soft: '#E6DEFB',
    hover: '#F3EFFD',
    primary: '#DCD2FA',
  },
} as const

/** `bell`/`bell-ring` ikut ramp netral di gaya non-Cute (design: bell = chip, bellRing = line). */
const withBell = (n: ColorOverrides & { chip: string; line: string }): ColorOverrides => ({
  ...n,
  bell: n.chip,
  'bell-ring': n.line,
})

export const uiStyles = {
  cute: {
    fonts: CUTE_FONTS,
    weights: CUTE_WEIGHTS,
    radiusScale: 1,
    borderScale: 1,
    outline: null,
    shadow: HARD_SHADOW,
    isPatterned: true,
    isDecorated: true,
    neutrals: {},
    brand: null,
  },
  'cute-pure': {
    fonts: CUTE_FONTS,
    weights: CUTE_WEIGHTS,
    radiusScale: 1,
    borderScale: 1,
    outline: null,
    shadow: HARD_SHADOW,
    isPatterned: true,
    isDecorated: true,
    neutrals: withBell({
      bg: '#FFFFFF',
      paper: '#FFFFFF',
      'paper-2': '#FFFFFF',
      alt: '#FAF8F5',
      chip: '#F4F1EC',
      line: '#ECE8E1',
      'line-2': '#F0ECE6',
      dash: '#E2DCD2',
      'dash-2': '#D6CEC1',
      mline: '#E9E4DC',
      'mute-3': '#A69D90',
      mute: '#82786A',
      'mute-2': '#71685B',
      'ink-2': '#4E463C',
      placeholder: '#C4BBAE',
      grid: 'rgba(47,42,36,.045)',
    }),
    brand: BRAND_BRIGHT,
  },
  kertas: {
    fonts: {
      display: "'DM Serif Display', serif",
      body: "'Work Sans', sans-serif",
      hand: "'DM Serif Display', serif",
    },
    weights: { display: '400', strong: '600', body: '500', medium: '500' },
    radiusScale: 0.55,
    borderScale: 0.6,
    outline: '#1E1E1E',
    shadow: NO_SHADOW,
    isPatterned: false,
    isDecorated: false,
    neutrals: withBell({
      bg: '#F6F5F0',
      paper: '#F6F5F0',
      'paper-2': '#F6F5F0',
      alt: '#F6F5F0',
      chip: '#ECEBE5',
      line: '#1E1E1E',
      'line-2': '#BDBCB5',
      dash: '#8F8E88',
      'dash-2': '#6E6D68',
      mline: '#CFCEC7',
      'mute-3': '#7A7974',
      mute: '#55554F',
      'mute-2': '#45453F',
      'ink-2': '#2A2A27',
      placeholder: '#A3A29C',
      ink: '#1E1E1E',
      grid: 'transparent',
    }),
    brand: {
      kuning: {
        accent: '#1E1E1E',
        deep: '#1E1E1E',
        deeper: '#1E1E1E',
        soft: '#E6E5DF',
        hover: '#EDECE6',
        primary: '#F6F5F0',
      },
      hijau: {
        accent: '#1E1E1E',
        deep: '#1E1E1E',
        deeper: '#1E1E1E',
        soft: '#E6E5DF',
        hover: '#EDECE6',
        primary: '#F6F5F0',
      },
      ungu: {
        accent: '#1E1E1E',
        deep: '#1E1E1E',
        deeper: '#1E1E1E',
        soft: '#E6E5DF',
        hover: '#EDECE6',
        primary: '#F6F5F0',
      },
    },
  },
  simple: {
    fonts: {
      display: "'DM Sans', sans-serif",
      body: "'DM Sans', sans-serif",
      hand: "'DM Sans', sans-serif",
    },
    weights: { display: '600', strong: '600', body: '700', medium: '600' },
    radiusScale: 0.6,
    borderScale: 0,
    outline: 'transparent',
    shadow: { x: 0, y: 0.4, blur: 4, color: 'rgba(30,30,28,.06)' },
    isPatterned: false,
    isDecorated: false,
    neutrals: withBell({
      bg: '#F6F6F4',
      paper: '#FFFFFF',
      'paper-2': '#FFFFFF',
      alt: '#FAFAF8',
      chip: '#F1F1EE',
      line: '#E9E9E5',
      'line-2': '#EEEEEA',
      dash: '#E0E0DB',
      'dash-2': '#D3D3CD',
      mline: '#E6E6E1',
      'mute-3': '#A2A29B',
      mute: '#74746D',
      'mute-2': '#64645D',
      'ink-2': '#3B3B36',
      placeholder: '#BDBDB6',
      ink: '#1F1F1C',
      grid: 'transparent',
    }),
    brand: BRAND_BRIGHT,
  },
  elegan: {
    fonts: {
      display: "'Cormorant Garamond', serif",
      body: "'Jost', sans-serif",
      hand: "'Cormorant Garamond', serif",
    },
    weights: { display: '600', strong: '500', body: '500', medium: '400' },
    radiusScale: 0.12,
    borderScale: 0.35,
    outline: 'rgba(43,38,34,.22)',
    shadow: NO_SHADOW,
    isPatterned: false,
    isDecorated: false,
    neutrals: withBell({
      bg: '#F7F4EE',
      paper: '#FFFFFF',
      'paper-2': '#FFFFFF',
      alt: '#FBF9F5',
      chip: '#F3EFE8',
      line: '#E8E2D8',
      'line-2': '#EEE9E1',
      dash: '#DDD5C8',
      'dash-2': '#CFC5B5',
      mline: '#E6E0D5',
      'mute-3': '#A69E91',
      mute: '#81786B',
      'mute-2': '#6E665A',
      'ink-2': '#463F37',
      placeholder: '#C2BAAD',
      ink: '#2B2622',
      grid: 'transparent',
    }),
    brand: {
      kuning: {
        accent: '#A8864F',
        deep: '#8A6B3A',
        deeper: '#6B522B',
        soft: '#F1E9DA',
        hover: '#F7F2E9',
        primary: '#EFE5D3',
      },
      hijau: {
        accent: '#3D6B5A',
        deep: '#2F5647',
        deeper: '#234237',
        soft: '#E1EBE6',
        hover: '#EFF4F1',
        primary: '#DCE7E1',
      },
      ungu: {
        accent: '#8A6A86',
        deep: '#70546D',
        deeper: '#574154',
        soft: '#EFE6EE',
        hover: '#F6F1F5',
        primary: '#EAE0E8',
      },
    },
  },
  vintage: {
    fonts: {
      display: "'Playfair Display', serif",
      body: "'Lora', serif",
      hand: "'Special Elite', monospace",
    },
    weights: { display: '700', strong: '800', body: '700', medium: '600' },
    radiusScale: 0.18,
    borderScale: 0.55,
    outline: '#5A4330',
    shadow: { x: 0, y: 0.4, blur: 0, color: 'rgba(90,67,48,.18)' },
    isPatterned: false,
    isDecorated: false,
    neutrals: withBell({
      bg: '#EDE2CB',
      paper: '#F6EDD9',
      'paper-2': '#F8F0DE',
      alt: '#F1E6CF',
      chip: '#E8DBBF',
      line: '#C9B48F',
      'line-2': '#D8C7A6',
      dash: '#BBA37C',
      'dash-2': '#A68D66',
      mline: '#D3C09D',
      'mute-3': '#9A8466',
      mute: '#7A6449',
      'mute-2': '#68533A',
      'ink-2': '#4A3826',
      placeholder: '#B49E7C',
      ink: '#3B2A1E',
      grid: 'transparent',
    }),
    brand: {
      kuning: {
        accent: '#A0522D',
        deep: '#83421F',
        deeper: '#663318',
        soft: '#E9D2B8',
        hover: '#EFE0CC',
        primary: '#E6CCAE',
      },
      hijau: {
        accent: '#5F6B3A',
        deep: '#4B552D',
        deeper: '#3A4222',
        soft: '#DCD9B8',
        hover: '#E8E4CC',
        primary: '#D6D3AE',
      },
      ungu: {
        accent: '#7A3E52',
        deep: '#633142',
        deeper: '#4C2533',
        soft: '#E6CFCB',
        hover: '#EEDFD9',
        primary: '#E2C7C2',
      },
    },
  },
  tegas: {
    fonts: {
      display: "'Space Grotesk', sans-serif",
      body: "'Space Grotesk', sans-serif",
      hand: "'JetBrains Mono', monospace",
    },
    weights: { display: '700', strong: '800', body: '700', medium: '600' },
    radiusScale: 0,
    borderScale: 0.8,
    outline: null,
    shadow: { x: 0.6, y: 0.6, blur: 0, color: '#2F2A24' },
    isPatterned: true,
    isDecorated: false,
    neutrals: withBell({
      bg: '#FFFFFF',
      paper: '#FFFFFF',
      'paper-2': '#FFFFFF',
      alt: '#FAFAFA',
      chip: '#F2F2F2',
      line: '#E6E6E6',
      'line-2': '#EDEDED',
      dash: '#D9D9D9',
      'dash-2': '#C9C9C9',
      mline: '#E3E3E3',
      'mute-3': '#9A9A9A',
      mute: '#6E6E6E',
      'mute-2': '#5C5C5C',
      'ink-2': '#333333',
      placeholder: '#BBBBBB',
      ink: '#111111',
      grid: 'rgba(17,17,17,.05)',
    }),
    brand: BRAND_BRIGHT,
  },
} as const satisfies Record<StyleName, StyleDefinition>

/** Font tambahan yang hanya dipakai gaya non-Cute (dimuat lazy oleh browser saat gaya aktif). */
export const STYLE_FONT_FAMILIES = [
  { name: 'DM Serif Display', weights: [400] },
  { name: 'Work Sans', weights: [500, 600] },
  { name: 'DM Sans', weights: [600, 700] },
  { name: 'Cormorant Garamond', weights: [500, 600] },
  { name: 'Jost', weights: [400, 500] },
  { name: 'Playfair Display', weights: [700] },
  { name: 'Lora', weights: [600, 700] },
  { name: 'Special Elite', weights: [400] },
  { name: 'Space Grotesk', weights: [600, 700] },
  { name: 'JetBrains Mono', weights: [400] },
] as const
