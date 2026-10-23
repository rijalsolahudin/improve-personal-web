/**
 * Regresi QA T25 B2 - satu ejaan gaya, dengan alias untuk data lama.
 *
 * Kanonik = kebab-case (`cute-pure`), sama dengan `STYLE_NAMES`/`data-style` di
 * `@improve-personal/tokens`. Ejaan lama `cute_pure` tetap diterima saat membaca record/sync/berkas
 * import, lalu dinormalkan ke bentuk kanonik. Yang dijaga di sini: Cute Pure tidak pernah jatuh ke
 * Cute, dan nilai asing tetap jatuh ke default.
 */
import { describe, expect, it } from 'vitest'

import {
  APP_STYLES,
  LEGACY_APP_STYLES,
  LEGACY_APP_STYLE_TO_CURRENT,
  appStyleSchema,
  isLegacyAppStyle,
  normalizeAppStyle,
} from '../enums.ts'
import { normalizeUserPrefs, normalizeUserPrefsFrom, userPrefsSchema } from './user-prefs.ts'

const ID = '018f2c4e-0000-7000-8000-000000000002'
const NOW = 1_700_000_000_000

describe('kosakata gaya kanonik (T25 B2)', () => {
  it('tidak ada nilai kanonik yang memakai snake_case', () => {
    expect(APP_STYLES.filter((style) => style.includes('_'))).toEqual([])
    expect(APP_STYLES).toContain('cute-pure')
  })

  it('ejaan lama dipetakan ke kanonik, nilai asing ditolak', () => {
    for (const legacy of LEGACY_APP_STYLES) {
      expect(isLegacyAppStyle(legacy)).toBe(true)
      expect(normalizeAppStyle(legacy)).toBe(LEGACY_APP_STYLE_TO_CURRENT[legacy])
    }

    for (const style of APP_STYLES) expect(normalizeAppStyle(style)).toBe(style)

    for (const asing of ['', ' ', 'cute pure', 'CUTE', 'cute_purple', 42, null, undefined]) {
      expect(normalizeAppStyle(asing)).toBeNull()
    }
  })

  it('schema gaya menerima kanonik & alias, hasilnya selalu kanonik', () => {
    expect(appStyleSchema.parse('cute-pure')).toBe('cute-pure')
    expect(appStyleSchema.parse('cute_pure')).toBe('cute-pure')
    expect(appStyleSchema.safeParse('cute pure').success).toBe(false)
    expect(appStyleSchema.safeParse('CUTE').success).toBe(false)
  })
})

describe('user_prefs - migrasi ejaan gaya lama (T25 B2)', () => {
  it('normalisasi membaca `cute_pure` sebagai Cute Pure, bukan Cute', () => {
    const hasil = normalizeUserPrefs({ themeColor: 'ungu', style: 'cute_pure' })

    expect(hasil.style).toBe('cute-pure')
    expect(hasil.fallbacks).toEqual([])
  })

  it('normalisasi nilai asing tetap kembali ke default dan dilaporkan', () => {
    const hasil = normalizeUserPrefs({ style: 'neon' })

    expect(hasil.style).toBe('cute')
    expect(hasil.fallbacks.map((fallback) => fallback.field)).toEqual(['style'])
  })

  it('schema ketat menerima record lama lalu menuliskannya sebagai kanonik', () => {
    const hasil = userPrefsSchema.safeParse({
      id: ID,
      themeColor: 'hijau',
      style: 'cute_pure',
      hideDecorations: false,
      updatedAt: NOW,
    })

    expect(hasil.success).toBe(true)
    expect(hasil.success ? hasil.data.style : null).toBe('cute-pure')
    expect(userPrefsSchema.safeParse({ ...recordLama(), style: 'neon' }).success).toBe(false)
  })

  it('record hasil normalisasi dari payload lama sudah kanonik dan lolos schema tulis', () => {
    const record = normalizeUserPrefsFrom({ themeColor: 'kuning', style: 'cute_pure' }, ID, NOW)

    expect(record.style).toBe('cute-pure')
    expect(userPrefsSchema.safeParse(record).success).toBe(true)
  })
})

function recordLama() {
  return { id: ID, themeColor: 'hijau', style: 'cute_pure', hideDecorations: false, updatedAt: NOW }
}
