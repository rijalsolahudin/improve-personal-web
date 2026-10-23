import { beforeEach, describe, expect, it } from 'vitest'

import { useMemos, type MemoInput } from './useMemos'

/**
 * QA T11 putaran 2 - regresi BUG-T11-01: PRD F8 "satu jurnal per tanggal" berarti simpan ulang
 * di tanggal yang sama memperbarui halaman itu (id & createdAt tetap), bukan menambah halaman.
 */

const INPUT: Omit<MemoInput, 'date'> = {
  title: '',
  text: 'Draf pertama.',
  feelings: [],
  paper: 'krem',
}

/** Tanggal jauh di masa lalu supaya tidak bentrok dengan memo mock bawaan. */
const DAY = '2019-12-30'
const OTHER_DAY = '2019-12-31'

describe('QA T11 upsert halaman jurnal per tanggal', () => {
  beforeEach(() => {
    clearNuxtState(['memos'])
  })

  it('simpan 2x tanggal sama: 1 halaman, isi terbaru menang, id & createdAt tetap', () => {
    const { memos, memoOn, save } = useMemos()
    const first = save({ ...INPUT, date: DAY })
    if (!first) throw new Error('simpan pertama gagal')

    const second = save({
      ...INPUT,
      date: DAY,
      title: '  Judul baru  ',
      text: '  Draf kedua, setelah diedit.  ',
      feelings: ['tenang'],
    })

    const pages = memos.value.filter((memo) => memo.date === DAY)
    expect(pages).toHaveLength(1)
    expect(second?.id).toBe(first.id)
    expect(second?.createdAt).toBe(first.createdAt)
    expect(pages[0]).toMatchObject({
      id: first.id,
      createdAt: first.createdAt,
      title: 'Judul baru',
      text: 'Draf kedua, setelah diedit.',
      feelings: ['tenang'],
    })
    expect(memoOn(DAY)?.text).toBe('Draf kedua, setelah diedit.')
  })

  it('tanggal berbeda tetap jadi halaman terpisah', () => {
    const { memos, save } = useMemos()
    save({ ...INPUT, date: DAY })
    save({ ...INPUT, date: OTHER_DAY, text: 'Hari lain.' })

    expect(memos.value.filter((memo) => memo.date === DAY)).toHaveLength(1)
    expect(memos.value.filter((memo) => memo.date === OTHER_DAY)).toHaveLength(1)
  })

  it('simpan ulang dengan draf kosong tidak menimpa halaman tersimpan', () => {
    const { memoOn, save } = useMemos()
    save({ ...INPUT, date: DAY })

    expect(save({ ...INPUT, date: DAY, text: '   ' })).toBeNull()
    expect(memoOn(DAY)?.text).toBe('Draf pertama.')
  })

  it('update mempertahankan posisi halaman di daftar (tidak melompat ke atas)', () => {
    const { memos, save } = useMemos()
    save({ ...INPUT, date: OTHER_DAY, text: 'Halaman lain.' })
    save({ ...INPUT, date: DAY })
    const indexBefore = memos.value.findIndex((memo) => memo.date === DAY)

    save({ ...INPUT, date: DAY, text: 'Diedit lagi.' })

    expect(memos.value.findIndex((memo) => memo.date === DAY)).toBe(indexBefore)
    expect(memos.value.filter((memo) => memo.date === DAY)).toHaveLength(1)
  })
})
