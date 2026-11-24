import { describe, expect, it } from 'vitest'

import { parseInline, parseRich, richToPlain, serializeRich, type RichDoc } from './richtext.ts'

const roundTrip = (markdown: string): string => serializeRich(parseRich(markdown))

describe('richtext: teks lama tanpa format', () => {
  it('satu baris = satu paragraf; baris kosong & spasi dipertahankan', () => {
    const legacy = 'Pagi tenang.\n\n  Sore hujan,  lalu reda.'
    expect(parseRich(legacy).content).toHaveLength(3)
    expect(roundTrip(legacy)).toBe(legacy)
  })

  it('token mention jadwal & goal jadi node mention dan kembali utuh', () => {
    const text = 'Ikut @[sched-kelas] demi #[goal-1].'
    expect(parseInline(text)).toEqual([
      { type: 'text', text: 'Ikut ' },
      { type: 'mention', attrs: { kind: 'schedule', id: 'sched-kelas' } },
      { type: 'text', text: ' demi ' },
      { type: 'mention', attrs: { kind: 'goal', id: 'goal-1' } },
      { type: 'text', text: '.' },
    ])
    expect(roundTrip(text)).toBe(text)
  })

  it('kosong tetap satu paragraf kosong', () => {
    expect(parseRich('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(roundTrip('')).toBe('')
  })
})

describe('richtext: format', () => {
  it('tebal, miring, coret, stabilo', () => {
    expect(parseInline('a **b** *c* ~~d~~ ==e==')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'c', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'd', marks: [{ type: 'strike' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'e', marks: [{ type: 'highlight' }] },
    ])
  })

  it('format bertumpuk tetap benar setelah ditulis ulang', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'tebal ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'dan stabilo', marks: [{ type: 'bold' }, { type: 'highlight' }] },
            { type: 'text', text: ' biasa' },
          ],
        },
      ],
    }
    const markdown = serializeRich(doc)
    expect(markdown).toBe('**tebal ==dan stabilo==** biasa')
    expect(parseRich(markdown)).toEqual(doc)
  })

  it('stabilo berwarna: kuning tanpa tag, warna lain =={warna}...==, ganti warna = mark baru', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'kuning', marks: [{ type: 'highlight' }] },
            {
              type: 'text',
              text: 'hijau',
              marks: [{ type: 'highlight', attrs: { color: 'hijau' } }],
            },
            {
              type: 'text',
              text: ' biru',
              marks: [{ type: 'highlight', attrs: { color: 'biru' } }],
            },
          ],
        },
      ],
    }
    const markdown = serializeRich(doc)
    expect(markdown).toBe('==kuning===={hijau}hijau===={biru} biru==')
    expect(parseRich(markdown)).toEqual(doc)
  })

  it('warna bawaan dari editor (`color: kuning` / null) ditulis tanpa tag', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a', marks: [{ type: 'highlight', attrs: { color: 'kuning' } }] },
            { type: 'text', text: 'b', marks: [{ type: 'highlight', attrs: { color: null } }] },
          ],
        },
      ],
    }
    expect(serializeRich(doc)).toBe('==ab==')
  })

  it('tag warna tak dikenal bukan stabilo berwarna (tetap teks)', () => {
    expect(parseInline('=={ungu}x==')).toEqual([
      { type: 'text', text: '{ungu}x', marks: [{ type: 'highlight' }] },
    ])
  })

  it('penanda tanpa pasangan tetap jadi teks (tulisan tidak hilang)', () => {
    expect(parseInline('2 * 3 = 6 dan **belum ditutup')).toEqual([
      { type: 'text', text: '2 * 3 = 6 dan **belum ditutup' },
    ])
  })

  it('karakter penanda yang diketik sebagai teks di-escape dan kembali utuh', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a*b ~~c== \\ @[x]' }] }],
    }
    const markdown = serializeRich(doc)
    expect(parseRich(markdown)).toEqual(doc)
  })
})

describe('richtext: daftar', () => {
  it('baris "- " dan "1. " jadi daftar; baris berurutan masuk daftar yang sama', () => {
    const markdown = 'Rencana:\n- tidur cukup\n- **minum** air\n1. satu\n2. dua'
    const doc = parseRich(markdown)
    expect(doc.content.map((block) => block.type)).toEqual([
      'paragraph',
      'bulletList',
      'orderedList',
    ])
    expect(roundTrip(markdown)).toBe(markdown)
  })

  it('paragraf yang kebetulan diawali "- " di-escape supaya tidak berubah jadi daftar', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '- bukan daftar' }] }],
    }
    expect(serializeRich(doc)).toBe('\\- bukan daftar')
    expect(parseRich(serializeRich(doc))).toEqual(doc)
  })
})

describe('richToPlain', () => {
  it('membuang penanda format, mempertahankan teks, baris, dan token mention', () => {
    expect(richToPlain('**Pagi** ==tenang==\n- ikut @[sched-kelas]')).toBe(
      'Pagi tenang\nikut @[sched-kelas]',
    )
  })
})
