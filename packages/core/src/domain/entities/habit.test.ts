import { describe, expect, it } from 'vitest'

import { habitSchema } from './habit.ts'

/**
 * Regresi T10: warna habit tidak tersimpan (selalu kembali ke warna default setelah reload) karena
 * `habitSchema` belum punya field `color`.
 *
 * Dua hal yang dijaga di sini: warnanya benar-benar lolos parse (bukan dibuang), dan field-nya
 * BACKWARD-COMPATIBLE - record `habit` lama yang dibuat sebelum `color` ada (tanpa key `color`)
 * tetap lolos parse dengan `color = null`. Kalau `color` diwajibkan, upgrade app = data habit user
 * lama gagal hydrate dan ditolak saat import; itu regresi data, bukan sekadar validasi ketat.
 */

/** UUIDv7 kanonik; `uuidV7Schema` menolak versi lain dan huruf besar. */
const HABIT_ID = '0192f0a0-0000-7000-8000-000000000001'

/** Contoh hex palet UI (habit ungu). */
const PALETTE_HEX = '#9B4FC9'

const MAX_COLOR_LENGTH = 64

/** Habit valid minimal. `Record` dipakai supaya test bisa menghapus/menambah key tanpa drama tipe. */
function habitInput(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: HABIT_ID,
    name: 'Olahraga',
    iconSticker: null,
    color: null,
    frequencyType: 'daily',
    frequencyDays: null,
    targetPerDay: 1,
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

describe('habitSchema - color', () => {
  it('menyimpan hex palet apa adanya', () => {
    const parsed = habitSchema.parse(habitInput({ color: PALETTE_HEX }))

    expect(parsed.color).toBe(PALETTE_HEX)
  })

  it('menerima color null (= pakai warna default UI)', () => {
    const parsed = habitSchema.parse(habitInput({ color: null }))

    expect(parsed.color).toBeNull()
  })

  it('menolak color yang lebih panjang dari 64 karakter', () => {
    const result = habitSchema.safeParse(habitInput({ color: '#'.repeat(MAX_COLOR_LENGTH + 1) }))

    expect(result.success).toBe(false)
  })

  it('record lama tanpa color tetap lolos dan color hasil parse = null', () => {
    const withoutColor = habitInput()
    delete withoutColor.color

    const parsed = habitSchema.parse(withoutColor)

    expect(parsed.color).toBeNull()
  })

  it('menolak key yang tidak dikenal', () => {
    expect(habitSchema.safeParse(habitInput({ paletteIndex: 3 })).success).toBe(false)
  })
})

describe('habitSchema - aturan frekuensi tetap berlaku', () => {
  it('habit mingguan tanpa hari ditolak', () => {
    const result = habitSchema.safeParse(
      habitInput({ frequencyType: 'weekly_days', frequencyDays: null }),
    )

    expect(result.success).toBe(false)
  })

  it('habit mingguan dengan hari dobel ditolak', () => {
    const result = habitSchema.safeParse(
      habitInput({ frequencyType: 'weekly_days', frequencyDays: ['senin', 'senin'] }),
    )

    expect(result.success).toBe(false)
  })

  it('habit mingguan dengan hari unik diterima', () => {
    const parsed = habitSchema.parse(
      habitInput({ frequencyType: 'weekly_days', frequencyDays: ['senin', 'rabu'] }),
    )

    expect(parsed.frequencyDays).toEqual(['senin', 'rabu'])
  })
})
