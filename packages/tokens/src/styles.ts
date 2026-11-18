/**
 * Gaya tampilan (PRD F16 · Desktop.dc.html "Tampilan → Gaya"). Gaya independen dari tema warna:
 * gaya mengatur font, skala radius/border, bayangan, pola latar, dekorasi, dan ramp netral.
 * Semua dirender jadi CSS custom properties, jadi ganti gaya = ganti atribut `data-style`.
 */

import type { ThemeColorKey, ThemeName } from './colors.ts'

export const STYLE_NAMES = [
  'clean',
  'cute',
  'cute-pure',
  'kertas',
  'simple',
  'elegan',
  'vintage',
  'tegas',
] as const
export type StyleName = (typeof STYLE_NAMES)[number]
export const DEFAULT_STYLE: StyleName = 'clean'

/**
 * Keluarga gaya untuk pengelompokan di menu Tampilan: `cute` = turunan Cute (font bulat, maskot),
 * `klasik` = gaya dengan font & karakter sendiri. Urutannya = urutan tampil.
 */
export const STYLE_FAMILIES = ['cute', 'klasik'] as const
export type StyleFamily = (typeof STYLE_FAMILIES)[number]

type ColorOverrides = Readonly<Partial<Record<ThemeColorKey | 'ink', string>>>

export interface StyleDefinition {
  readonly family: StyleFamily
  readonly fonts: Readonly<{ display: string; body: string; hand: string }>
  /** Bobot font: display = judul Baloo-equivalent, strong/body/medium = 800/700/600 di gaya Cute. */
  readonly weights: Readonly<{ display: string; strong: string; body: string; medium: string }>
  /**
   * Pengali ukuran font per peran (`--fk`, `--fk-display`, `--fk-hand`). Ukuran desain dibuat untuk
   * keluarga font Cute; keluarga lain punya x-height & lebar huruf berbeda, jadi tiap peran disetel
   * terpisah supaya hierarki teks tetap terasa sama.
   */
  readonly typeScale: Readonly<{ ui: number; display: number; hand: number }>
  /**
   * `font-size-adjust` (`--fsa`). Hanya gaya Cute yang memakainya: di keluarga font lain metrik
   * x-height bawaan font bisa meleset jauh (Special Elite diperbesar ~2×, Cormorant ~1,3×), sementara
   * line-height tetap dihitung dari ukuran sebelum diperbesar, jadi glyph meluber ke baris tetangga.
   * Gaya lain memakai `none` dan menaruh koreksi ukurannya di `typeScale`.
   */
  readonly fontSizeAdjust: string
  /** Pengali spasi (`--dk`): >1 lebih lapang, <1 lebih rapat. */
  readonly density: number
  /** Radius kontrol berbentuk pill (input, chip); gaya bersudut tajam memakai radius kecil. */
  readonly pillRadius: string
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
  // Patrick Hand sudah dimuat `nuxt.config.ts` (permukaan jurnal) dan dipakai source design
  // (`source-ui/tokens/fonts.css`), jadi mengubah teks "tulisan tangan" ke sana tidak menambah berkas font.
  hand: "'Patrick Hand', cursive",
} as const
const CUTE_WEIGHTS = { display: '800', strong: '800', body: '700', medium: '600' } as const
const CUTE_TYPE = { ui: 1, display: 1, hand: 1 } as const
const CUTE_FONT_ADJUST = '0.51'
const FULL_PILL = '999px'
const HARD_SHADOW = { x: 0, y: 1, blur: 0, color: null } as const
const NO_SHADOW = { x: 0, y: 0, blur: 0, color: 'transparent' } as const
/** Offset kecil + blur lebar: kartu terlihat "melayang" tipis, bukan ditempel stiker. */
const SOFT_SHADOW = { x: 0, y: 0.6, blur: 3, color: 'rgba(94,72,40,.08)' } as const

/**
 * Aksen jenuh untuk gaya netral (Cute Pure, Simple, Tegas). Digelapkan sampai AA 4.5:1 sebagai teks
 * **di atas permukaan state `soft`** juga (QA T16 MAYOR-2), bukan hanya di atas `paper`/`bg`, dengan
 * sisa ruang ≥0,12 (terendah 4,62:1) supaya tidak mepet ambang.
 */
