import { beforeEach, describe, expect, it } from 'vitest'

import { useMemos, type MemoInput } from './useMemos'

const INPUT: Omit<MemoInput, 'date'> = {
  title: '  Judul  ',
  text: ' Isi ',
  feelings: [],
  paper: 'krem',
}

/** Tanggal yang tidak dipakai memo contoh (relatif ke hari ini) supaya hitungannya bersih. */
const DAY = '2019-12-31'
const OTHER_DAY = '2020-01-01'

describe('useMemos', () => {
  beforeEach(() => {
    clearNuxtState(['memos'])
  })

  it('isi kosong ditolak; entri baru dirapikan & masuk paling atas', () => {
    const { memos, save } = useMemos()
    expect(save({ ...INPUT, date: DAY, text: '  ' })).toBeNull()
    const saved = save({ ...INPUT, date: DAY })
    expect(saved).not.toBeNull()
    expect(memos.value[0]).toMatchObject({ title: 'Judul', text: 'Isi', date: DAY })
    expect(new Date(memos.value[0]?.createdAt ?? 0).getHours()).toBe(20)
  })

  it('simpan ulang di tanggal yang sama memperbarui halaman itu, bukan menambah halaman', () => {
    const { memos, save, memoOn } = useMemos()
    const first = save({ ...INPUT, date: DAY })
    if (!first) throw new Error('simpan pertama gagal')

    const second = save({
      ...INPUT,
      date: DAY,
      title: '  Judul baru  ',
      text: ' Isi baru ',
      feelings: ['tenang'],
    })

    const pages = memos.value.filter((memo) => memo.date === DAY)
    expect(pages).toHaveLength(1)
    expect(second?.id).toBe(first.id)
    expect(pages[0]).toMatchObject({
      id: first.id,
      createdAt: first.createdAt,
      title: 'Judul baru',
      text: 'Isi baru',
      feelings: ['tenang'],
    })
    expect(memoOn(DAY)?.id).toBe(first.id)
  })

  it('tanggal berbeda tetap jadi halaman terpisah', () => {
    const { memos, save } = useMemos()
    save({ ...INPUT, date: DAY })
    save({ ...INPUT, date: OTHER_DAY })
    expect(memos.value.filter((memo) => memo.date === DAY || memo.date === OTHER_DAY)).toHaveLength(
      2,
    )
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
