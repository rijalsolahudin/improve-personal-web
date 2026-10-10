import { describe, expect, it } from 'vitest'

import { createGoalsMock } from '~/composables/goals/mock'

import { isStickerId } from './deco'
import { STICKER_PACKS } from './stickerCatalog'
import { findSticker, mascotArt, searchStickers, stickersInPack } from './stickers'

describe('katalog sticker', () => {
  it('semua id valid & unik, semua maskot bisa dirender', () => {
    const ids = new Set<string>()
    for (const pack of STICKER_PACKS) {
      for (const [slug, , art] of pack.items) {
        const id = `${pack.id}/${slug}`
        expect(isStickerId(id), id).toBe(true)
        expect(ids.has(id), id).toBe(false)
        ids.add(id)
        if (typeof art === 'object') expect(mascotArt(art.m), art.m).not.toBeNull()
      }
    }
  })

  it('sampul di data contoh Goals ada di katalog', () => {
    for (const goal of createGoalsMock('2026-10-09')) {
      if (goal.cover) expect(findSticker(goal.cover), goal.cover).not.toBeNull()
    }
  })

  it('findSticker paham awalan ikon; id asing → null', () => {
    expect(findSticker('icon:hewan/kelinci')).toMatchObject({ name: 'Kelinci', pack: 'hewan' })
    expect(findSticker('hewan/unicorn-palsu')).toBeNull()
  })

  it('cari di nama sticker & nama pack', () => {
    expect(searchStickers('kopi').map((s) => s.id)).toContain('aktivitas/kopi')
    expect(searchStickers('  ').length).toBe(0)
    expect(searchStickers('Hewan').length).toBe(stickersInPack('hewan').length)
  })
})
