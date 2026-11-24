import { describe, expect, it } from 'vitest'

import {
  BASE_SLOT_PX,
  COMPACT_HEAD_PX,
  NOW_SCROLL_OFFSET_PX,
  SLOT_COUNT,
  createRange,
  entryNeed,
  focusPillStyle,
  gridScale,
  isVisible,
  minuteClock,
  placeColumns,
  resizeEntry,
  scrollTopForNow,
  slotHeights,
} from './calendarGrid.ts'

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

  it('yAt mulai dari 0 di 00:00', () => {
    const scale = gridScale(slotHeights([[]]))
    expect(scale.yAt(at(0))).toBe(0)
    expect(scale.yAt(at(1))).toBe(4 * BASE_SLOT_PX)
    expect(scale.yAt(at(5))).toBe(20 * BASE_SLOT_PX)
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

  it('grid menutup sehari penuh: item 00:00 ikut digambar, durasi 0 tidak', () => {
    expect(isVisible({ start: at(0), dur: 15 })).toBe(true)
    expect(isVisible({ start: at(0), dur: 0 })).toBe(false)
  })
})

describe('resizeEntry', () => {
  it('tepi bawah menambah durasi per 15 menit, minimal 15, tidak lewat 24:00', () => {
    expect(resizeEntry('bottom', at(9), 60, 2)).toEqual({ start: at(9), dur: 90 })
    expect(resizeEntry('bottom', at(9), 60, -10)).toEqual({ start: at(9), dur: 15 })
    expect(resizeEntry('bottom', at(23), 30, 8)).toEqual({ start: at(23), dur: 60 })
  })

  it('tepi atas menggeser mulai, akhir tetap, tidak sebelum 00:00', () => {
    expect(resizeEntry('top', at(9), 60, -2)).toEqual({ start: at(8, 30), dur: 90 })
    expect(resizeEntry('top', at(9), 60, 10)).toEqual({ start: at(9, 45), dur: 15 })
    expect(resizeEntry('top', at(0, 15), 60, -4)).toEqual({ start: at(0), dur: 75 })
  })
})

describe('createRange', () => {
  it('klik satu slot tanpa geser = 60 menit', () => {
    expect(createRange(at(9), at(9))).toEqual({ start: at(9), dur: 60 })
  })

  it('seret 3 slot = 45 menit, arah ke atas dan ke bawah sama', () => {
    expect(createRange(at(9), at(9, 30))).toEqual({ start: at(9), dur: 45 })
    expect(createRange(at(9, 30), at(9))).toEqual({ start: at(9), dur: 45 })
  })

  it('ujung dipotong di 24:00, tidak pernah melewati akhir grid', () => {
    expect(createRange(at(23), at(23, 45))).toEqual({ start: at(23), dur: 60 })
    // Slot terakhir: 60 menit tidak muat lagi, jadi hanya selebar slotnya sendiri.
    expect(createRange(at(23, 45), at(23, 45))).toEqual({ start: at(23, 45), dur: 15 })
  })
})

describe('minuteClock', () => {
  it('24:00 tetap "24:00", bukan "00:00"', () => {
    expect(minuteClock(at(0))).toBe('00:00')
    expect(minuteClock(at(9, 45))).toBe('09:45')
    expect(minuteClock(24 * 60)).toBe('24:00')
  })
})

describe('scrollTopForNow', () => {
  const yAt = (minute: number): number => minute * 2

  it('memakai posisi penanda sekarang, 140px di atasnya', () => {
    expect(scrollTopForNow(600, at(10), yAt)).toBe(600 - NOW_SCROLL_OFFSET_PX)
  })

  it('tanpa penanda (hari ini tidak tampil) memakai jam sekarang relatif grid', () => {
    expect(scrollTopForNow(null, at(10), yAt)).toBe(at(10) * 2 - NOW_SCROLL_OFFSET_PX)
  })

  it('jam terlalu pagi tidak menghasilkan scroll negatif', () => {
    expect(scrollTopForNow(null, at(0, 30), yAt)).toBe(0)
  })
})

describe('focusPillStyle', () => {
  it('kartu pendek: pill Fokus 14px dan di tengah kartu', () => {
    expect(focusPillStyle(true)).toEqual({
      top: 'calc(50% - 7px)',
      right: '24px',
      minHeight: '14px',
    })
  })

  it('kartu normal: pill Fokus 18px di atas kartu', () => {
    expect(focusPillStyle(false)).toEqual({ top: '8px', right: '28px', minHeight: '18px' })
  })
})
