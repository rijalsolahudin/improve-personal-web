import { beforeEach, describe, expect, it } from 'vitest'

import { useMemos, type MemoInput } from './useMemos'

const INPUT: Omit<MemoInput, 'date'> = {
  title: '  Judul  ',
  text: ' Isi ',
  feelings: [],
  paper: 'krem',
}

describe('useMemos', () => {
  beforeEach(() => {
    clearNuxtState(['memos'])
  })

  it('isi kosong ditolak; entri dirapikan & masuk paling atas', () => {
    const { memos, add } = useMemos()
    expect(add({ ...INPUT, date: '2026-10-01', text: '  ' })).toBe(false)
    expect(add({ ...INPUT, date: '2026-10-01' })).toBe(true)
    expect(memos.value[0]).toMatchObject({ title: 'Judul', text: 'Isi', date: '2026-10-01' })
    expect(new Date(memos.value[0]?.createdAt ?? 0).getHours()).toBe(20)
  })

  it('mood satu per hari: ganti & hapus', () => {
    const { setMood, moodOn } = useMemos()
    setMood('2026-10-01', 3)
    setMood('2026-10-01', 1)
    expect(moodOn('2026-10-01')).toBe(1)
    setMood('2026-10-01', null)
    expect(moodOn('2026-10-01')).toBeNull()
    setMood('2026-10-01', 9)
    expect(moodOn('2026-10-01')).toBeNull()
  })

  it('hapus entri', () => {
    const { memos, remove } = useMemos()
    remove('m1')
    expect(memos.value.some((memo) => memo.id === 'm1')).toBe(false)
  })
})
