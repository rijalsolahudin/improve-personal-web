import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'

import { MEMO_FREE_BLOCK_MAX, parseLayout } from '@improve-personal/core/planner'

import { freePart, useMemoLayout } from './useMemoLayout'

const MAX = 5000

function setup(initial = '') {
  const text = ref(initial)
  return { text, model: useMemoLayout(text, MAX) }
}

describe('useMemoLayout', () => {
  it('mengetik di tiap bagian menulis balik teks berpagar', () => {
    const { text, model } = setup('pagi')
    model.toggleSplit()
    model.setPart('column', 'kanan')
    model.addFree({ x: 0.5, line: 4 })
    model.setPart(freePart(0), 'catatan')

    expect(parseLayout(text.value)).toEqual({
      main: 'pagi',
      column: 'kanan',
      blocks: [{ x: 0.5, line: 4, width: 0.4, text: 'catatan' }],
    })
  })

  it('halaman kosong: split & kotak baru bertahan di memori tanpa menyimpan pagar kosong', () => {
    const { text, model } = setup()
    model.toggleSplit()
    const part = model.addFree({ x: 0.3, line: 2 })

    expect(text.value).toBe('')
    expect(model.isSplit.value).toBe(true)
    expect(model.layout.value.blocks).toHaveLength(1)
    expect(model.active.value).toBe(part)

    model.setPart(freePart(0), 'halo')
    expect(parseLayout(text.value)).toMatchObject({ column: '', blocks: [{ text: 'halo' }] })
  })

  it('bentuk halaman kosong dibuang saat teks berganti dari luar (pindah tanggal)', async () => {
    const { text, model } = setup()
    model.toggleSplit()
    text.value = 'halaman lain'
    await nextTick()

    expect(model.isSplit.value).toBe(false)
  })

  it('mematikan split menyambung isi kolom ke tulisan utama, tidak dibuang', () => {
    const { text, model } = setup('kiri')
    model.toggleSplit()
    model.setPart('column', 'kanan')
    model.setActive('column')
    model.toggleSplit()

    expect(text.value).toBe('kiri\n\nkanan')
    expect(model.active.value).toBe('main')
  })

  it(`kotak bebas dibatasi ${MEMO_FREE_BLOCK_MAX}`, () => {
    const { model } = setup('isi')
    for (let i = 0; i < MEMO_FREE_BLOCK_MAX; i += 1) {
      model.addFree({ x: 0.5, line: i })
      model.setPart(freePart(i), `k${i}`)
    }
    expect(model.canAddFree.value).toBe(false)
    expect(model.addFree({ x: 0.5, line: 20 })).toBeNull()
  })

  it('kotak kosong dibuang saat fokus pindah, kecuali yang sedang diketik; indeks aktif ikut', () => {
    const { model } = setup('isi')
    model.addFree({ x: 0.5, line: 1 })
    model.addFree({ x: 0.5, line: 2 })
    model.addFree({ x: 0.5, line: 3 })
    model.setPart(freePart(1), 'berisi')

    model.pruneEmpty()
    expect(model.layout.value.blocks.map((block) => block.text)).toEqual(['berisi', ''])
    expect(model.active.value).toBe(freePart(1))

    model.setActive('main')
    model.pruneEmpty()
    expect(model.layout.value.blocks.map((block) => block.text)).toEqual(['berisi'])
  })

  it('identitas kotak stabil saat kotak di depannya dibuang (editor yang diketik tidak diganti)', () => {
    const { model } = setup('isi')
    model.addFree({ x: 0.5, line: 1 })
    model.addFree({ x: 0.5, line: 2 })
    const secondKey = model.blockKeys.value[1]

    model.pruneEmpty()

    expect(model.blockKeys.value).toEqual([secondKey])
  })

  it('menolak ketikan yang membuat teks melewati batas, teks lama tetap utuh', () => {
    const text = ref('a')
    const model = useMemoLayout(text, 10)

    expect(model.setPart('main', 'x'.repeat(11))).toBe(false)
    expect(text.value).toBe('a')
    expect(model.budget('main')).toBe(10)
  })

  it('menggeser kotak dijepit ke dalam kertas', () => {
    const { model } = setup('isi')
    model.addFree({ x: 0.2, line: 1 })
    model.setPart(freePart(0), 'x')
    model.moveFree(0, { x: 2, line: -3 })

    expect(model.layout.value.blocks[0]).toMatchObject({ x: 0.8, line: 0, width: 0.2 })
  })
})
