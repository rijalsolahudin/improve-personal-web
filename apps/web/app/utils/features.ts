import type { IconName } from './icons'

/**
 * Registri 15 fitur (docs/PRD F1–F15) → route, ikon, dan grup navigasi.
 * Label diambil dari i18n `feature.<id>.label`. Urutan, warna & ikon mengikuti Desktop.dc.html.
 */

export const FEATURE_IDS = [
  'home',
  'goals',
  'kalender',
  'jadwal',
  'countdown',
  'to-do',
  'eisenhower',
  'pomodoro',
  'habit',
  'memo',
  'overview',
  'panduan',
  'import-export',
  'sticker',
  'akun',
] as const

export type FeatureId = (typeof FEATURE_IDS)[number]
export type FeatureGroup = 'utama' | 'rencana' | 'fokus' | 'lainnya'

export interface Feature {
  id: FeatureId
  /** Kode PRD, mis. `F12`. */
  code: string
  path: string
  /** Glyph unicode di dalam AppIcon (tile besar, mis. placeholder & landing). */
  glyph: string
  /** Ikon garis di navigasi (sidebar, tab bar, menu). */
  icon: IconName
  /** Nama CSS custom property warna tile. */
  color: string
  group: FeatureGroup
}

export const APP_HOME_PATH = '/app'

const feature = (
  id: FeatureId,
  code: string,
  glyph: string,
  icon: IconName,
  color: string,
  group: FeatureGroup,
): Feature => ({
  id,
  code,
  path: id === 'home' ? APP_HOME_PATH : `${APP_HOME_PATH}/${id}`,
  glyph,
  icon,
  color,
  group,
})

// `home` = Daily (PRD F12: halaman utama menggantikan Home). Jadwal dibuat lewat
// Kalender, jadi tidak tampil di navigasi utama (Desktop.dc.html).
export const FEATURES: readonly Feature[] = [
  feature('home', 'F12', '☀', 'sun', '--icon-daily', 'utama'),
  feature('goals', 'F13', '◎', 'target', '--icon-goals', 'utama'),
  feature('kalender', 'F6', '30', 'calendar-days', '--icon-cal', 'rencana'),
  feature('countdown', 'F5', '⏳', 'hourglass', '--icon-countdown', 'rencana'),
  feature('to-do', 'F2', '✓', 'list-checks', '--icon-todo', 'rencana'),
  feature('eisenhower', 'F3', '⊞', 'layout-grid', '--icon-countdown', 'rencana'),
  feature('pomodoro', 'F4', '25', 'timer', '--icon-pomodoro', 'fokus'),
  feature('habit', 'F7', '★', 'flame', '--icon-habit', 'fokus'),
  feature('memo', 'F8', '✎', 'notebook-pen', '--icon-more', 'fokus'),
  feature('overview', 'F11', '▤', 'chart-column', '--icon-overview', 'fokus'),
  feature('jadwal', 'F1', '▦', 'clock', '--cat-trip', 'lainnya'),
  feature('panduan', 'F9', '?', 'circle-help', '--cat-diri', 'lainnya'),
  feature('import-export', 'F10', '⇅', 'cloud-upload', '--cat-keuangan', 'lainnya'),
  feature('sticker', 'F14', '✿', 'circle', '--cat-karier', 'lainnya'),
  feature('akun', 'F15', '☺', 'circle', '--cat-kerja', 'lainnya'),
]

export const NAV_GROUPS: readonly FeatureGroup[] = ['utama', 'rencana', 'fokus']

/** Tab bar mobile: 4 tab + tombol Menu (Desktop.dc.html mode mobile). */
export const MOBILE_TAB_IDS: readonly FeatureId[] = ['home', 'kalender', 'to-do', 'pomodoro']

export function isFeatureId(value: unknown): value is FeatureId {
  return typeof value === 'string' && (FEATURE_IDS as readonly string[]).includes(value)
}

export function getFeature(id: FeatureId): Feature {
  const found = FEATURES.find((item) => item.id === id)
  // FEATURES mencakup semua FEATURE_IDS (dicek di features.test.ts).
  if (!found) throw new Error(`Fitur tidak terdaftar: ${id}`)
  return found
}

/** Fitur dari path halaman (`/app` → home, `/app/<id>` → id); path lain → home. */
export function featureIdFromPath(path: string): FeatureId {
  const [, root, segment] = path.split('/')
  return root === APP_HOME_PATH.slice(1) && isFeatureId(segment) ? segment : 'home'
}

export function featuresInGroup(group: FeatureGroup): Feature[] {
  return FEATURES.filter((item) => item.group === group)
}
