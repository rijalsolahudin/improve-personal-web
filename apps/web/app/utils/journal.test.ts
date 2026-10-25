import { describe, expect, it } from 'vitest'

import { listRows, setListItem } from './journal'

describe('daftar syukur/sedih/lebih baik', () => {
  it('minimal 3 baris, selalu ada satu baris kosong setelah isian terakhir', () => {
    expect(listRows([])).toEqual(['', '', ''])
    expect(listRows(['a', 'b', 'c'])).toEqual(['a', 'b', 'c', ''])
  })

  it('mengisi baris di luar panjang menambah slot; ekor kosong di atas 3 baris dibuang', () => {
    expect(setListItem([], 1, 'syukur')).toEqual(['', 'syukur'])
    expect(setListItem(['a', 'b', 'c', 'd'], 3, '  ')).toEqual(['a', 'b', 'c'])
  })
})
