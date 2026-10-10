/**
 * Registri 15 fitur (docs/PRD F1–F15) → route, ikon, dan grup navigasi.
 * Label diambil dari i18n `feature.<id>.label`. Urutan & warna mengikuti Home Desktop.dc.html.
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
  /** Glyph unicode di dalam AppIcon (design: no icon font). */
  glyph: string
  /** Nama CSS custom property warna tile. */
  color: string
  group: FeatureGroup
}

export const APP_HOME_PATH = '/app'

const feature = (
  id: FeatureId,
  code: string,
  glyph: string,
  color: string,
  group: FeatureGroup,
): Feature => ({
  id,
  code,
  path: id === 'home' ? APP_HOME_PATH : `${APP_HOME_PATH}/${id}`,
  glyph,
  color,
  group,
})

export const FEATURES: readonly Feature[] = [
  feature('home', 'F12', '⌂', '--icon-home', 'utama'),
  feature('goals', 'F13', '◎', '--icon-goals', 'utama'),
  feature('kalender', 'F6', '30', '--icon-cal', 'rencana'),
  feature('jadwal', 'F1', '▦', '--cat-trip', 'rencana'),
  feature('countdown', 'F5', '⏳', '--icon-countdown', 'rencana'),
  feature('to-do', 'F2', '✓', '--icon-todo', 'rencana'),
  feature('eisenhower', 'F3', '⊞', '--icon-countdown', 'rencana'),
  feature('pomodoro', 'F4', '25', '--icon-pomodoro', 'fokus'),
  feature('habit', 'F7', '★', '--icon-habit', 'fokus'),
  feature('memo', 'F8', '✎', '--icon-more', 'fokus'),
  feature('overview', 'F11', '▤', '--icon-overview', 'fokus'),
  feature('panduan', 'F9', '?', '--cat-diri', 'lainnya'),
  feature('import-export', 'F10', '⇅', '--cat-keuangan', 'lainnya'),
  feature('sticker', 'F14', '✿', '--cat-karier', 'lainnya'),
  feature('akun', 'F15', '☺', '--cat-kerja', 'lainnya'),
]

export const NAV_GROUPS: readonly FeatureGroup[] = ['utama', 'rencana', 'fokus']

/** Tab bar mobile: 4 tab + tombol Menu (Home Desktop.dc.html mode mobile). */
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

export function featuresInGroup(group: FeatureGroup): Feature[] {
  return FEATURES.filter((item) => item.group === group)
}
