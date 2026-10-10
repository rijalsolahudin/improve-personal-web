// Lookup katalog sticker. Modul ini (+ katalog & maskot tambahan) cuma diimpor komponen
// sticker yang di-lazy-load, jadi tidak masuk bundle awal.
import { baseSid } from './deco'
import { BLUSHING_MASCOTS, MASCOTS, type MascotPart } from './mascots'
import { STICKER_PACKS, type StickerArt } from './stickerCatalog'
import { BLUSHING_STICKER_MASCOTS, STICKER_MASCOTS } from './stickerMascots'

export interface Sticker {
  /** `pack/slug` tanpa awalan `icon:`. */
  readonly id: string
  readonly name: string
  readonly pack: string
  readonly packName: string
  readonly tint: string
  readonly art: StickerArt
}

export interface MascotArt {
  readonly parts: readonly MascotPart[]
  readonly hasBlush: boolean
}

let index: Map<string, Sticker> | null = null

function stickerIndex(): Map<string, Sticker> {
  if (index) return index
  index = new Map()
  for (const pack of STICKER_PACKS) {
    for (const [slug, name, art] of pack.items) {
      const id = `${pack.id}/${slug}`
      index.set(id, { id, name, pack: pack.id, packName: pack.name, tint: pack.tint, art })
    }
  }
  return index
}

export function findSticker(sid: string): Sticker | null {
  return stickerIndex().get(baseSid(sid)) ?? null
}

export function stickersInPack(packId: string): Sticker[] {
  return [...stickerIndex().values()].filter((sticker) => sticker.pack === packId)
}

/** Cari di nama sticker + nama pack (mis. "kopi", "ultah"). */
export function searchStickers(query: string): Sticker[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return [...stickerIndex().values()].filter((sticker) =>
    `${sticker.name} ${sticker.packName}`.toLowerCase().includes(q),
  )
}

export function mascotArt(name: string): MascotArt | null {
  if (name in MASCOTS) {
    const key = name as keyof typeof MASCOTS
    return { parts: MASCOTS[key], hasBlush: BLUSHING_MASCOTS.has(key) }
  }
  if (name in STICKER_MASCOTS) {
    const parts = STICKER_MASCOTS[name as keyof typeof STICKER_MASCOTS]
    return { parts, hasBlush: BLUSHING_STICKER_MASCOTS.has(name) }
  }
  return null
}
