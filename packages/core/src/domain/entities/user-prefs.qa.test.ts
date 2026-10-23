/**
 * QA T25 (F16) - `user_prefs`: tema & gaya tersimpan per akun.
 *
 * Fokus: aturan "nilai tak dikenal → default TANPA error" (AC T25) harus berlaku di jalur BACA
 * (sync/import versi lain), sedangkan jalur TULIS tetap ketat supaya berkas rusak tidak lolos diam-diam.
 */
import { describe, expect, it } from 'vitest'

import { APP_STYLES, DEFAULT_APP_STYLE, DEFAULT_THEME_COLOR, THEME_COLORS } from '../enums.ts'
import {
  DEFAULT_USER_PREFS,
  isKnownAppStyle,
  isKnownThemeColor,
  normalizeUserPrefs,
  normalizeUserPrefsFrom,
  userPrefsSchema,
} from './user-prefs.ts'

const ID = '018f2c4e-0000-7000-8000-000000000001'
const NOW = 1_700_000_000_000

describe('user_prefs - normalisasi (F16)', () => {
  it('nilai yang dikenal dipakai apa adanya tanpa laporan perbaikan', () => {
    for (const themeColor of THEME_COLORS) {
      for (const style of APP_STYLES) {
        const hasil = normalizeUserPrefs({ themeColor, style, hideDecorations: true })
        expect(hasil).toEqual({ themeColor, style, hideDecorations: true, fallbacks: [] })
      }
    }
  })

  it('default pertama kali Cute + Kuning', () => {
    expect(DEFAULT_USER_PREFS).toEqual({
      themeColor: 'kuning',
      style: 'cute',
      hideDecorations: false,
    })
    expect(DEFAULT_USER_PREFS.themeColor).toBe(DEFAULT_THEME_COLOR)
    expect(DEFAULT_USER_PREFS.style).toBe(DEFAULT_APP_STYLE)
    expect(normalizeUserPrefs({})).toEqual({
      themeColor: DEFAULT_THEME_COLOR,
      style: DEFAULT_APP_STYLE,
      hideDecorations: false,
      fallbacks: [],
    })
  })

  it('nilai tak dikenal kembali ke default tanpa error dan melaporkan apa yang diganti', () => {
    const hasil = normalizeUserPrefs({
      themeColor: 'merah',
      style: '<script>alert(1)</script>',
      hideDecorations: 'ya',
    })
    expect(hasil.themeColor).toBe(DEFAULT_THEME_COLOR)
    expect(hasil.style).toBe(DEFAULT_APP_STYLE)
    expect(hasil.hideDecorations).toBe(false)
    expect(hasil.fallbacks.map((fallback) => fallback.field).sort()).toEqual([
      'hideDecorations',
      'style',
      'themeColor',
    ])
    for (const fallback of hasil.fallbacks) {
      expect(String(fallback.received)).not.toBe('')
    }
  })

  it('payload rusak (bukan objek) tidak melempar', () => {
    for (const rusak of [null, undefined, 'kuning', 42, [], ['ungu']]) {
      expect(() => normalizeUserPrefs(rusak)).not.toThrow()
      expect(normalizeUserPrefs(rusak).themeColor).toBe(DEFAULT_THEME_COLOR)
      expect(normalizeUserPrefs(rusak).style).toBe(DEFAULT_APP_STYLE)
    }
  })

  it('field tambahan diabaikan (toleran terhadap versi skema lebih baru)', () => {
    const hasil = normalizeUserPrefs({
      themeColor: 'ungu',
      style: 'elegan',
      hideDecorations: false,
      futureField: 'abaikan',
    })
    expect(hasil.themeColor).toBe('ungu')
    expect(hasil.style).toBe('elegan')
    expect(hasil.fallbacks).toEqual([])
  })

  it('helper pengenal nilai konsisten dengan daftar enum', () => {
    for (const themeColor of THEME_COLORS) expect(isKnownThemeColor(themeColor)).toBe(true)
    for (const style of APP_STYLES) expect(isKnownAppStyle(style)).toBe(true)
    expect(isKnownThemeColor('merah')).toBe(false)
    expect(isKnownThemeColor(1)).toBe(false)
    expect(isKnownAppStyle('cute ')).toBe(false)
    expect(isKnownAppStyle(null)).toBe(false)
  })
})

describe('user_prefs - schema & record', () => {
  it('schema ketat: menolak nilai asing dan field tak dikenal', () => {
    const sah = {
      id: ID,
      themeColor: 'ungu',
      style: 'elegan',
      hideDecorations: false,
      updatedAt: NOW,
    }
    expect(userPrefsSchema.safeParse(sah).success).toBe(true)
    expect(userPrefsSchema.safeParse({ ...sah, themeColor: 'merah' }).success).toBe(false)
    expect(userPrefsSchema.safeParse({ ...sah, style: 'neon' }).success).toBe(false)
    expect(userPrefsSchema.safeParse({ ...sah, extra: true }).success).toBe(false)
    expect(userPrefsSchema.safeParse({ ...sah, id: 'bukan-uuidv7' }).success).toBe(false)
  })

  it('schema menerima seluruh gaya & tema resmi', () => {
    for (const style of APP_STYLES) {
      for (const themeColor of THEME_COLORS) {
        const hasil = userPrefsSchema.safeParse({
          id: ID,
          themeColor,
          style,
          hideDecorations: true,
          updatedAt: NOW,
        })
        expect(hasil.success, `${themeColor}/${style} ditolak schema`).toBe(true)
      }
    }
  })

  it('normalizeUserPrefsFrom mengisi id & updatedAt untuk record yang mau ditulis', () => {
    const record = normalizeUserPrefsFrom({ themeColor: 'hijau' }, ID, NOW)
    expect(record).toEqual({
      id: ID,
      themeColor: 'hijau',
      style: DEFAULT_APP_STYLE,
      hideDecorations: false,
      updatedAt: NOW,
    })
    expect(userPrefsSchema.safeParse(record).success).toBe(true)
  })
})
