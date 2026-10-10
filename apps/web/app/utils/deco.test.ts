import { describe, expect, it } from 'vitest'

import {
  DECO_MAX_ITEMS,
  DECO_MAX_SIZE,
  RECENT_STICKER_LIMIT,
  boxOnAnchor,
  bucketForWidth,
  isStickerId,
  parseDecoItems,
  placementOnAnchor,
  pushRecent,
  tidyIntoWidth,
  topZ,
  type AnchorRect,
  type DecoItem,
} from './deco'

const ITEM: DecoItem = {
  id: 'a1',
  sid: 'mood/bahagia',
  page: 'home',
  bucket: 'desktop',
  anchor: 'todo',
  px: 50,
  py: 25,
  w: 0.2,
  rot: 10,
  z: 1,
}
const ANCHOR: AnchorRect = { x: 100, y: 200, w: 400, h: 300, kind: 'content' }

describe('bucketForWidth', () => {
  it('HP < 600, tablet 600–1024, desktop > 1024', () => {
    expect(bucketForWidth(599)).toBe('hp')
    expect(bucketForWidth(600)).toBe('tablet')
    expect(bucketForWidth(1024)).toBe('tablet')
    expect(bucketForWidth(1025)).toBe('desktop')
  })
})

describe('parseDecoItems', () => {
  it('bukan array → kosong', () => {
    expect(parseDecoItems(null)).toEqual([])
    expect(parseDecoItems({ 0: ITEM })).toEqual([])
  })

  it('buang item rusak, id ganda, dan sid berbahaya', () => {
    const items = parseDecoItems([
      ITEM,
      { ...ITEM },
      { ...ITEM, id: 'b', sid: 'javascript:alert(1)' },
      { ...ITEM, id: 'c', bucket: 'tv' },
      { ...ITEM, id: 'd', px: Number.NaN },
      { ...ITEM, id: '<img>' },
      'x',
    ])
    expect(items).toEqual([ITEM])
  })

  it('angka di luar batas di-clamp, jumlah dibatasi', () => {
    const [item] = parseDecoItems([{ ...ITEM, w: 999, rot: 5000, z: 1.6 }])
    expect(item).toMatchObject({ w: 10, rot: 720, z: 2 })
    const many = Array.from({ length: DECO_MAX_ITEMS + 5 }, (_, i) => ({ ...ITEM, id: `i${i}` }))
    expect(parseDecoItems(many)).toHaveLength(DECO_MAX_ITEMS)
  })
})

describe('geometri', () => {
  it('boxOnAnchor ↔ placementOnAnchor bolak-balik', () => {
    const box = boxOnAnchor(ITEM, ANCHOR)
    expect(box).toEqual({ size: 80, left: 260, top: 235, rot: 10 })
    expect(placementOnAnchor(box, ANCHOR)).toEqual({ px: 50, py: 25, w: 0.2, rot: 10 })
  })

  it('ukuran dijaga dalam batas', () => {
    expect(boxOnAnchor({ ...ITEM, w: 5 }, ANCHOR).size).toBe(DECO_MAX_SIZE)
  })

  it('tidyIntoWidth menarik sticker yang keluar layar kembali ke dalam', () => {
    const outside = { ...ITEM, px: 200 }
    const tidy = tidyIntoWidth(outside, ANCHOR, 600)
    const box = boxOnAnchor(tidy, ANCHOR)
    expect(box.left + box.size).toBeLessThanOrEqual(600 - 8)
    expect(tidy.py).toBe(outside.py)
  })
})

describe('sticker', () => {
  it('validasi id sticker', () => {
    expect(isStickerId('hewan/kelinci')).toBe(true)
    expect(isStickerId('icon:mood/bahagia')).toBe(true)
    expect(isStickerId('emoji:😀')).toBe(false)
    expect(isStickerId('../x')).toBe(false)
  })

  it('pushRecent: terbaru di depan, tanpa duplikat & awalan ikon, dibatasi', () => {
    expect(pushRecent(['a/b', 'c/d'], 'icon:c/d')).toEqual(['c/d', 'a/b'])
    const full = Array.from({ length: RECENT_STICKER_LIMIT }, (_, i) => `p/s${i}`)
    expect(pushRecent(full, 'p/baru')).toHaveLength(RECENT_STICKER_LIMIT)
  })

  it('topZ', () => {
    expect(topZ([])).toBe(0)
    expect(topZ([ITEM, { ...ITEM, z: 7 }])).toBe(7)
  })
})
