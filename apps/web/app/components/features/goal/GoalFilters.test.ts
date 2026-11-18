import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import type { GoalCategoryView } from '~/utils/goals/categories'

import GoalFilters from './GoalFilters.vue'

/**
 * Opsi dropdown kategori DATANG dari katalog (`useGoalCategories`), bukan enum statis: kategori
 * buatan user harus muncul tanpa mengubah komponen. Yang diuji perilakunya - opsi dirender dari data,
 * pilihan mengubah model lalu menutup menu, dan aksi kelola mengirim event ke halaman.
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

async function openMenu(wrapper: VueWrapper) {
  await wrapper.get('.trigger').trigger('click')
}

const optionTexts = (wrapper: VueWrapper) =>
  wrapper.findAll('[role="menuitemradio"]').map((item) => item.text())

describe('GoalFilters - dropdown kategori dinamis', () => {
  it('menu tertutup sampai tombol kategori diklik', async () => {
    const wrapper = await mountFilters()

    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    await openMenu(wrapper)

    expect(wrapper.get('.trigger').attributes('aria-expanded')).toBe('true')
    expect(optionTexts(wrapper)).toEqual(['Semua kategori', 'General', 'Karier', 'Belajar Bahasa'])
  })

  it('tombol menampilkan kategori aktif dan menu mencentangnya', async () => {
    const wrapper = await mountSuspended(GoalFilters, {
      props: { status: 'semua', category: 'karier' },
    })
    mounted.push(wrapper)

    expect(wrapper.get('.trigger').text()).toContain('Karier')
    await openMenu(wrapper)
    const checked = wrapper.findAll('[role="menuitemradio"][aria-checked="true"]')
    expect(checked.map((item) => item.text())).toEqual(['Karier'])
  })

  it('kategori aktif yang tidak ada di katalog tampil sebagai "Semua kategori"', async () => {
    const wrapper = await mountSuspended(GoalFilters, {
      props: { status: 'semua', category: 'terhapus' },
    })
    mounted.push(wrapper)

    expect(wrapper.get('.trigger').text()).toContain('Semua kategori')
  })

  it('memilih opsi mengirim update:category lalu menutup menu', async () => {
    const wrapper = await mountFilters()
    await openMenu(wrapper)

    const item = wrapper
      .findAll('[role="menuitemradio"]')
      .find((entry) => entry.text() === 'Belajar Bahasa')
    await item?.trigger('click')

    expect(wrapper.emitted('update:category')?.at(-1)).toEqual([
      '018f2c4e-0000-7000-8000-00000000cafe',
    ])
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })

  it('mengirim event manage saat "Kelola kategori" diklik', async () => {
    const wrapper = await mountFilters()
    await openMenu(wrapper)

    await wrapper.get('.manage').trigger('click')

    expect(wrapper.emitted('manage')).toHaveLength(1)
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })
})
