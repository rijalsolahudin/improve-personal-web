import { STYLE_NAMES } from '@improve-personal/tokens'
import { describe, expect, it } from 'vitest'

import { familyOf, styleGroups, stylePreview } from './appearancePreview'

describe('stylePreview', () => {
  it('Clean: garis tipis, bayangan lembut ber-blur, tanpa grid', () => {
    expect(stylePreview('clean')).toEqual({
      fontFamily: "'Baloo 2', 'Nunito', sans-serif",
      fontWeight: '800',
      borderRadius: '12px',
      border: '1px solid var(--mute-3)',
      boxShadow: '0px 2.4px 12px rgba(94,72,40,.08)',
      isPatterned: false,
    })
  })

  it('Cute: garis tinta penuh dan bayangan keras warna bawaan', () => {
    const preview = stylePreview('cute')
    expect(preview.border).toBe('2px solid var(--ink)')
    expect(preview.boxShadow).toBe('0px 4px 0px rgba(47,42,36,.18)')
    expect(preview.isPatterned).toBe(true)
  })

  it('gaya tanpa garis & tanpa bayangan tidak menulis nilai 0px', () => {
    expect(stylePreview('simple').border).toBe('none')
    expect(stylePreview('kertas').boxShadow).toBe('none')
    expect(stylePreview('tegas').borderRadius).toBe('0px')
  })
})

describe('styleGroups', () => {
  it('membagi seluruh gaya ke Cute lalu Klasik tanpa ada yang tertinggal', () => {
    const groups = styleGroups()
    expect(groups.map((group) => group.family)).toEqual(['cute', 'klasik'])
    expect(groups[0]?.styles).toEqual(['clean', 'cute', 'cute-pure'])
    expect(groups.flatMap((group) => group.styles).sort()).toEqual([...STYLE_NAMES].sort())
  })

  it('familyOf menunjuk keluarga gaya', () => {
    expect(familyOf('cute-pure')).toBe('cute')
    expect(familyOf('elegan')).toBe('klasik')
  })
})
