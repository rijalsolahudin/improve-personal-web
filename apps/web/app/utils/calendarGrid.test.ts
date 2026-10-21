import { describe, expect, it } from 'vitest'

import {
  BASE_SLOT_PX,
  COMPACT_HEAD_PX,
  SLOT_COUNT,
  entryNeed,
  gridScale,
  isVisible,
  placeColumns,
  resizeEntry,
  slotHeights,
} from './calendarGrid'

const at = (hour: number, minute = 0): number => hour * 60 + minute

describe('placeColumns', () => {
  it('item bertumpuk dibagi kolom; kelompok terpisah mulai dari kolom 0 lagi', () => {
    const placed = placeColumns([
      { key: 'a', start: at(9), dur: 60, need: 0 },
      { key: 'b', start: at(9, 30), dur: 60, need: 0 },
      { key: 'c', start: at(12), dur: 30, need: 0 },
    ])
    const byKey = Object.fromEntries(placed.map((item) => [item.key, [item.col, item.cols]]))
    expect(byKey).toEqual({ a: [0, 2], b: [1, 2], c: [0, 1] })
  })
})

describe('slotHeights & gridScale', () => {
  it('slot dasar 13px; item yang butuh ruang melebarkan slotnya di semua kolom', () => {
    const empty = slotHeights([[]])
    expect(empty).toHaveLength(SLOT_COUNT)
    expect(new Set(empty)).toEqual(new Set([BASE_SLOT_PX]))

    // 09:00 selama 15 menit (1 slot) butuh 40px → slot itu jadi 42px (+2 jarak).
    const heights = slotHeights([[], [{ key: 'x', start: at(9), dur: 15, need: 40 }]])
    const scale = gridScale(heights)
    expect(scale.yAt(at(9, 15)) - scale.yAt(at(9))).toBe(42)
    expect(scale.yAt(at(10, 15)) - scale.yAt(at(10))).toBe(BASE_SLOT_PX)
    expect(scale.height).toBe(SLOT_COUNT * BASE_SLOT_PX + 42 - BASE_SLOT_PX)
  })

  it('yAt mulai dari 0 di 05:00', () => {
    const scale = gridScale(slotHeights([[]]))
    expect(scale.yAt(at(5))).toBe(0)
    expect(scale.yAt(at(6))).toBe(4 * BASE_SLOT_PX)
  })
})

describe('entryNeed & isVisible', () => {
  it('jadwal dengan to-do tertaut butuh ruang per baris, termasuk mode ringkas', () => {
    expect(entryNeed('event', 30, 0, false)).toBe(22)
    expect(entryNeed('event', 60, 0, false)).toBe(40)
    expect(entryNeed('event', 60, 2, false)).toBe(46 + 2 * 28 + 20)
    expect(entryNeed('event', 60, 2, true)).toBe(COMPACT_HEAD_PX + 2 * 28 + 20)
    expect(entryNeed('event', 60, 0, true)).toBe(52)
    expect(entryNeed('task', 30, 0, false)).toBe(26)
  })

  it('item yang selesai sebelum 05:00 tidak digambar', () => {
    expect(isVisible({ start: at(4), dur: 30 })).toBe(false)
    expect(isVisible({ start: at(4, 45), dur: 30 })).toBe(true)
  })
})

describe('resizeEntry', () => {
  it('tepi bawah menambah durasi per 15 menit, minimal 15, tidak lewat 24:00', () => {
    expect(resizeEntry('bottom', at(9), 60, 2)).toEqual({ start: at(9), dur: 90 })
    expect(resizeEntry('bottom', at(9), 60, -10)).toEqual({ start: at(9), dur: 15 })
    expect(resizeEntry('bottom', at(23), 30, 8)).toEqual({ start: at(23), dur: 60 })
  })

  it('tepi atas menggeser mulai, akhir tetap, tidak sebelum 05:00', () => {
    expect(resizeEntry('top', at(9), 60, -2)).toEqual({ start: at(8, 30), dur: 90 })
    expect(resizeEntry('top', at(9), 60, 10)).toEqual({ start: at(9, 45), dur: 15 })
    expect(resizeEntry('top', at(5, 15), 60, -4)).toEqual({ start: at(5), dur: 75 })
  })
})
