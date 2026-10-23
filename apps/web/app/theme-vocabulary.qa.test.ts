/**
 * QA T25 (F16) - satu kosakata untuk tema/gaya di seluruh monorepo.
 *
 * Preferensi tampilan ditulis UI (`@improve-personal/tokens`) tetapi disimpan sebagai record
 * `user_prefs` yang skemanya di `@improve-personal/core`. Kalau dua daftar itu beda ejaan, pilihan
 * user hilang saat sync/import: nilai dari UI ditolak schema, atau nilai dari perangkat lain tidak
 * dikenali UI lalu jatuh ke default. Karena itu test ini membandingkan daftar resminya, bukan
 * perilaku satu sisi saja.
 */
import {
  APP_STYLES,
  DEFAULT_APP_STYLE,
  DEFAULT_THEME_COLOR,
  THEME_COLORS,
  normalizeUserPrefs,
} from '@improve-personal/core'
import { DEFAULT_STYLE, DEFAULT_THEME, STYLE_NAMES, THEME_NAMES } from '@improve-personal/tokens'
import { describe, expect, it } from 'vitest'

describe('kosakata tema & gaya: tokens ↔ core (F16)', () => {
  it('daftar tema identik di tokens dan core', () => {
    expect([...THEME_NAMES]).toEqual([...THEME_COLORS])
    expect(DEFAULT_THEME).toBe(DEFAULT_THEME_COLOR)
  })

  it('daftar gaya identik di tokens (dipakai CSS/data-style) dan core (dipakai user_prefs)', () => {
    expect([...STYLE_NAMES].sort()).toEqual([...APP_STYLES].sort())
    expect(DEFAULT_STYLE).toBe(DEFAULT_APP_STYLE)
  })

  it('setiap gaya dari UI selamat melewati normalisasi user_prefs (tidak jatuh ke default)', () => {
    const jatuhKeDefault = STYLE_NAMES.filter(
      (gaya) => normalizeUserPrefs({ style: gaya }).style !== gaya,
    )
    expect(jatuhKeDefault).toEqual([])
  })
})
