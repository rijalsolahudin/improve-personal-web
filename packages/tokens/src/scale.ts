/** Shape, spacing, dan tipografi (tokens/shape.css, spacing.css, typography.css). */

export const radius = {
  'radius-panel': '32px',
  'radius-tabbar': '30px',
  'radius-sticker': '26px',
  'radius-hero': '24px',
  'radius-card': '22px',
  'radius-row': '18px',
  'radius-btn-sq': '16px',
  'radius-inner': '12px',
  'radius-check': '9px',
  'radius-leaf': '13px 13px 13px 5px',
  'radius-leaf-sm': '10px 10px 10px 4px',
  'radius-leaf-lg': '24px 24px 24px 8px',
} as const

export const border = {
  'border-thin': '2px',
  border: '2.5px',
  'border-thick': '3px',
} as const

/** Bayangan keras tanpa blur - jangan pernah pakai blur. */
export const shadow = {
  'shadow-drop': '0 6px 0 var(--ink-shadow)',
  'shadow-drop-sm': '0 5px 0 rgba(47,42,36,.1)',
  'shadow-press': '0 5px 0 var(--ink-shadow-strong)',
  'shadow-ring': '0 8px 0 var(--ink-shadow)',
  'shadow-icon-inset': 'inset 0 -3px 0 rgba(0,0,0,.14)',
} as const

export const motion = {
  ease: 'ease',
  dur: '.2s',
} as const

/**
 * Anak tangga spasi (px) → `--space-<px>`, dikali pengali kerapatan gaya (`--dk`). Komponen memakai
 * token ini, bukan px mentah, supaya gaya lapang/rapat bisa mengatur jarak seluruh app sekaligus.
 */
export const SPACE_STEPS = [
  2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96, 112,
] as const

/**
 * Anak tangga ukuran font (px). Tiap nilai jadi tiga token sesuai peran keluarga font, masing-masing
 * dikali pengali gaya: `--fs-<px>` (teks UI, `--fk`), `--fs-display-<px>` (judul, `--fk-display`),
 * `--fs-hand-<px>` (tulisan tangan, `--fk-hand`). Keluarga font tiap gaya punya proporsi berbeda,
 * jadi satu pengali untuk semua teks tidak cukup.
 */
export const FONT_SIZES = [
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42,
  44, 56, 64,
] as const

/** Token tata letak yang tidak ikut skala gaya (target tap & grid latar harus tetap). */
export const space = {
  'gap-mobile': '16px',
  'gap-desktop': '28px',
  'tap-min': '44px',
  'grid-mobile': '24px',
  'grid-desktop': '28px',
} as const

export const fontFamily = {
  'font-display': "'Baloo 2', 'Nunito', sans-serif",
  'font-body': "'Nunito', sans-serif",
  'font-hand': "'Patrick Hand', cursive",
} as const

/** Ukuran semantik menunjuk anak tangga `FONT_SIZES`, jadi ikut pengali gaya yang sesuai perannya. */
export const typography = {
  'fw-body': '700',
  'fw-strong': '800',
  'fs-hero': 'var(--fs-display-64)',
  'fs-h1-desktop': 'var(--fs-display-36)',
  'fs-h1': 'var(--fs-display-30)',
  'fs-stat-xl': 'var(--fs-display-32)',
  'fs-stat': 'var(--fs-display-26)',
  'fs-h2': 'var(--fs-display-20)',
  'fs-h3': 'var(--fs-display-18)',
  'fs-body-lg': 'var(--fs-16)',
  'fs-body': 'var(--fs-15)',
  'fs-body-sm': 'var(--fs-14)',
  'fs-caption': 'var(--fs-13)',
  'fs-meta': 'var(--fs-12)',
  'fs-eyebrow': 'var(--fs-11)',
  'fs-hand-title': 'var(--fs-hand-22)',
  'fs-hand-body': 'var(--fs-hand-19)',
  'fs-hand-label': 'var(--fs-hand-13)',
  'lh-tight': '1.05',
  'lh-title': '1.15',
  'lh-body': '1.25',
  'lh-ruled': '30px',
  'tracking-eyebrow': '.1em',
  'tracking-group': '.14em',
} as const

/**
 * Breakpoint layout (px), sama dengan media query di CSS web:
 * < mobile = tab bar bawah; < sidebarExpanded = sidebar desktop default ciut.
 */
export const breakpoints = {
  mobile: 600,
  sidebarExpanded: 1200,
} as const
