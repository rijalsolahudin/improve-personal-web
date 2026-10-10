import { describe, expect, it } from 'vitest'

import {
  HOME_WIDGET_IDS,
  appendToColumn,
  defaultHomeLayout,
  moveWithinColumn,
  parseHomeLayout,
  placeNear,
  setHidden,
  swapColumn,
  toggleWide,
  type HomeLayout,
} from './homeLayout'

function allPlaced(layout: HomeLayout): string[] {
  return [...layout.L, ...layout.R].sort()
}

describe('parseHomeLayout', () => {
  it('bentuk rusak → default', () => {
    for (const raw of [null, 'x', 42, [], { L: 'jadwal' }]) {
      expect(parseHomeLayout(raw)).toEqual(defaultHomeLayout())
    }
  })

  it('buang id asing & duplikat, lengkapi widget yang hilang', () => {
    const layout = parseHomeLayout({
      L: ['memo', '<script>', 'memo', 'stats'],
      R: ['stats', 'pomo'],
      wide: ['memo', 'bogus'],
      hidden: ['goal', 'goal'],
    })
    expect(layout.L.slice(0, 2)).toEqual(['memo', 'stats'])
    expect(layout.R[0]).toBe('pomo')
    expect(allPlaced(layout)).toEqual([...HOME_WIDGET_IDS].sort())
    expect(layout.wide).toEqual(['memo'])
    expect(layout.hidden).toEqual(['goal'])
  })
})

describe('mutasi layout', () => {
  it('naik/turun di kolom sendiri, ujung tidak berubah', () => {
    const base = defaultHomeLayout()
    expect(moveWithinColumn(base, 'stats', -1).L).toEqual(['stats', 'jadwal', 'todo'])
    expect(moveWithinColumn(base, 'jadwal', -1)).toBe(base)
    expect(moveWithinColumn(base, 'memo', 1)).toBe(base)
  })

  it('pindah kolom di posisi sama & lepas lebar penuh', () => {
    const base = toggleWide(defaultHomeLayout(), 'stats')
    const next = swapColumn(base, 'stats')
    expect(next.L).toEqual(['jadwal', 'todo'])
    expect(next.R).toEqual(['pomo', 'stats', 'habit', 'goal', 'memo'])
    expect(next.wide).toEqual([])
    expect(swapColumn(defaultHomeLayout(), 'memo').L.at(-1)).toBe('memo')
  })

  it('sembunyikan & tampilkan lagi', () => {
    const hidden = setHidden(defaultHomeLayout(), 'habit', true)
    expect(hidden.hidden).toEqual(['habit'])
    expect(setHidden(hidden, 'habit', false).hidden).toEqual([])
  })

  it('drag: taruh sebelum/sesudah target lintas kolom', () => {
    const base = defaultHomeLayout()
    expect(placeNear(base, 'memo', 'stats', false).L).toEqual(['jadwal', 'memo', 'stats', 'todo'])
    expect(placeNear(base, 'jadwal', 'pomo', true).R).toEqual([
      'pomo',
      'jadwal',
      'habit',
      'goal',
      'memo',
    ])
    expect(placeNear(base, 'todo', 'todo', true)).toBe(base)
  })

  it('drag ke area kosong: paling bawah kolom', () => {
    const next = appendToColumn(toggleWide(defaultHomeLayout(), 'jadwal'), 'jadwal', 'R')
    expect(next.L).toEqual(['stats', 'todo'])
    expect(next.R.at(-1)).toBe('jadwal')
    expect(next.wide).toEqual([])
  })

  it('tidak memutasi input', () => {
    const base = defaultHomeLayout()
    const snapshot = JSON.stringify(base)
    swapColumn(base, 'todo')
    placeNear(base, 'memo', 'jadwal', false)
    toggleWide(base, 'goal')
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})
