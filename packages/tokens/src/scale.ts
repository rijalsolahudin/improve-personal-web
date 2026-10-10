/** Shape, spacing, dan tipografi (tokens/shape.css, spacing.css, typography.css). */

export const radius = {
  'radius-pill': '999px',
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

export const space = {
  'space-1': '2px',
  'space-2': '4px',
  'space-3': '6px',
  'space-4': '8px',
  'space-5': '10px',
  'space-6': '12px',
  'space-7': '14px',
  'space-8': '16px',
  'space-9': '18px',
  'space-10': '22px',
  'space-11': '28px',
  'space-12': '32px',
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

export const typography = {
  'fw-body': '700',
  'fw-strong': '800',
  'fs-hero': '64px',
  'fs-h1-desktop': '36px',
  'fs-h1': '30px',
  'fs-stat-xl': '32px',
  'fs-stat': '26px',
  'fs-h2': '20px',
  'fs-h3': '18px',
  'fs-body-lg': '16px',
  'fs-body': '15px',
  'fs-body-sm': '14px',
  'fs-caption': '13px',
  'fs-meta': '12px',
  'fs-eyebrow': '11px',
  'fs-hand-title': '22px',
  'fs-hand-body': '19px',
  'fs-hand-label': '13px',
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
