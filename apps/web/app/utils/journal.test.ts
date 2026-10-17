import { describe, expect, it } from 'vitest'

import {
  INTENTION_MAX,
  addIntention,
  emptyJournalDay,
  listRows,
  nextGoalId,
  removeIntention,
  setListItem,
  updateIntention,
} from './journal'

describe('niat harian', () => {
  it('teks dirapikan; kosong ditolak; maksimal 3 niat', () => {
    let day = emptyJournalDay()
    expect(addIntention(day, '   ', 'x')).toBeNull()
    for (let index = 0; index < INTENTION_MAX; index += 1) {
      const next = addIntention(day, `  Niat ${index}  `, `i${index}`)
      if (!next) throw new Error('niat ditolak')
      day = next
    }
    expect(day.intentions[0]).toEqual({ id: 'i0', text: 'Niat 0', done: false, goalId: null })
    expect(addIntention(day, 'Keempat', 'i4')).toBeNull()
  })

  it('centang & hapus hanya menyentuh niat yang dimaksud', () => {
    const base = addIntention(emptyJournalDay(), 'A', 'a')
    const day = base && addIntention(base, 'B', 'b')
    if (!day) throw new Error('niat ditolak')
    const toggled = updateIntention(day, 'b', (item) => ({ ...item, done: !item.done }))
    expect(toggled.intentions.map((item) => item.done)).toEqual([false, true])
    expect(removeIntention(toggled, 'a').intentions.map((item) => item.id)).toEqual(['b'])
  })

  it('chip goal berputar: tanpa goal → goal aktif → kembali tanpa goal', () => {
    expect(nextGoalId(null, ['g1', 'g2'])).toBe('g1')
    expect(nextGoalId('g2', ['g1', 'g2'])).toBeNull()
    // Goal yang sudah tidak aktif dianggap "tanpa goal" → lanjut ke goal aktif pertama.
    expect(nextGoalId('lama', ['g1'])).toBe('g1')
  })
})

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
