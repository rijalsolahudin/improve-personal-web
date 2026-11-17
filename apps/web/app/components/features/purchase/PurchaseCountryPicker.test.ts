import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import PurchaseCountryPicker from './PurchaseCountryPicker.vue'

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function openPicker(modelValue = 'ID') {
  const wrapper = await mountSuspended(PurchaseCountryPicker, {
    props: { modelValue },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await wrapper.get('button').trigger('click')
  return wrapper
}

const selectedIsos = (wrapper: VueWrapper) =>
  (wrapper.emitted('update:modelValue') ?? []).map(([iso]) => iso)

describe('PurchaseCountryPicker', () => {
  it('tombol menampilkan kode negara terpilih; daftar tertutup', async () => {
    const wrapper = await mountSuspended(PurchaseCountryPicker, { props: { modelValue: 'SG' } })
    mounted.push(wrapper)

    expect(wrapper.get('button').text()).toContain('+65')
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('cari lalu Enter memilih negara pertama yang cocok dan menutup daftar', async () => {
    const wrapper = await openPicker()

    await wrapper.get('[role="combobox"]').setValue('singa')
    expect(wrapper.findAll('[role="option"]')).toHaveLength(1)
    await wrapper.get('[role="combobox"]').trigger('keydown', { key: 'Enter' })

    expect(selectedIsos(wrapper)).toEqual(['SG'])
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('panah bawah memindah pilihan aktif dari negara terpilih', async () => {
    const wrapper = await openPicker('ID')
    const search = wrapper.get('[role="combobox"]')

    await search.trigger('keydown', { key: 'ArrowDown' })
    await search.trigger('keydown', { key: 'Enter' })

    expect(selectedIsos(wrapper)).toEqual(['MY'])
  })

  it('klik opsi memilih negara itu', async () => {
    const wrapper = await openPicker()

    const japan = wrapper.findAll('[role="option"]').find((option) => option.text().includes('+81'))
    await japan?.trigger('click')

    expect(selectedIsos(wrapper)).toEqual(['JP'])
  })

  it('tidak ada yang cocok -> pesan kosong, Enter tidak memilih apa pun', async () => {
    const wrapper = await openPicker()

    await wrapper.get('[role="combobox"]').setValue('zzz')
    await wrapper.get('[role="combobox"]').trigger('keydown', { key: 'Enter' })

    expect(wrapper.text()).toContain('Negara tidak ditemukan.')
    expect(selectedIsos(wrapper)).toEqual([])
  })
})
