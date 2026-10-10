import { beforeEach, describe, expect, it } from 'vitest'

import type { DecoItem } from '~/utils/deco'

import {
  DECO_HIDDEN_STORAGE_KEY,
  DECO_STORAGE_KEY,
  STICKER_RECENT_STORAGE_KEY,
  useDeco,
} from './useDeco'

const HOME = { page: 'home', bucket: 'desktop' } as const
const PLACE = { anchor: 'page', px: 50, py: 50, w: 0.1, rot: 0 }

function stored(): DecoItem[] {
  return JSON.parse(localStorage.getItem(DECO_STORAGE_KEY) ?? '[]')
}

describe('useDeco', () => {
  beforeEach(() => {
    localStorage.clear()
    clearNuxtState(['deco-items', 'deco-hidden', 'deco-editing', 'deco-selected', 'sticker-recent'])
  })

  it('storage rusak → kosong; item valid dimuat', () => {
    localStorage.setItem(DECO_STORAGE_KEY, '{rusak')
    expect(useDeco().items.value).toEqual([])

    clearNuxtState(['deco-items'])
    localStorage.setItem(
      DECO_STORAGE_KEY,
      JSON.stringify([{ id: 'x', sid: 'hewan/kelinci', ...HOME, ...PLACE, z: 1 }, { id: 'y' }]),
    )
    expect(useDeco().items.value.map((item) => item.id)).toEqual(['x'])
  })

  it('tambah: z paling atas di scope, terpilih, tersimpan', () => {
    const deco = useDeco()
    const a = deco.add({ sid: 'hewan/kelinci', ...HOME, ...PLACE })
    const b = deco.add({ sid: 'mood/senang', ...HOME, ...PLACE })
    expect(b?.z).toBe((a?.z ?? 0) + 1)
    expect(deco.selectedId.value).toBe(b?.id)
    expect(stored()).toHaveLength(2)
  })

  it('patch, ke depan, hapus', () => {
    const deco = useDeco()
    const a = deco.add({ sid: 'hewan/kelinci', ...HOME, ...PLACE })
    const b = deco.add({ sid: 'mood/senang', ...HOME, ...PLACE })
    if (!a || !b) throw new Error('gagal menambah')

    deco.patch(a.id, { px: 10 })
    deco.bringToFront(a.id)
    const moved = deco.items.value.find((item) => item.id === a.id)
    expect(moved).toMatchObject({ px: 10, z: b.z + 1 })

    deco.remove(b.id)
    expect(deco.selectedId.value).toBeNull()
    expect(stored().map((item) => item.id)).toEqual([a.id])
  })

  it('reset cuma menghapus halaman + ukuran layar aktif; salin antar ukuran layar', () => {
    const deco = useDeco()
    deco.add({ sid: 'hewan/kelinci', ...HOME, ...PLACE })
    deco.add({ sid: 'hewan/kelinci', page: 'goals', bucket: 'desktop', ...PLACE })

    deco.copyScope(HOME, { page: 'home', bucket: 'hp' }, (item) => ({ ...item, px: 1 }))
    const hp = deco.itemsIn({ page: 'home', bucket: 'hp' })
    expect(hp).toHaveLength(1)
    expect(hp[0]?.px).toBe(1)

    deco.resetScope(HOME)
    expect(deco.itemsIn(HOME)).toEqual([])
    expect(deco.items.value).toHaveLength(2)
  })

  it('sembunyikan hiasan & sticker terakhir dipakai tersimpan', () => {
    const deco = useDeco()
    deco.toggleHidden()
    expect(localStorage.getItem(DECO_HIDDEN_STORAGE_KEY)).toBe('1')
    deco.rememberSticker('icon:hewan/kucing')
    expect(JSON.parse(localStorage.getItem(STICKER_RECENT_STORAGE_KEY) ?? '[]')).toEqual([
      'hewan/kucing',
    ])
  })

  it('masuk/keluar mode hias melepas pilihan', () => {
    const deco = useDeco()
    deco.add({ sid: 'hewan/kelinci', ...HOME, ...PLACE })
    deco.setEditing(true)
    expect(deco.selectedId.value).toBeNull()
    expect(deco.isEditing.value).toBe(true)
  })
})
