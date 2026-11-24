import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import type { Goal } from '@improve-personal/core/planner'
import type { GoalCategoryView } from '~/utils/goals/categories'

import GoalListCard from './GoalListCard.vue'

/**
 * Kartu goal versi design v2: kategori tampil sebagai titik warna (bukan tile glyph), dan chip status
 * hanya muncul kalau statusnya BUKAN `aktif` - `aktif` adalah keadaan normal, chipnya cuma bising.
 * "Perlu review" tetap tampil sendiri walau statusnya aktif.
 */
const CATEGORY: GoalCategoryView = {
  key: 'karier',
  label: 'Karier',
  color: 'pink',
  sortOrder: 1,
  accent: '#F03FBF',
  tint: '#F7C6DA',
  text: '#8E2A5A',
}

function goalOf(overrides: Partial<Goal> = {}): Goal {
  return {
    id: '018f2c4e-0000-7000-8000-0000000000aa',
    title: 'Lulus AWS SAA',
    why: '',
    category: 'karier',
    status: 'aktif',
    start: '2026-10-01',
    end: '2026-12-31',
    cover: null,
    along: [],
    chapters: [],
    ...overrides,
  }
}

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function mountCard(goal: Goal) {
  const wrapper = await mountSuspended(GoalListCard, {
    props: { goal, today: '2026-10-25', isSelected: false, category: CATEGORY },
  })
  mounted.push(wrapper)
  return wrapper
}

describe('GoalListCard - status & kategori (design v2)', () => {
  it('tidak menampilkan chip apa pun saat goal aktif dan tidak perlu review', async () => {
    const wrapper = await mountCard(goalOf())

    expect(wrapper.find('.chips').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Aktif')
  })

  it('menampilkan chip status untuk goal yang bukan aktif', async () => {
    const wrapper = await mountCard(goalOf({ status: 'ditunda' }))

    expect(wrapper.get('.chips').text()).toContain('Ditunda')
  })

  it('tetap menampilkan "Perlu review" saat goal aktif punya chapter terlewat', async () => {
    const wrapper = await mountCard(
      goalOf({
        chapters: [
          {
            id: 'c1',
            title: 'Bab 1',
            start: '2026-10-01',
            end: '2026-10-10',
            isManualDone: false,
            isClosed: false,
            items: [],
          },
        ],
      }),
    )

    expect(wrapper.get('.chips').text()).toContain('Perlu review')
    expect(wrapper.get('.chips').text()).not.toContain('Aktif')
  })

  it('memakai titik warna kategori, bukan tile glyph', async () => {
    const wrapper = await mountCard(goalOf())

    expect(wrapper.find('.glyph').exists()).toBe(false)
    expect(wrapper.find('.dot').exists()).toBe(true)
    expect(wrapper.get('.card').attributes('style')).toContain('#F03FBF')
  })

  it('menampilkan label kategori dari katalog, bukan kunci mentah', async () => {
    const wrapper = await mountCard(goalOf())

    expect(wrapper.text()).toContain('Karier')
  })
})
