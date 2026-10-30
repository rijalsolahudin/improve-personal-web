import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import type { GoalCategoryView } from '~/utils/goals/categories'

import GoalFilters from './GoalFilters.vue'

/**
 * Chip kategori sekarang DATARAN dari katalog (`useGoalCategories`), bukan enum statis: kategori
 * buatan user harus muncul tanpa mengubah komponen. Yang diuji perilakunya - chip dirender dari data,
 * pilihan mengubah model, dan tombol kelola mengirim event ke halaman.
 */
const { useGoalCategories } = vi.hoisted(() => ({ useGoalCategories: vi.fn() }))
mockNuxtImport('useGoalCategories', () => useGoalCategories)

function view(overrides: Partial<GoalCategoryView> & Pick<GoalCategoryView, 'key'>) {
  return {
    label: overrides.key,
    color: 'pink',
    sortOrder: 1,
    accent: '#F03FBF',
    tint: '#F7C6DA',
    text: '#8E2A5A',
    ...overrides,
  } satisfies GoalCategoryView
}

const CATEGORIES: GoalCategoryView[] = [
  view({ key: 'general', label: 'General', color: 'gray', sortOrder: 0, accent: '#9A8B78' }),
  view({ key: 'karier', label: 'Karier', sortOrder: 1 }),
  view({
    key: '018f2c4e-0000-7000-8000-00000000cafe',
    label: 'Belajar Bahasa',
    color: 'blue',
    sortOrder: 2,
    accent: '#10A8D8',
  }),
]

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function mountFilters() {
  const wrapper = await mountSuspended(GoalFilters, {
    props: { status: 'semua', category: 'semua' },
  })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  useGoalCategories.mockReset()
  useGoalCategories.mockReturnValue({ categories: ref(CATEGORIES) })
})

describe('GoalFilters - chip kategori dinamis', () => {
  it('merender "Semua kategori" lalu setiap kategori dari katalog, termasuk buatan user', async () => {
    const wrapper = await mountFilters()

    const labels = wrapper.findAll('.cats .chip').map((chip) => chip.text())
    expect(labels).toEqual(['Semua kategori', 'General', 'Karier', 'Belajar Bahasa'])
  })

  it('menandai chip aktif sesuai model kategori', async () => {
    const wrapper = await mountSuspended(GoalFilters, {
      props: { status: 'semua', category: 'karier' },
    })
    mounted.push(wrapper)

    const active = wrapper.findAll('.cats .chip').filter((chip) => chip.text() === 'Karier')
    expect(active[0]?.attributes('aria-pressed')).toBe('true')
  })

  it('mengirim update:category saat chip kategori diklik', async () => {
    const wrapper = await mountFilters()

    const chip = wrapper.findAll('.cats .chip').find((item) => item.text() === 'Belajar Bahasa')
    await chip?.trigger('click')

    expect(wrapper.emitted('update:category')?.at(-1)).toEqual([
      '018f2c4e-0000-7000-8000-00000000cafe',
    ])
  })

  it('mengirim event manage saat "Kelola kategori" diklik', async () => {
    const wrapper = await mountFilters()

    await wrapper.get('.manage').trigger('click')

    expect(wrapper.emitted('manage')).toHaveLength(1)
  })
})
