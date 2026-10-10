import { beforeEach, describe, expect, it } from 'vitest'

import { emptyHabitDraft } from '~/utils/habits'
import { addDays } from '~/utils/time'

import { useHabits } from './useHabits'

describe('useHabits', () => {
  beforeEach(() => {
    clearNuxtState(['habits'])
  })

  it('data contoh: streak sesuai seed', () => {
    const { habits, streakOf } = useHabits()
    const reading = habits.value.find((habit) => habit.id === 'h3')
    if (!reading) throw new Error('mock tanpa h3')
    expect(streakOf(reading)).toBe(12)
  })

  it('centang hari ini & hari lalu; hari depan diabaikan', () => {
    const { findHabit, toggleDay, isMetToday, checkIns, today } = useHabits()
    toggleDay('h3', today.value)
    const reading = findHabit('h3')
    if (!reading) throw new Error('mock tanpa h3')
    expect(isMetToday(reading)).toBe(true)
    const tomorrow = addDays(today.value, 1)
    toggleDay('h3', tomorrow)
    expect(checkIns.value.h3?.[tomorrow]).toBeUndefined()
  })

  it('buat, edit, hapus (riwayat ikut hilang)', () => {
    const { save, remove, findHabit, checkIns } = useHabits()
    const result = save({ ...emptyHabitDraft(), name: 'Jurnal' }, null)
    if (!('id' in result)) throw new Error('gagal simpan')
    save({ ...emptyHabitDraft(), name: 'Jurnal malam', target: 2 }, result.id)
    expect(findHabit(result.id)).toMatchObject({ name: 'Jurnal malam', target: 2 })
    remove('h1')
    expect(findHabit('h1')).toBeUndefined()
    expect(checkIns.value.h1).toBeUndefined()
  })
})
