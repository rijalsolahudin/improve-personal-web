import { beforeEach, describe, expect, it } from 'vitest'

import { useCountdowns } from './useCountdowns'

describe('useCountdowns', () => {
  beforeEach(() => {
    clearNuxtState(['countdowns'])
  })

  it('upcoming: terdekat dulu, tanpa yang diarsip', () => {
    const { upcoming, toggleArchive } = useCountdowns()
    const ats = upcoming.value.map((item) => item.at)
    expect(ats).toEqual([...ats].sort((a, b) => a - b))

    const first = upcoming.value[0]
    if (!first) throw new Error('mock kosong')
    toggleArchive(first.id)
    expect(upcoming.value.some((item) => item.id === first.id)).toBe(false)
  })
})
