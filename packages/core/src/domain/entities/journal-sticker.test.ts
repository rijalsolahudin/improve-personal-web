import { describe, expect, it } from 'vitest'

import {
  JOURNAL_STICKER_MAX_LINE,
  JOURNAL_STICKER_SCALE_MAX,
  JOURNAL_STICKER_SCALE_MIN,
  journalStickerSchema,
} from './journal.ts'

/** UUIDv7 kanonik; `uuidV7Schema` menolak versi lain dan huruf besar. */
const STICKER_ID = '0192f0a0-0000-7000-8000-000000000001'
const ENTRY_ID = '0192f0a0-0000-7000-8000-000000000002'

function stickerInput(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: STICKER_ID,
    entryId: ENTRY_ID,
    stickerId: 'mood/happy',
    position: 0,
    x: 0.5,
    line: 3,
    rotate: -8,
    scale: 1,
    ...patch,
  }
}

describe('journalStickerSchema', () => {
  it('menerima penempatan sticker di kertas jurnal', () => {
    expect(journalStickerSchema.parse(stickerInput())).toEqual(stickerInput())
  })

  it('menerima batas tepi rentang', () => {
    for (const patch of [
      { x: 0, line: 0, rotate: -180, scale: JOURNAL_STICKER_SCALE_MIN },
      { x: 1, line: JOURNAL_STICKER_MAX_LINE, rotate: 180, scale: JOURNAL_STICKER_SCALE_MAX },
    ]) {
      expect(journalStickerSchema.safeParse(stickerInput(patch)).success).toBe(true)
    }
  })

  it.each([
    ['x di luar kertas', { x: 1.2 }],
    ['x negatif', { x: -0.1 }],
    ['baris pecahan', { line: 2.5 }],
    ['baris melewati batas', { line: JOURNAL_STICKER_MAX_LINE + 1 }],
    ['rotasi berlebih', { rotate: 181 }],
    ['skala terlalu kecil', { scale: JOURNAL_STICKER_SCALE_MIN - 0.01 }],
    ['skala terlalu besar', { scale: JOURNAL_STICKER_SCALE_MAX + 0.01 }],
    ['angka tak hingga', { x: Number.POSITIVE_INFINITY }],
    ['stickerId kosong', { stickerId: '' }],
  ])('menolak %s', (_, patch) => {
    expect(journalStickerSchema.safeParse(stickerInput(patch)).success).toBe(false)
  })

  it('menolak field tak dikenal (strict)', () => {
    expect(journalStickerSchema.safeParse(stickerInput({ px: 10 })).success).toBe(false)
  })
})