const BRAND_BRIGHT = {
  kuning: {
    accent: '#A94B15',
    deep: '#9C4412',
    deeper: '#803710',
    soft: '#FDE4D3',
    hover: '#FEF1E8',
    primary: '#FDD9BF',
  },
  hijau: {
    accent: '#1D7749',
    deep: '#176B3F',
    deeper: '#125634',
    soft: '#D9F0E2',
    hover: '#EEF8F2',
    primary: '#CDEBD9',
  },
  ungu: {
    accent: '#4C2F8F',
    deep: '#452A84',
    deeper: '#39236D',
    soft: '#ECE6FA',
    hover: '#F0EBFB',
    primary: '#E4DBF8',
  },
  biru: {
    accent: '#2B5F93',
    deep: '#275787',
    deeper: '#20486F',
    soft: '#E5F0FA',
    hover: '#EBF3FB',
    primary: '#DAE9F8',
  },
  pink: {
    accent: '#8F2F4C',
    deep: '#842A45',
    deeper: '#6D2339',
    soft: '#FAE6EC',
    hover: '#FBEBF0',
    primary: '#F7D7E0',
  },
  toska: {
    accent: '#24776C',
    deep: '#216D63',
    deeper: '#1A564E',
    soft: '#E4F9F7',
    hover: '#EBFBF9',
    primary: '#D3F6F2',
  },
  jingga: {
    accent: '#9A4B24',
    deep: '#8E4520',
    deeper: '#75391A',
    soft: '#FAE5DB',
    hover: '#FCF0EA',
    primary: '#F8D9C9',
  },
  grafit: {
    accent: '#525D6C',
    deep: '#4B5563',
    deeper: '#3E4652',
    soft: '#EBEDEF',
    hover: '#F1F3F5',
    primary: '#E0E2E6',
  },
} as const

/** `bell`/`bell-ring` ikut ramp netral di gaya non-Cute (design: bell = chip, bellRing = line). */
const withBell = (n: ColorOverrides & { chip: string; line: string }): ColorOverrides => ({
  ...n,
  bell: n.chip,
  'bell-ring': n.line,
})

