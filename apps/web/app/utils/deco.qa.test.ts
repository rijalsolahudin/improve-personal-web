import { describe, expect, it } from 'vitest'

import {
  DECO_DEFAULT_SIZE,
  DECO_MAX_ITEMS,
  DECO_MAX_SIZE,
  DECO_MIN_SIZE,
  boxOnAnchor,
  bucketForWidth,
  isStickerId,
  parseDecoItems,
  placementOnAnchor,
  tidyIntoWidth,
  type AnchorRect,
  type DecoItem,
} from './deco'
import { findSticker } from './stickers'

const ITEM: DecoItem = {
  id: 'st1',
  sid: 'mood/bahagia',
  page: 'memo',
  bucket: 'desktop',
  anchor: 'journal-feeling',
  px: 50,
  py: 25,
  w: 0.2,
  rot: 12,
  z: 3,
}
const ANCHOR: AnchorRect = { x: 100, y: 200, w: 400, h: 300, kind: 'content' }

function anchorOf(width: number): AnchorRect {
  return { ...ANCHOR, w: width }
}

describe('QA T24 · ukuran layar (set hiasan terpisah)', () => {
  it('melewati batas 600 & 1024 dua arah: desktop → tablet → hp → tablet → desktop', () => {
    expect(bucketForWidth(1400)).toBe('desktop')
    expect(bucketForWidth(1025)).toBe('desktop')
    // Turun melewati batas desktop→tablet.
    expect(bucketForWidth(1024)).toBe('tablet')
    // Turun melewati batas tablet→hp.
    expect(bucketForWidth(599)).toBe('hp')
    // Naik lagi melewati kedua batas (resize jendela dua arah).
    expect(bucketForWidth(600)).toBe('tablet')
    expect(bucketForWidth(1024)).toBe('tablet')
    expect(bucketForWidth(1025)).toBe('desktop')
  })

  it('lebar pecahan tidak salah bucket', () => {
    expect(bucketForWidth(599.9)).toBe('hp')
    expect(bucketForWidth(600.1)).toBe('tablet')
    expect(bucketForWidth(1024.1)).toBe('desktop')
  })
})

describe('QA T24 · elemen melebar → sticker ikut (posisi %)', () => {
  it('anchor 2× lebih lebar: titik tengah & ukuran ikut 2×, posisi % tetap', () => {
    const narrow = boxOnAnchor(ITEM, anchorOf(400))
    const wide = boxOnAnchor(ITEM, anchorOf(800))

    // px 50% = titik tengah anchor, berapa pun lebarnya.
    expect(narrow.left + narrow.size / 2).toBe(ANCHOR.x + 200)
    expect(wide.left + wide.size / 2).toBe(ANCHOR.x + 400)

    // Titik tengah vertikal tidak terpengaruh lebar (py relatif tinggi anchor yang sama);
    // `top` bergeser hanya karena ukuran sticker ikut membesar (tetap di tengah).
    expect(wide.top + wide.size / 2).toBe(narrow.top + narrow.size / 2)
    expect(wide.top + wide.size / 2).toBe(ANCHOR.y + 75)

    // Ukuran relatif (w = 20% lebar anchor) → ikut melebar, tetap di batas aman.
    expect(wide.size).toBe(Math.min(DECO_MAX_SIZE, 160))
    expect(wide.size).toBeGreaterThanOrEqual(narrow.size)
  })

  it('simpan ulang setelah elemen melebar tidak menggeser posisi relatif', () => {
    const wide = boxOnAnchor(ITEM, anchorOf(800))
    const saved = placementOnAnchor(wide, anchorOf(800))
    expect(saved.px).toBeCloseTo(ITEM.px, 1)
    expect(saved.py).toBeCloseTo(ITEM.py, 1)
    expect(saved.rot).toBe(ITEM.rot)
    // `w` relatif: sama untuk anchor sempit maupun lebar.
    expect(saved.w).toBeCloseTo(wide.size / 800, 4)
  })

  it('lebar anchor mengecil: ukuran di-clamp minimum, tidak jadi 0 / negatif', () => {
    const tiny = boxOnAnchor({ ...ITEM, w: 0.01 }, anchorOf(100))
    expect(tiny.size).toBe(DECO_MIN_SIZE)
  })
})

