import { describe, expect, it } from 'vitest'

import {
  MEMO_FREE_BLOCK_MAX,
  MEMO_FREE_MIN_WIDTH,
  clampFreeBlock,
  isLayoutEmpty,
  parseLayout,
  serializeLayout,
  type MemoLayout,
} from './layout'
import { parseRich, richToPlain, serializeRich } from './richtext'

const free = (text: string, x = 0.6, line = 3, width = 0.3) => ({ x, line, width, text })

describe('parseLayout / serializeLayout', () => {
  it('teks lama tanpa pagar = tulisan utama apa adanya', () => {
    expect(parseLayout('Pagi cerah\n\nsore hujan')).toEqual({
      main: 'Pagi cerah\n\nsore hujan',
      column: null,
      blocks: [],
    })
  })

  it('bolak-balik utuh: utama + kolom + kotak bebas (termasuk baris kosong di dalamnya)', () => {
    const layout: MemoLayout = {
      main: 'kiri satu\n\nkiri tiga',
      column: 'kanan\n',
      blocks: [free('**catatan**\n- poin'), free('', 0.1, 9, 0.5)],
    }
    const text = serializeLayout(layout)

    expect(text).toBe(
      [
        'kiri satu\n\nkiri tiga',
        '::: kolom',
        'kanan\n',
        ':::',
        '::: bebas 0.6 3 0.3',
        '**catatan**\n- poin',
        ':::',
        '::: bebas 0.1 9 0.5',
        '',
        ':::',
      ].join('\n'),
    )
    expect(parseLayout(text)).toEqual(layout)
  })

  it('split dengan kolom kosong tetap tersimpan sebagai mode split', () => {
    const text = serializeLayout({ main: 'isi', column: '', blocks: [] })
    expect(parseLayout(text).column).toBe('')
  })

  it('tanpa kolom/kotak, tulisan utama disimpan apa adanya (termasuk baris kosong)', () => {
    expect(serializeLayout({ main: '\n\n\n', column: null, blocks: [] })).toBe('\n\n\n')
  })

  it('halaman tanpa tulisan sama sekali disimpan sebagai teks kosong', () => {
    const layout = { main: '  ', column: '', blocks: [free('')] }
    expect(isLayoutEmpty(layout)).toBe(true)
    expect(serializeLayout(layout)).toBe('')
  })

  it('pagar tanpa penutup: sisa teks jadi isi blok itu, tidak ada yang hilang', () => {
    expect(parseLayout('utama\n::: kolom\nkanan terpotong')).toEqual({
      main: 'utama',
      column: 'kanan terpotong',
      blocks: [],
    })
  })

  it('posisi rusak dijepit ke dalam kertas, bukan melempar', () => {
    const [block] = parseLayout('::: bebas 9 -4 abc\nhalo\n:::').blocks
    expect(block).toEqual({
      x: 1 - MEMO_FREE_MIN_WIDTH,
      line: 0,
      width: MEMO_FREE_MIN_WIDTH,
      text: 'halo',
    })
  })

  it(`kotak bebas dibatasi ${MEMO_FREE_BLOCK_MAX} per halaman`, () => {
    const many = Array.from({ length: MEMO_FREE_BLOCK_MAX + 3 }, (_, index) => free(`k${index}`))
    const text = serializeLayout({ main: '', column: null, blocks: many })
    expect(parseLayout(text).blocks).toHaveLength(MEMO_FREE_BLOCK_MAX)
  })

  it('lebar kotak dipotong sampai tepi kanan kertas', () => {
    expect(clampFreeBlock(free('x', 0.7, 1, 0.9))).toMatchObject({ x: 0.7, width: 0.3 })
  })
})

describe('integrasi dengan richtext', () => {
  it('baris tulisan yang diawali ::: di-escape, jadi tidak pernah terbaca sebagai pagar', () => {
    const markdown = serializeRich(parseRich('\\::: kolom'))
    expect(markdown).toBe('\\::: kolom')
    expect(parseLayout(markdown)).toEqual({ main: '\\::: kolom', column: null, blocks: [] })
    expect(richToPlain(markdown)).toBe('::: kolom')
  })

  it('teks polos (cari, hitung kata) mencakup kolom dan kotak bebas tanpa pagar', () => {
    const text = serializeLayout({
      main: 'pagi **cerah**',
      column: 'siang',
      blocks: [free('malam')],
    })
    expect(richToPlain(text)).toBe('pagi cerah\nsiang\nmalam')
  })
})
