import {
  JOURNAL_STICKER_MAX,
  JOURNAL_STICKER_MAX_LINE,
  JOURNAL_STICKER_SCALE_MAX,
  JOURNAL_STICKER_SCALE_MIN,
  journalStickerSchema,
  type JournalSticker,
} from '@improve-personal/core'

import { createRepository } from '../storage/repository'
import type { LocalDataSession } from '../storage/session'

/**
 * Sticker yang ditempel di kertas jurnal (PRD F8 bagian 4 + F14 "Journal").
 *
 * Beda dengan hias halaman (`useDeco`, localStorage per ukuran layar): sticker jurnal adalah ISI
 * jurnal, jadi ditulis sebagai record `journal_sticker` terenkripsi yang ikut sync, satu record per
 * sticker. Posisinya relatif ke kertas (`x` pecahan lebar, `line` indeks baris), bukan pixel.
 */

export { JOURNAL_STICKER_MAX }

/** Ukuran sticker di kertas pada `scale` 1 (px). */
export const JOURNAL_STICKER_BASE_SIZE = 64

export type StickerPlacement = Pick<JournalSticker, 'x' | 'line' | 'rotate' | 'scale'>

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** Rapikan posisi hasil drag supaya selalu lolos skema core (tidak pernah ditolak saat tulis). */
export function clampPlacement(placement: StickerPlacement): StickerPlacement {
  const rotate = ((((placement.rotate + 180) % 360) + 360) % 360) - 180
  return {
    x: clamp(placement.x, 0, 1),
    line: clamp(Math.round(placement.line), 0, JOURNAL_STICKER_MAX_LINE),
    rotate: Math.round(rotate * 10) / 10,
    scale: clamp(placement.scale, JOURNAL_STICKER_SCALE_MIN, JOURNAL_STICKER_SCALE_MAX),
  }
}

/** Posisi tumpuk berikutnya: di atas semua sticker halaman itu. */
export function nextPosition(stickers: readonly JournalSticker[]): number {
  return stickers.reduce((top, sticker) => Math.max(top, sticker.position + 1), 0)
}

function stickersOf(session: LocalDataSession) {
  // `journal_sticker` tidak ada di `RepositorySet` core, jadi repository-nya dibuat di sini.
  return createRepository<JournalSticker>(session, 'journal_sticker')
}

/**
 * Semua sticker jurnal. Record yang tidak lolos skema (versi lain/rusak) dilewati, bukan melempar:
 * satu sticker rusak tidak boleh membuat seluruh jurnal gagal dimuat.
 */
export async function loadJournalStickers(session: LocalDataSession): Promise<JournalSticker[]> {
  const records = await stickersOf(session).listAll({ includeDeleted: false })
  const stickers: JournalSticker[] = []
  for (const record of records) {
    const parsed = journalStickerSchema.safeParse(record.data)
    if (parsed.success) stickers.push(parsed.data)
  }
  return stickers
}

export async function persistJournalSticker(
  session: LocalDataSession,
  sticker: JournalSticker,
): Promise<void> {
  await session.writer.write({
    id: sticker.id,
    type: 'journal_sticker',
    data: (id) => journalStickerSchema.parse({ ...sticker, id }),
    index: null,
  })
}

export async function removeJournalSticker(session: LocalDataSession, id: string): Promise<void> {
  await session.writer.remove({ id, index: null })
}
