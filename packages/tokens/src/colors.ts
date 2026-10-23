/**
 * Warna dari design system (tokens/colors.css).
 * Key = nama CSS custom property tanpa `--`, supaya web (CSS vars) dan RN (theme object) identik.
 */

export const THEME_NAMES = ['kuning', 'hijau', 'ungu'] as const
export type ThemeName = (typeof THEME_NAMES)[number]
export const DEFAULT_THEME: ThemeName = 'kuning'

/** Warna yang tidak berubah antar tema. */
export const palette = {
  ink: '#2F2A24',
  'ink-shadow': 'rgba(47,42,36,.12)',
  'ink-shadow-strong': 'rgba(47,42,36,.18)',
  scrim: 'rgba(47,42,36,.35)',
  'white-wash': 'rgba(255,255,255,.7)',

  // Teks status & chip di bawah ini digelapkan dari desain awal supaya lolos WCAG AA 4.5:1 di
  // SEMUA kombinasi gaya × tema (F16). Latar chip tidak diubah - hanya tinta teksnya.
  success: '#36792C',
  'success-soft': '#F3F9EF',
  'success-line': '#9FD08F',
  danger: '#BC3619',
  notify: '#E2445C',
  streak: '#F07A1A',

  'prio-urgent-bg': '#FFE1DA',
  'prio-urgent-fg': '#BC3619',
  'prio-medium-bg': '#FFF0C8',
  'prio-medium-fg': '#916400',
  'prio-low-bg': '#E3EEE0',
  'prio-low-fg': '#3C7631',

  'cat-karier': '#B02A6A',
  'cat-karier-tint': '#F7C6DA',
  'cat-karier-text': '#8E2A5A',
  'cat-kesehatan': '#E0560C',
  'cat-kesehatan-tint': '#FFD9BF',
  'cat-kesehatan-text': '#9A3A0C',
  'cat-keuangan': '#2E8A22',
  'cat-keuangan-tint': '#CDE8C6',
  'cat-keuangan-text': '#2E6A26',
  'cat-diri': '#7A52C7',
  'cat-diri-tint': '#DCD3F4',
  'cat-diri-text': '#5E4BA8',
  // Relasi (PRD F13): design #10A8D8 digelapkan supaya kontras ≥ 3:1 di atas paper, seperti kategori lain.
  'cat-relasi': '#0E7FA6',
  'cat-relasi-tint': '#C7E3EE',
  'cat-relasi-text': '#1E5D78',
  'cat-kerja': '#0A55E6',
  'cat-kerja-tint': '#D3E2FB',
  'cat-kerja-text': '#1E4AA0',
  'cat-trip': '#1E5D78',
  'cat-trip-tint': '#C7E3EE',

  'icon-home': '#E6A800',
  'icon-daily': '#F7A21B',
  'icon-cal': '#F9D857',
  'icon-todo': '#9B4FC9',
  'icon-more': '#10A8D8',
  'icon-goals': '#F03FBF',
  'icon-habit': '#0A55E6',
  'icon-countdown': '#E2445C',
  'icon-pomodoro': '#FF6A13',
  'icon-overview': '#1DA20F',
  'icon-off': '#D9C9AE',
} as const

export const THEME_COLOR_KEYS = [
  'bg',
  'grid',
  'paper',
  'paper-2',
  'alt',
  'chip',
  'hover',
  'line',
  'line-2',
  'dash',
  'dash-2',
  'mline',
  'placeholder',
  'mute',
  'mute-2',
  'mute-3',
  'ink-2',
  'primary',
  'soft',
  'deep',
  'deeper',
  'accent',
  'bell',
  'bell-ring',
] as const
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number]
export type ThemeColors = Readonly<Record<ThemeColorKey, string>>

