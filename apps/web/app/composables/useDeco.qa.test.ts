import { beforeEach, describe, expect, it } from 'vitest'

import { DECO_MAX_ITEMS, type DecoItem } from '~/utils/deco'

import { DECO_STORAGE_KEY, useDeco } from './useDeco'

const PLACE = { anchor: 'journal-feeling', px: 40, py: 30, w: 0.12, rot: 5 }
const DESKTOP = { page: 'memo', bucket: 'desktop' } as const
const HP = { page: 'memo', bucket: 'hp' } as const
const TABLET = { page: 'memo', bucket: 'tablet' } as const

const STATE_KEYS = [
  'deco-items',
  'deco-hidden',
  'deco-editing',
  'deco-selected',
  'sticker-recent',
  'deco-copy-skip',
]

function stored(): DecoItem[] {
  return JSON.parse(localStorage.getItem(DECO_STORAGE_KEY) ?? '[]')
}

describe('QA T24 · set hiasan terpisah per ukuran layar', () => {
  beforeEach(() => {
    localStorage.clear()
    clearNuxtState(STATE_KEYS)
  })

  it('desktop & HP tidak saling bocor walau halamannya sama', () => {
    const deco = useDeco()
    deco.add({ sid: 'mood/bahagia', ...DESKTOP, ...PLACE })
    deco.add({ sid: 'hewan/kelinci', ...HP, ...PLACE })

    expect(deco.itemsIn(DESKTOP).map((item) => item.sid)).toEqual(['mood/bahagia'])
    expect(deco.itemsIn(HP).map((item) => item.sid)).toEqual(['hewan/kelinci'])
    expect(deco.itemsIn(TABLET)).toEqual([])
    // Total tetap tersimpan semua (bukan saling menimpa).
    expect(deco.items.value).toHaveLength(2)
  })

  it('ganti ukuran layar = ganti set: item desktop tidak pernah masuk daftar hp/tablet', () => {
    const deco = useDeco()
    deco.add({ sid: 'mood/bahagia', ...DESKTOP, ...PLACE })
    deco.add({ sid: 'mood/senang', ...TABLET, ...PLACE })

    expect(
      deco.items.value.every((item) => item.bucket === 'desktop' || item.bucket === 'tablet'),
    ).toBe(true)
    expect(deco.itemsIn(HP)).toEqual([])
  })

  it('hapus di satu ukuran layar tidak menghapus hiasan ukuran layar lain', () => {
    const deco = useDeco()
    const desk = deco.add({ sid: 'mood/bahagia', ...DESKTOP, ...PLACE })
    const hp = deco.add({ sid: 'mood/bahagia', ...HP, ...PLACE })
    if (!desk || !hp) throw new Error('gagal menambah')

    deco.remove(desk.id)
    expect(deco.itemsIn(DESKTOP)).toEqual([])
    expect(deco.itemsIn(HP)).toHaveLength(1)
    expect(stored().map((item) => item.id)).toEqual([hp.id])
  })

  it('reset hanya membersihkan halaman + ukuran layar aktif', () => {
    const deco = useDeco()
    deco.add({ sid: 'mood/bahagia', ...DESKTOP, ...PLACE })
    deco.add({ sid: 'mood/bahagia', ...HP, ...PLACE })
    deco.add({ sid: 'mood/bahagia', page: 'overview', bucket: 'desktop', ...PLACE })

    deco.resetScope(DESKTOP)
    expect(deco.itemsIn(DESKTOP)).toEqual([])
    expect(deco.itemsIn(HP)).toHaveLength(1)
    expect(deco.itemsIn({ page: 'overview', bucket: 'desktop' })).toHaveLength(1)
  })
})

