import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import type { Goal } from '@improve-personal/core/planner'
import type { GoalCategoryView } from '~/utils/goals/categories'

import GoalCategoryManager from './GoalCategoryManager.vue'

/**
 * Modal "Kategori goal": tambah lewat Enter, `general` tanpa tombol hapus, dan hapus kategori yang
 * masih dipakai goal HARUS lewat konfirmasi dulu. Pemindahan goal sendiri urusan `remove()` di
 * `useGoalCategories` (sudah diuji di composable) - di sini yang dibuktikan: `remove` tidak dipanggil
 * sebelum user menyetujui.
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

const GENERAL = view({
  key: 'general',
  label: 'General',
  color: 'gray',
  sortOrder: 0,
  accent: '#9A8B78',
})
const KARIER = view({ key: 'karier', label: 'Karier', sortOrder: 1 })

function goalOf(id: string, category: string): Goal {
  return {
    id,
    title: `Goal ${id}`,
    why: '',
    category,
    status: 'aktif',
    start: '2026-10-01',
    end: '2026-12-31',
    cover: null,
    along: [],
    chapters: [],
  }
}

const GOALS = [goalOf('g1', 'karier'), goalOf('g2', 'karier')]

const add = vi.fn()
const rename = vi.fn()
const setColor = vi.fn()
const remove = vi.fn()

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function mountManager() {
  const wrapper = await mountSuspended(GoalCategoryManager, { props: { goals: GOALS } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  add.mockReset().mockReturnValue({ ok: true, key: 'baru' })
  rename.mockReset().mockReturnValue({ ok: true })
  setColor.mockReset().mockReturnValue({ ok: true })
  remove.mockReset().mockReturnValue({ ok: true })
  useGoalCategories.mockReset()
  useGoalCategories.mockReturnValue({
    categories: ref([GENERAL, KARIER]),
    status: ref('ready'),
    error: ref(null),
    add,
    rename,
    setColor,
    remove,
  })
})

describe('GoalCategoryManager', () => {
  it('menambah kategori lewat Enter, lalu mengosongkan kolom', async () => {
    const wrapper = await mountManager()

    const input = wrapper.get('.add input')
    await input.setValue('Belajar')
    await input.trigger('keydown', { key: 'Enter' })

    expect(add).toHaveBeenCalledWith('Belajar')
    expect((wrapper.get('.add input').element as HTMLInputElement).value).toBe('')
  })

  it('menampilkan alasan gagal tanpa alert() saat kategori duplikat', async () => {
    add.mockReturnValue({ ok: false, reason: 'duplicate' })
    const wrapper = await mountManager()

    const input = wrapper.get('.add input')
    await input.setValue('Karier')
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.get('[role="alert"]').text()).toBe('Kategori dengan nama ini sudah ada.')
  })

  it('menampilkan alasan wajib diisi saat kolom kosong di-submit', async () => {
    add.mockReturnValue({ ok: false, reason: 'required' })
    const wrapper = await mountManager()

    await wrapper.get('.add').trigger('submit')

    expect(add).toHaveBeenCalledWith('')
    expect(wrapper.get('[role="alert"]').text()).toBe('Nama kategori wajib diisi.')
  })

  it('mengganti nama kategori saat input di-blur', async () => {
    const wrapper = await mountManager()

    const nameInput = wrapper.findAll('.category')[1]?.get('.name')
    await nameInput?.setValue('Karier Baru')
    await nameInput?.trigger('blur')

    expect(rename).toHaveBeenCalledWith('karier', 'Karier Baru')
  })

  it('menandai General sebagai Default dan tidak memberinya tombol hapus', async () => {
    const wrapper = await mountManager()

    const generalRow = wrapper.findAll('.category')[0]
    expect(generalRow?.get('.badge').text()).toBe('Default')
    expect(generalRow?.find('[aria-label="Hapus kategori General"]').exists()).toBe(false)
  })

  it('meminta konfirmasi sebelum menghapus kategori yang masih dipakai goal', async () => {
    const wrapper = await mountManager()

    const karierRow = wrapper.findAll('.category')[1]
    await karierRow?.get('[aria-label="Hapus kategori Karier"]').trigger('click')

    expect(remove).not.toHaveBeenCalled()
    expect(karierRow?.get('.warning').text()).toContain('2 goal')
    expect(karierRow?.get('.warning').text()).toContain('General')

    const confirm = karierRow
      ?.findAll('button')
      .find((button) => button.text() === 'Hapus & pindahkan')
    await confirm?.trigger('click')

    expect(remove).toHaveBeenCalledWith('karier')
  })

  it('menghapus kategori tanpa goal langsung, tanpa kotak konfirmasi', async () => {
    const KOSONG = view({ key: 'keuangan', label: 'Keuangan', sortOrder: 2 })
    useGoalCategories.mockReturnValue({
      categories: ref([GENERAL, KARIER, KOSONG]),
      status: ref('ready'),
      error: ref(null),
      add,
      rename,
      setColor,
      remove,
    })

    const wrapper = await mountManager()

    const kosongRow = wrapper.findAll('.category')[2]
    await kosongRow?.get('[aria-label="Hapus kategori Keuangan"]').trigger('click')

    expect(kosongRow?.find('.warning').exists()).toBe(false)
    expect(remove).toHaveBeenCalledWith('keuangan')
  })

  it('membatalkan konfirmasi tanpa menghapus apa pun', async () => {
    const wrapper = await mountManager()

    const karierRow = wrapper.findAll('.category')[1]
    await karierRow?.get('[aria-label="Hapus kategori Karier"]').trigger('click')
    await karierRow
      ?.findAll('button')
      .find((button) => button.text() === 'Batal')
      ?.trigger('click')

    expect(karierRow?.find('.warning').exists()).toBe(false)
    expect(remove).not.toHaveBeenCalled()
  })
})