/** Ramp per tema: paper/primary/accent ikut berganti via `[data-theme]`. */
export const themes = {
  kuning: {
    bg: '#F6EBDA',
    grid: 'rgba(214,180,140,.22)',
    paper: '#FFFBF4',
    'paper-2': '#FFFDF7',
    alt: '#FBF3E6',
    chip: '#F2E4CC',
    hover: '#F7E6CC',
    line: '#EEDDC2',
    'line-2': '#F0E2CB',
    dash: '#E3CFAF',
    'dash-2': '#D9C4A2',
    mline: '#EADBC2',
    placeholder: '#7C7262',
    // Ramp teks redup digelapkan secukupnya supaya AA 4.5:1 tetap lulus di atas permukaan STATE
    // (`soft` terpilih, `hover`) - bukan cuma di atas `paper`/`bg` (QA T16 MAYOR-2). Urutan terang→gelap
    // tetap: mute-3 → mute → mute-2 → ink-2.
    mute: '#675B4D',
    'mute-2': '#5F5545',
    'mute-3': '#6E6152',
    'ink-2': '#5E5040',
    primary: '#F3CB86',
    soft: '#FBDDB7',
    deep: '#7E4F0C',
    deeper: '#633D08',
    accent: '#935409',
    bell: '#F8D9A0',
    'bell-ring': '#EBC888',
  },
  hijau: {
    bg: '#E5EFDC',
    grid: 'rgba(130,175,120,.25)',
    paper: '#FBFDF7',
    'paper-2': '#FCFEF9',
    alt: '#F1F6EA',
    chip: '#E3EDD8',
    hover: '#DCEBD2',
    line: '#D9E6CC',
    'line-2': '#DFEAD3',
    dash: '#C9DBB8',
    'dash-2': '#BBD0A6',
    mline: '#D8E5CA',
    placeholder: '#6B7761',
    mute: '#535F4C',
    'mute-2': '#4E5C45',
    'mute-3': '#586551',
    'ink-2': '#46573D',
    primary: '#A8D69A',
    soft: '#CDE6C1',
    deep: '#2F6A24',
    deeper: '#28581F',
    accent: '#366E2B',
    bell: '#BDE0AF',
    'bell-ring': '#94C783',
  },
  ungu: {
    bg: '#EEE8F6',
    grid: 'rgba(160,140,200,.24)',
    paper: '#FCFAFF',
    'paper-2': '#FDFCFF',
    alt: '#F4EFFA',
    chip: '#E9E0F4',
    hover: '#E8DFF7',
    line: '#E1D6F0',
    'line-2': '#E6DCF2',
    dash: '#D2C3E8',
    'dash-2': '#C4B2E0',
    mline: '#DFD3EF',
    placeholder: '#786E89',
    mute: '#5E556A',
    'mute-2': '#5A4E6E',
    'mute-3': '#645A71',
    'ink-2': '#54476A',
    primary: '#C9B6EE',
    soft: '#E0D4F6',
    deep: '#5B3E9A',
    deeper: '#4A3082',
    accent: '#6D49B1',
    bell: '#D6C7F2',
    'bell-ring': '#B39CE6',
  },
} as const satisfies Record<ThemeName, ThemeColors>

/** Alias semantik → nama token sumber (dirender sebagai `var(--sumber)`). */
export const semanticColors = {
  'surface-page': 'bg',
  'surface-card': 'paper',
  'surface-card-raised': 'paper-2',
  'surface-inset': 'alt',
  'surface-track': 'chip',
  'text-body': 'ink',
  'text-muted': 'mute',
  'text-subtle': 'mute-3',
  'text-on-accent': 'paper',
  'text-eyebrow': 'deep',
  action: 'accent',
  'border-ink': 'ink',
  'border-soft': 'line',
} as const satisfies Record<string, ThemeColorKey | keyof typeof palette>

/** Mood 5 skala (0 = berat … 4 = bahagia): warna tile saat dipilih. */
export const moodTints = ['#D6DDEE', '#E4DCF5', '#F2E4CC', '#FFE7A8', '#FFD3BC'] as const

export const MEMO_PAPER_NAMES = [
  'krem',
  'putih',
  'pink',
  'kuning',
  'hijau',
  'biru',
  'lavender',
  'malam',
] as const
export type MemoPaperName = (typeof MEMO_PAPER_NAMES)[number]
export type MemoPaper = Readonly<{ bg: string; line: string; margin: string; ink: string }>

/** 8 stok kertas memo (guidelines/memo-papers): latar, garis, margin merah, tinta. */
export const memoPapers = {
  krem: { bg: '#FFFDF6', line: '#D9CDB8', margin: '#EE9A88', ink: '#2F2A24' },
  putih: { bg: '#FFFFFF', line: '#DCE3EA', margin: '#EE9A88', ink: '#2F2A24' },
  pink: { bg: '#FFF0F3', line: '#F2C6D0', margin: '#E77F97', ink: '#2F2A24' },
  kuning: { bg: '#FFF8D6', line: '#E8D78E', margin: '#E59A4F', ink: '#2F2A24' },
  hijau: { bg: '#EEF8EA', line: '#C3DDB8', margin: '#E3907E', ink: '#2F2A24' },
  biru: { bg: '#EDF4FC', line: '#BFD3EA', margin: '#E88C8C', ink: '#2F2A24' },
  lavender: { bg: '#F4EFFC', line: '#D3C6EC', margin: '#D982A8', ink: '#2F2A24' },
  malam: { bg: '#2F3446', line: '#4B5370', margin: '#C9739A', ink: '#F4EFE6' },
} as const satisfies Record<MemoPaperName, MemoPaper>