export const uiStyles = {
  /**
   * Cute yang dirapikan: palet tema, font, dan maskot tetap, tapi tanpa kertas grafik, border setengah
   * tebal, dan bayangan lembut ber-blur alih-alih bayangan keras. Kesan "playful" datang dari warna &
   * maskot, bukan dari garis tebal - jadi layar padat (overview, kalender) tidak terasa ramai.
   */
  clean: {
    family: 'cute',
    fonts: CUTE_FONTS,
    // Body 600 (bukan 700): teks panjang lebih ringan; judul & angka tetap 800.
    weights: { ...CUTE_WEIGHTS, body: '600' },
    typeScale: CUTE_TYPE,
    fontSizeAdjust: CUTE_FONT_ADJUST,
    density: 1,
    pillRadius: FULL_PILL,
    radiusScale: 1,
    borderScale: 0.5,
    outline: 'var(--mute-3)',
    shadow: SOFT_SHADOW,
    isPatterned: false,
    isDecorated: true,
    neutrals: {},
    brand: null,
  },
  cute: {
    family: 'cute',
    fonts: CUTE_FONTS,
    weights: CUTE_WEIGHTS,
    typeScale: CUTE_TYPE,
    fontSizeAdjust: CUTE_FONT_ADJUST,
    density: 1,
    pillRadius: FULL_PILL,
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
    family: 'cute',
    fonts: CUTE_FONTS,
    weights: CUTE_WEIGHTS,
    typeScale: CUTE_TYPE,
    fontSizeAdjust: CUTE_FONT_ADJUST,
    density: 1,
    pillRadius: FULL_PILL,
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
      'mute-3': '#68625B',
      mute: '#635D56',
      'mute-2': '#59544D',
      'ink-2': '#4E463C',
      placeholder: '#7A756C',
      grid: 'rgba(47,42,36,.045)',
    }),
    brand: BRAND_BRIGHT,
  },
  kertas: {
    family: 'klasik',
    fonts: {
      display: "'DM Serif Display', serif",
      body: "'Work Sans', sans-serif",
      hand: "'DM Serif Display', serif",
    },
    weights: { display: '400', strong: '600', body: '500', medium: '500' },
    typeScale: { ui: 1.02, display: 1.06, hand: 0.95 },
    fontSizeAdjust: 'none',
    density: 1.05,
    pillRadius: FULL_PILL,
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
      dash: '#989791',
      'dash-2': '#6E6D68',
      mline: '#CFCEC7',
      'mute-3': '#63635E',
      mute: '#55554F',
      'mute-2': '#45453F',
      'ink-2': '#282825',
      placeholder: '#6F6F6A',
      ink: '#1E1E1E',
      grid: 'transparent',
    }),
    /**
     * Kertas tetap monokrom (tinta di atas kertas) dan kertasnya SAMA untuk semua tema (kanvas Kuning,
     * seperti gaya lain). Tema hanya mewarnai tinta aksen & permukaan state dengan saturasi kecil -
     * tanpa ini pilihan tema tidak berefek sama sekali di gaya Kertas (QA T25 B5).
     */
    brand: {
      kuning: {
        bg: '#F7F4EC',
        paper: '#F7F4EC',
        'paper-2': '#F7F4EC',
        alt: '#F7F4EC',
        chip: '#EDEAE1',
        ink: '#2A2418',
        line: '#2A2418',
        'line-2': '#C4BFAF',
        dash: '#989385',
        'dash-2': '#6E695C',
        mline: '#D2CCBE',
        accent: '#3B2F1C',
        deep: '#3B2F1C',
        deeper: '#3B2F1C',
        soft: '#E7E2D4',
        hover: '#EFEBDF',
        primary: '#F2EDE1',
        bell: '#EDEAE1',
        'bell-ring': '#C4BFAF',
      },
      hijau: {
        bg: '#F7F4EC',
        paper: '#F7F4EC',
        'paper-2': '#F7F4EC',
        alt: '#F7F4EC',
        chip: '#EDEAE1',
        ink: '#2A2418',
        line: '#2A2418',
        'line-2': '#C4BFAF',
        dash: '#989385',
        'dash-2': '#6E695C',
        mline: '#D2CCBE',
        accent: '#25331F',
        deep: '#25331F',
        deeper: '#25331F',
        soft: '#E2EADD',
        hover: '#EBF1E7',
        primary: '#EDF3E9',
        bell: '#EDEAE1',
        'bell-ring': '#C4BFAF',
      },
      ungu: {
        bg: '#F7F4EC',
        paper: '#F8F5EE',
        'paper-2': '#F7F4EC',
        alt: '#F7F4EC',
        chip: '#EDEAE1',
        ink: '#2A2418',
        line: '#2A2418',
        'line-2': '#C4BFAF',
        dash: '#989385',
        'dash-2': '#6E695C',
        mline: '#D2CCBE',
        accent: '#261E39',
        deep: '#261E39',
        deeper: '#261E39',
        soft: '#E5DFEE',
        hover: '#E4DFEF',
        primary: '#E7E3F0',
        bell: '#EDEAE1',
        'bell-ring': '#C4BFAF',
      },
      biru: {
        bg: '#F7F4EC',
        paper: '#F8F5EE',
        'paper-2': '#F7F4EC',
        alt: '#F7F4EC',
        chip: '#EDEAE1',
        ink: '#2A2418',
        line: '#2A2418',
        'line-2': '#C4BFAF',
        dash: '#989385',
        'dash-2': '#6E695C',
        mline: '#D2CCBE',
        accent: '#1E2C39',
        deep: '#1E2C39',
        deeper: '#1E2C39',
        soft: '#D9E3EB',
        hover: '#DFE7EF',
        primary: '#E3EAF0',
        bell: '#EDEAE1',
        'bell-ring': '#C4BFAF',
      },
      pink: {
        bg: '#F7F4EC',
        paper: '#F8F5EE',
        'paper-2': '#F7F4EC',
        alt: '#F7F4EC',
        chip: '#EDEAE1',
        ink: '#2A2418',
        line: '#2A2418',
        'line-2': '#C4BFAF',
        dash: '#989385',
        'dash-2': '#6E695C',
        mline: '#D2CCBE',
        accent: '#391E26',
        deep: '#391E26',
        deeper: '#391E26',
        soft: '#EEDFE5',
        hover: '#EFDFE4',
        primary: '#F0E3E7',
        bell: '#EDEAE1',
        'bell-ring': '#C4BFAF',
      },
      toska: {
        bg: '#F7F4EC',
        paper: '#F8F5EE',
        'paper-2': '#F7F4EC',
        alt: '#F7F4EC',
        chip: '#EDEAE1',
        ink: '#2A2418',
        line: '#2A2418',
        'line-2': '#C4BFAF',
        dash: '#989385',
        'dash-2': '#6E695C',
        mline: '#D2CCBE',
        accent: '#1E3936',
        deep: '#1E3936',
        deeper: '#1E3936',
        soft: '#D3E8E6',
        hover: '#DFEFED',
        primary: '#E3F0EF',
        bell: '#EDEAE1',
        'bell-ring': '#C4BFAF',
      },
      jingga: {
        bg: '#F7F4EC',
        paper: '#F8F5EE',
        'paper-2': '#F7F4EC',
        alt: '#F7F4EC',
        chip: '#EDEAE1',
        ink: '#2A2418',
        line: '#2A2418',
        'line-2': '#C4BFAF',
        dash: '#989385',
        'dash-2': '#6E695C',
        mline: '#D2CCBE',
        accent: '#39271E',
        deep: '#39271E',
        deeper: '#39271E',
        soft: '#EBE0D9',
        hover: '#EFE4DF',
        primary: '#F0E7E3',
        bell: '#EDEAE1',
        'bell-ring': '#C4BFAF',
      },
      grafit: {
        bg: '#F7F4EC',
        paper: '#F8F5EE',
        'paper-2': '#F7F4EC',
        alt: '#F7F4EC',
        chip: '#EDEAE1',
        ink: '#2A2418',
        line: '#2A2418',
        'line-2': '#C4BFAF',
        dash: '#989385',
        'dash-2': '#6E695C',
        mline: '#D2CCBE',
        accent: '#282B2F',
        deep: '#282B2F',
        deeper: '#282B2F',
        soft: '#E0E3E4',
        hover: '#E5E7E9',
        primary: '#E7E9EC',
        bell: '#EDEAE1',
        'bell-ring': '#C4BFAF',
      },
    },
  },
  simple: {
    family: 'klasik',
    fonts: {
      display: "'DM Sans', sans-serif",
      body: "'DM Sans', sans-serif",
      hand: "'DM Sans', sans-serif",
    },
    weights: { display: '600', strong: '600', body: '700', medium: '600' },
    typeScale: { ui: 1, display: 1, hand: 0.85 },
    fontSizeAdjust: 'none',
    density: 1,
    pillRadius: FULL_PILL,
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
      'mute-3': '#63635E',
      mute: '#5E5E59',
      'mute-2': '#555550',
      'ink-2': '#3B3B36',
      placeholder: '#767671',
      ink: '#1F1F1C',
      grid: 'transparent',
    }),
    brand: BRAND_BRIGHT,
  },
  elegan: {
    family: 'klasik',
    fonts: {
      display: "'Cormorant Garamond', serif",
      body: "'Jost', sans-serif",
      hand: "'Cormorant Garamond', serif",
    },
    weights: { display: '600', strong: '500', body: '500', medium: '400' },
    typeScale: { ui: 1.1, display: 1.35, hand: 1.12 },
    fontSizeAdjust: 'none',
    density: 1.1,
    pillRadius: '4px',
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
      'mute-3': '#6C665D',
      mute: '#666158',
      'mute-2': '#5C574F',
      'ink-2': '#463F37',
      placeholder: '#7A756D',
      ink: '#2B2622',
      grid: 'transparent',
    }),
    brand: {
      kuning: {
        accent: '#7D633B',
        deep: '#745B34',
        deeper: '#5C4829',
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
        accent: '#534771',
        deep: '#4C3F69',
        deeper: '#3C3253',
        soft: '#EEEBF5',
        hover: '#EEEBF5',
        primary: '#EAE6F3',
      },
      biru: {
        accent: '#455C73',
        deep: '#3E546A',
        deeper: '#314354',
        soft: '#EBEFF5',
        hover: '#EBF0F5',
        primary: '#E6ECF3',
      },
      pink: {
        accent: '#714753',
        deep: '#693F4C',
        deeper: '#53323C',
        soft: '#F4E9EC',
        hover: '#F5EBEE',
        primary: '#F1E3E7',
      },
      toska: {
        accent: '#45736E',
        deep: '#3E6A66',
        deeper: '#315451',
        soft: '#E6F2F1',
        hover: '#EBF5F4',
        primary: '#E0EFEE',
      },
      jingga: {
        accent: '#765342',
        deep: '#6E4B3A',
        deeper: '#573C2E',
        soft: '#F2E7E2',
        hover: '#F6EEEA',
        primary: '#EEE0D9',
      },
      grafit: {
        accent: '#565B62',
        deep: '#4E535A',
        deeper: '#3E4247',
        soft: '#E9EAEC',
        hover: '#EFF0F1',
        primary: '#E4E6E8',
      },
    },
  },
  vintage: {
    family: 'klasik',
    fonts: {
      display: "'Playfair Display', serif",
      body: "'Lora', serif",
      hand: "'Special Elite', monospace",
    },
    weights: { display: '700', strong: '800', body: '700', medium: '600' },
    typeScale: { ui: 0.97, display: 1, hand: 0.9 },
    fontSizeAdjust: 'none',
    density: 1.05,
    pillRadius: '6px',
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
      'mute-3': '#665843',
      mute: '#615440',
      'mute-2': '#574C3A',
      'ink-2': '#493725',
      placeholder: '#776952',
      ink: '#3B2A1E',
      grid: 'transparent',
    }),
    brand: {
      kuning: {
        accent: '#8C4827',
        deep: '#83421F',
        deeper: '#663318',
        soft: '#E9D2B8',
        hover: '#EFE0CC',
        primary: '#E6CCAE',
      },
      hijau: {
        accent: '#566134',
        deep: '#4B552D',
        deeper: '#3A4222',
        soft: '#DCD9B8',
        hover: '#E8E4CC',
        primary: '#D6D3AE',
      },
      ungu: {
        accent: '#4C397A',
        deep: '#443172',
        deeper: '#352658',
        soft: '#D9D1EA',
        hover: '#E6E1F1',
        primary: '#CFC6E5',
      },
      biru: {
        accent: '#365A7D',
        deep: '#2E5174',
        deeper: '#243F5A',
        soft: '#CEDCEA',
        hover: '#E0E9F2',
        primary: '#C5D5E6',
      },
      pink: {
        accent: '#7A394C',
        deep: '#723144',
        deeper: '#582635',
        soft: '#E9CDD6',
        hover: '#F0DDE3',
        primary: '#E4C2CC',
      },
      toska: {
        accent: '#2A6563',
        deep: '#265C5A',
        deeper: '#1D4645',
        soft: '#C8E6E3',
        hover: '#DAEEEC',
        primary: '#BFE2DE',
      },
      jingga: {
        accent: '#7E4A30',
        deep: '#75452C',
        deeper: '#5E3520',
        soft: '#E7CFC2',
        hover: '#EDDCD3',
        primary: '#E2C5B7',
      },
      grafit: {
        accent: '#505863',
        deep: '#484F5A',
        deeper: '#383E46',
        soft: '#D2D5D9',
        hover: '#E0E2E5',
        primary: '#CBCED3',
      },
    },
  },
  tegas: {
    family: 'klasik',
    fonts: {
      display: "'Space Grotesk', sans-serif",
      body: "'Space Grotesk', sans-serif",
      hand: "'JetBrains Mono', monospace",
    },
    weights: { display: '700', strong: '800', body: '700', medium: '600' },
    typeScale: { ui: 1.05, display: 1.05, hand: 0.83 },
    fontSizeAdjust: 'none',
    density: 0.95,
    pillRadius: '0px',
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
      'mute-3': '#636363',
      mute: '#5E5E5E',
      'mute-2': '#555555',
      'ink-2': '#333333',
      placeholder: '#767676',
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