describe('QA T24 · 100 sticker tetap ringan (benchmark geometri)', () => {
  it('100 sticker × 60 frame (satu detik gerak) selesai jauh di bawah 16 ms/frame', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      ...ITEM,
      id: `st${i}`,
      px: (i * 37) % 100,
      py: (i * 61) % 100,
      w: 0.05 + (i % 5) * 0.02,
    }))
    const anchors = [anchorOf(400), { ...ANCHOR, y: 600 }, { ...ANCHOR, y: 1000 }]

    // Satu kali hitung semua box (yang dikerjakan tiap frame saat 1 sticker digeser).
    const start = performance.now()
    let sum = 0
    for (let frame = 0; frame < 60; frame += 1) {
      for (const [index, item] of items.entries()) {
        const anchor = anchors[index % anchors.length]
        if (!anchor) continue
        const box = boxOnAnchor(item, anchor)
        sum += box.left + box.top + box.size
      }
    }
    const elapsed = performance.now() - start
    const perFrame = elapsed / 60

    expect(sum).toBeGreaterThan(0)
    // Budget INP 200 ms (performance.md) untuk satu interaksi; hitungan murni harus < 16 ms/frame.
    expect(perFrame).toBeLessThan(16)
    expect(Number.isFinite(perFrame)).toBe(true)
  })

  it('100 sticker tetap menghasilkan box valid (tidak NaN / off-screen tak terbatas)', () => {
    const boxes = Array.from({ length: 100 }, (_, i) =>
      boxOnAnchor({ ...ITEM, id: `s${i}`, px: i % 50, py: i % 40 }, ANCHOR),
    )
    for (const box of boxes) {
      expect(Number.isFinite(box.left)).toBe(true)
      expect(Number.isFinite(box.top)).toBe(true)
      expect(box.size).toBeGreaterThanOrEqual(DECO_MIN_SIZE)
      expect(box.size).toBeLessThanOrEqual(DECO_MAX_SIZE)
    }
  })
})

describe('QA T24 · ID tak dikenal → placeholder, bukan error', () => {
  it('id berformat sah tapi tidak ada di katalog: lookup null tanpa throw', () => {
    const sid = 'pack-dihapus/stiker-lama'
    expect(isStickerId(sid)).toBe(true)
    expect(() => findSticker(sid)).not.toThrow()
    expect(findSticker(sid)).toBeNull()
    // Tetap bisa disimpan (user masih bisa mengganti/menghapusnya).
    const stored = parseDecoItems([{ ...ITEM, sid }])
    expect(stored).toHaveLength(1)
    expect(stored[0]?.sid).toBe(sid)
  })

  it('ID berbahaya tetap ditolak storage', () => {
    expect(isStickerId('javascript:alert(1)')).toBe(false)
    expect(isStickerId('mood/<script>')).toBe(false)
    const items = parseDecoItems([
      { ...ITEM, sid: 'javascript:alert(1)' },
      { ...ITEM, id: 'ok', sid: 'mood/bahagia' },
    ])
    expect(items.map((item) => item.id)).toEqual(['ok'])
  })
})

describe('QA T24 · batas jumlah (catatan AC "tanpa batas")', () => {
  it('storage memotong di DECO_MAX_ITEMS (300) — pengaman, bukan batas desain', () => {
    const many = Array.from({ length: DECO_MAX_ITEMS + 25 }, (_, i) => ({
      ...ITEM,
      id: `s${i}`,
    }))
    expect(parseDecoItems(many)).toHaveLength(DECO_MAX_ITEMS)
    // Jauh di atas angka AC (100 sticker per halaman) — tidak menghalangi pemakaian normal.
    expect(DECO_MAX_ITEMS).toBeGreaterThanOrEqual(300)
  })
})

describe('QA T24 · salin antar ukuran layar', () => {
  it('hiasan yang tersalin masuk ke dalam lebar layar tujuan (margin 8px), py & rot tetap', () => {
    const item = { ...ITEM, px: 180, w: 0.4 }
    const tidy = tidyIntoWidth(item, ANCHOR, 500)
    const box = boxOnAnchor(tidy, ANCHOR)
    expect(box.left).toBeGreaterThanOrEqual(8)
    expect(box.left + box.size).toBeLessThanOrEqual(500 - 8)
    expect(tidy.py).toBe(item.py)
    expect(tidy.rot).toBe(item.rot)
  })
})

describe('QA T24 · default ukuran', () => {
  it('ukuran default ada di dalam batas min/max', () => {
    expect(DECO_DEFAULT_SIZE).toBeGreaterThanOrEqual(DECO_MIN_SIZE)
    expect(DECO_DEFAULT_SIZE).toBeLessThanOrEqual(DECO_MAX_SIZE)
  })
})
