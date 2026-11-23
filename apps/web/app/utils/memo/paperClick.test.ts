import { describe, expect, it } from 'vitest'

import { MEMO_LINE_PX, classifyPaperClick } from './paperClick'

/** Kertas 600px dengan satu baris tulisan setinggi satu baris (top 0). */
function paper(): Element {
  const root = document.createElement('div')
  const line = document.createElement('p')
  line.textContent = 'halo'
  root.append(line)
  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, left: 0, right: 600, width: 600, height }) as DOMRect
  root.getBoundingClientRect = () => rect(0, MEMO_LINE_PX * 10)
  line.getBoundingClientRect = () => rect(0, MEMO_LINE_PX)
  return root
}

const BELOW_THIRD_LINE = MEMO_LINE_PX * 3 + 5

describe('classifyPaperClick', () => {
  it('klik di bawah tulisan sisi kiri: lanjut menulis di baris yang diklik', () => {
    expect(classifyPaperClick(paper(), 40, BELOW_THIRD_LINE, true)).toEqual({
      kind: 'fill',
      lines: 3,
    })
  })

  it('kotak bebas aktif: klik di bawah tulisan sisi kanan menaruh kotak', () => {
    expect(classifyPaperClick(paper(), 500, BELOW_THIRD_LINE, true)).toEqual({ kind: 'place' })
  })

  it('kotak bebas disembunyikan: sisi kanan pun lanjut menulis di baris itu', () => {
    expect(classifyPaperClick(paper(), 500, BELOW_THIRD_LINE, false)).toEqual({
      kind: 'fill',
      lines: 3,
    })
  })

  it('kotak bebas disembunyikan: klik di samping kalimat = klik biasa', () => {
    expect(classifyPaperClick(paper(), 500, 10, false)).toBeNull()
  })
})
