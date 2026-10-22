import { describe, expect, it } from 'vitest'

import {
  applyHabitDraft,
  completionRate,
  currentStreak,
  draftFromHabit,
  emptyHabitDraft,
  monthDaysOf,
  nextCount,
  setCount,
  validateHabitDraft,
  type CheckIns,
  type Habit,
} from './habits'

// 2026-10-09 = Jumat.
const FRI = '2026-10-09'
const habit = (overrides: Partial<Habit> = {}): Habit => ({
  id: 'h',
  name: 'Lari',
  icon: 'star',
  sticker: null,
  color: 0,
  days: null,
  target: 1,
  goalId: null,
  isArchived: false,
  ...overrides,
})
const done = (...days: string[]): CheckIns => ({ h: Object.fromEntries(days.map((d) => [d, 1])) })

describe('streak (PRD F7)', () => {
  it('harian: berturut-turut, putus di hari terlewat', () => {
    const checkIns = done(FRI, '2026-10-08', '2026-10-07', '2026-10-05')
    expect(currentStreak(habit(), checkIns, FRI)).toBe(3)
  })

  it('hari ini belum dicentang tidak memutus streak', () => {
    expect(currentStreak(habit(), done('2026-10-08', '2026-10-07'), FRI)).toBe(2)
  })

  it('Senin–Jumat: akhir pekan tidak memutus streak', () => {
    const weekdays = habit({ days: [1, 2, 3, 4, 5] })
    // Senin 12 Okt, lalu Jumat 9 & Kamis 8 Okt; Sabtu–Minggu kosong.
    const checkIns = done('2026-10-12', FRI, '2026-10-08')
    expect(currentStreak(weekdays, checkIns, '2026-10-12')).toBe(3)
  })

  it('multi-hari (Sen/Rab/Jum) & target > 1', () => {
    const mwf = habit({ days: [1, 3, 5], target: 2 })
    const checkIns: CheckIns = { h: { [FRI]: 2, '2026-10-07': 2, '2026-10-05': 1 } }
    expect(currentStreak(mwf, checkIns, FRI)).toBe(2)
  })
})

describe('check-in', () => {
  it('target 1: tiap klik bolak-balik 0 → 1 → 0', () => {
    expect(nextCount(habit(), 0)).toBe(1)
    expect(nextCount(habit(), 1)).toBe(0)
  })

  // Regresi: hari lampau dulu melompat penuh ke `target` dalam sekali klik, padahal hint UI
  // menjanjikan "target >1x/hari: klik berulang" untuk kotak tanggal mana pun.
  it('target > 1: tiap klik +1, tanpa memandang hari (hari ini & hari lampau sama)', () => {
    const multi = habit({ target: 3 })
    expect(nextCount(multi, 0)).toBe(1)
    expect(nextCount(multi, 1)).toBe(2)
    expect(nextCount(multi, 2)).toBe(3)
    expect(nextCount(multi, 3)).toBe(0)
  })

  it('setCount 0 menghapus entri', () => {
    const checkIns = setCount(done(FRI), 'h', FRI, 0)
    expect(checkIns.h).toEqual({})
  })

  it('tingkat capaian cuma menghitung hari terjadwal', () => {
    const mwf = habit({ days: [1, 3, 5] })
    expect(completionRate(mwf, done('2026-10-05', FRI), '2026-10-05', '2026-10-11')).toBe(67)
  })
})

describe('form habit', () => {
  it('validasi', () => {
    const draft = { ...emptyHabitDraft(), name: 'Minum air' }
    expect(validateHabitDraft(draft)).toBeNull()
    expect(validateHabitDraft({ ...draft, name: ' ' })).toBe('nameRequired')
    expect(validateHabitDraft({ ...draft, days: [] })).toBe('noDays')
    expect(validateHabitDraft({ ...draft, target: 21 })).toBe('target')
  })

  it('draft ↔ habit', () => {
    const original = habit({ days: [1, 3] })
    const saved = applyHabitDraft({ ...draftFromHabit(original), name: '  Lari pagi ' }, 'h')
    expect(saved).toEqual({ ...original, name: 'Lari pagi' })
  })

  it('draft tidak membawa status arsip, tapi apply mempertahankannya', () => {
    const archived = habit({ isArchived: true })
    const draft = draftFromHabit(archived)
    expect('isArchived' in draft).toBe(false)
    expect(applyHabitDraft(draft, archived.id, archived.isArchived).isArchived).toBe(true)
    expect(applyHabitDraft(draft, archived.id).isArchived).toBe(false)
  })

  it('tanggal sebulan', () => {
    expect(monthDaysOf('2026-02-10')).toHaveLength(28)
    expect(monthDaysOf(FRI)[0]).toBe('2026-10-01')
  })
})