describe('QA T24 · tempel / ganti / hapus (alur jurnal)', () => {
  beforeEach(() => {
    localStorage.clear()
    clearNuxtState(STATE_KEYS)
  })

  it('ganti sticker mempertahankan anchor, posisi, rotasi, ukuran', () => {
    const deco = useDeco()
    const added = deco.add({ sid: 'mood/bahagia', ...DESKTOP, ...PLACE })
    if (!added) throw new Error('gagal menambah')

    deco.patch(added.id, { sid: 'aktivitas/kopi' })
    const [updated] = deco.itemsIn(DESKTOP)
    expect(updated).toMatchObject({
      sid: 'aktivitas/kopi',
      anchor: PLACE.anchor,
      px: PLACE.px,
      py: PLACE.py,
      w: PLACE.w,
      rot: PLACE.rot,
    })
    // Tersimpan, bukan cuma di memori.
    expect(stored()[0]?.sid).toBe('aktivitas/kopi')
  })

  it('tempel >1 sticker di kartu jurnal yang sama: urutan tumpuk naik, tidak saling menimpa id', () => {
    const deco = useDeco()
    const a = deco.add({ sid: 'mood/bahagia', ...DESKTOP, ...PLACE })
    const b = deco.add({ sid: 'mood/senang', ...DESKTOP, ...PLACE })
    const c = deco.add({ sid: 'aktivitas/kopi', ...DESKTOP, ...PLACE })
    if (!a || !b || !c) throw new Error('gagal menambah')

    expect(new Set([a.id, b.id, c.id]).size).toBe(3)
    expect([a.z, b.z, c.z]).toEqual([1, 2, 3])
    // Semua di kartu yang sama → tetap 3 item (bukan dibatasi satu per kartu).
    expect(deco.itemsIn(DESKTOP).filter((item) => item.anchor === PLACE.anchor)).toHaveLength(3)
  })

  it('bawa ke depan menaikkan z di atas sticker lain pada halaman+ukuran yang sama', () => {
    const deco = useDeco()
    const a = deco.add({ sid: 'mood/bahagia', ...DESKTOP, ...PLACE })
    const b = deco.add({ sid: 'mood/senang', ...DESKTOP, ...PLACE })
    if (!a || !b) throw new Error('gagal menambah')

    deco.bringToFront(a.id)
    expect(deco.itemsIn(DESKTOP).find((item) => item.id === a.id)?.z).toBe(b.z + 1)
  })

  it('ID tak dikenal: tetap bisa diganti ke sticker sah atau dihapus', () => {
    localStorage.setItem(
      DECO_STORAGE_KEY,
      JSON.stringify([
        { id: 'lama1', sid: 'pack-dihapus/stiker-lama', ...DESKTOP, ...PLACE, z: 1 },
      ]),
    )
    const deco = useDeco()
    expect(deco.itemsIn(DESKTOP)).toHaveLength(1)

    deco.patch('lama1', { sid: 'mood/bahagia' })
    expect(deco.itemsIn(DESKTOP)[0]?.sid).toBe('mood/bahagia')

    deco.remove('lama1')
    expect(deco.itemsIn(DESKTOP)).toEqual([])
    expect(stored()).toEqual([])
  })

  it('storage berisi data berbahaya: dibuang, tidak throw, data sah selamat', () => {
    localStorage.setItem(
      DECO_STORAGE_KEY,
      JSON.stringify([
        { id: 'x1', sid: 'javascript:alert(1)', ...DESKTOP, ...PLACE, z: 1 },
        { id: '<img onerror=alert(1)>', sid: 'mood/bahagia', ...DESKTOP, ...PLACE, z: 1 },
        { id: 'aman', sid: 'mood/bahagia', ...DESKTOP, ...PLACE, z: 1 },
      ]),
    )
    const load = (): ReturnType<typeof useDeco> => useDeco()
    expect(load).not.toThrow()
    expect(load().items.value.map((item) => item.id)).toEqual(['aman'])
  })

  it('jumlah: add berhenti di DECO_MAX_ITEMS dan memberi sinyal null (bukan throw)', () => {
    const deco = useDeco()
    for (let i = 0; i < DECO_MAX_ITEMS; i += 1) {
      expect(
        deco.add({ sid: 'mood/bahagia', page: 'overview', bucket: 'desktop', ...PLACE }),
      ).not.toBeNull()
    }
    expect(
      deco.add({ sid: 'mood/bahagia', page: 'overview', bucket: 'desktop', ...PLACE }),
    ).toBeNull()
    expect(deco.items.value).toHaveLength(DECO_MAX_ITEMS)
  })
})

describe('QA T24 · salin hiasan antar ukuran layar', () => {
  beforeEach(() => {
    localStorage.clear()
    clearNuxtState(STATE_KEYS)
  })

  it('menyalin desktop → hp: id baru, bucket tujuan, posisi hasil adjust dipakai', () => {
    const deco = useDeco()
    const source = deco.add({ sid: 'mood/bahagia', ...DESKTOP, ...PLACE })
    if (!source) throw new Error('gagal menambah')

    deco.copyScope(DESKTOP, HP, (item) => ({ ...item, px: 11 }))
    const [copy] = deco.itemsIn(HP)
    expect(copy?.id).not.toBe(source.id)
    expect(copy?.bucket).toBe('hp')
    expect(copy?.px).toBe(11)
    expect(copy?.anchor).toBe(PLACE.anchor)
    // Sumber tidak berubah.
    expect(deco.itemsIn(DESKTOP)[0]?.px).toBe(PLACE.px)
  })

  it('salin tidak melewati batas jumlah total', () => {
    const deco = useDeco()
    for (let i = 0; i < DECO_MAX_ITEMS - 1; i += 1) {
      deco.add({ sid: 'mood/bahagia', ...DESKTOP, ...PLACE })
    }
    deco.copyScope(DESKTOP, HP, (item) => item)
    deco.copyScope(DESKTOP, HP, (item) => item)
    expect(deco.items.value.length).toBeLessThanOrEqual(DECO_MAX_ITEMS)
  })
})
