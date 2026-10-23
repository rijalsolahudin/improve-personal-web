import { beforeEach, describe, expect, it } from 'vitest'

import { emptyGoalDraft } from '~/utils/goals'

import { useGoals } from './useGoals'

/**
 * Sumber data halaman Goals (T18).
 *
 * Catatan QA #31 (N5/B6): "halaman Goals masih mock (`useGoals.ts:21`)". T18 adalah task yang
 * menggantinya dengan repository lokal + `goalProgressReport` core, jadi perilaku yang harus berlaku
 * sekarang: data goal = data USER. Sesi baru tanpa isi tidak boleh menampilkan goal contoh, dan goal
 * yang disimpan harus tetap ada setelah state dimuat ulang (simulasi reload halaman).
 */

describe('sumber data Goals', () => {
  beforeEach(() => {
    clearNuxtState(['goals'])
  })

  it('sesi baru tanpa data user tidak menampilkan goal contoh', () => {
    const { goals } = useGoals()
    expect(goals.value).toEqual([])
  })

  it('goal yang disimpan tetap ada setelah halaman dimuat ulang', () => {
    const first = useGoals()
    const draft = { ...emptyGoalDraft(first.today.value), title: 'Belajar gitar' }
    const saved = first.save(draft, null)
    if (!('id' in saved)) throw new Error('gagal simpan')

    // Simulasi reload: state Nuxt dibuang, composable dipakai lagi.
    clearNuxtState(['goals'])
    const afterReload = useGoals()

    expect(afterReload.goals.value.map((goal) => goal.title)).toContain('Belajar gitar')
    expect(afterReload.findGoal(saved.id)?.title).toBe('Belajar gitar')
  })
})
