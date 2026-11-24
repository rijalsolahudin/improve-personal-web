import { tokenPx } from './tokenPx'

describe('tokenPx', () => {
  it('membaca nilai px biasa', () => {
    expect(tokenPx('22px')).toBe(22)
    expect(tokenPx('2.5px')).toBe(2.5)
  })

  it('membaca anak tangga dari referensi var ukuran font', () => {
    expect(tokenPx('var(--fs-15)')).toBe(15)
    expect(tokenPx('var(--fs-display-30)')).toBe(30)
  })

  it('menolak token tanpa angka', () => {
    expect(() => tokenPx('ease')).toThrow('Token tidak berisi angka px')
  })
})
