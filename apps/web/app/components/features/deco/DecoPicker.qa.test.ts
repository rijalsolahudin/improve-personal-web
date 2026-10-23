import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useDeco } from '~/composables/useDeco'

import DecoPicker from './DecoPicker.vue'

const STATE_KEYS = ['sticker-recent', 'deco-items']

let mounted: VueWrapper | null = null

async function mountPicker(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  mounted = await mountSuspended(DecoPicker, {
    props: { title: 'Tempel sticker', ...props },
  })
  await flushPromises()
  return mounted
}

function cellByName(wrapper: VueWrapper, name: string) {
  return wrapper.findAll('button.cell').find((cell) => cell.text().includes(name))
}

function tabNames(wrapper: VueWrapper): string[] {
  return wrapper.findAll('[role="tab"]').map((tab) => tab.text())
}

beforeEach(() => {
  localStorage.clear()
  clearNuxtState(STATE_KEYS)
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('QA T24 · picker: tab per pack, grid, pencarian, pilih', () => {
  it('tab berisi "Terakhir dipakai" + semua pack katalog', async () => {
    const wrapper = await mountPicker()
    const tabs = tabNames(wrapper)
    expect(tabs[0]).toBe('Terakhir dipakai')
    expect(tabs).toContain('Mood')
    expect(tabs).toContain('Hewan')
    expect(tabs).toContain('Perayaan')
    expect(tabs.length).toBeGreaterThanOrEqual(10)
  })

  it('default pack pertama (mood) tampil sebagai grid; klik sel mengirim id sticker', async () => {
    const wrapper = await mountPicker()
    const bahagia = cellByName(wrapper, 'Bahagia')
    expect(bahagia).toBeTruthy()

    await bahagia?.trigger('click')
    expect(wrapper.emitted('choose')).toEqual([['mood/bahagia']])
  })

  it('pindah tab pack memuat isi pack itu (bukan semua pack sekaligus)', async () => {
    const wrapper = await mountPicker()
    const hewanTab = wrapper.findAll('[role="tab"]').find((tab) => tab.text() === 'Hewan')
    await hewanTab?.trigger('click')
    await flushPromises()

    expect(cellByName(wrapper, 'Kelinci')).toBeTruthy()
    expect(cellByName(wrapper, 'Bahagia')).toBeFalsy()
  })

  it('pencarian nama (debounce 200 ms) menyaring lintas pack', async () => {
    const wrapper = await mountPicker()
    const input = wrapper.get('input[type="search"]')
    await input.setValue('kopi')

    // Sebelum debounce selesai, daftar belum berubah.
    expect(cellByName(wrapper, 'Kopi')).toBeFalsy()

    await new Promise((resolve) => setTimeout(resolve, 260))
    await flushPromises()

    expect(cellByName(wrapper, 'Kopi')).toBeTruthy()
    expect(wrapper.text()).not.toContain('Nggak ketemu')
  })

  it('pencarian tanpa hasil menampilkan pesan, bukan grid kosong tanpa penjelasan', async () => {
    const wrapper = await mountPicker()
    await wrapper.get('input[type="search"]').setValue('zzz-tidak-ada')
    await new Promise((resolve) => setTimeout(resolve, 260))
    await flushPromises()

    expect(wrapper.findAll('button.cell')).toHaveLength(0)
    expect(wrapper.text()).toContain('zzz-tidak-ada')
  })

  it('varian ikon memberi awalan "icon:" (dipakai habit/countdown)', async () => {
    const wrapper = await mountPicker()
    const iconOption = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Ikon' && button.attributes('aria-pressed'))
    await iconOption?.trigger('click')
    await flushPromises()

    await cellByName(wrapper, 'Bahagia')?.trigger('click')
    expect(wrapper.emitted('choose')).toEqual([['icon:mood/bahagia']])
  })

  it('sticker yang sedang dipakai ditandai, termasuk varian ikon', async () => {
    const wrapper = await mountPicker({ current: 'icon:mood/bahagia' })
    expect(cellByName(wrapper, 'Bahagia')?.classes()).toContain('on')
    expect(cellByName(wrapper, 'Senang')?.classes()).not.toContain('on')
  })

  it('tab "Terakhir dipakai" memakai urutan recent & membuang id yang sudah tak dikenal', async () => {
    useState<string[]>('sticker-recent').value = ['hewan/kelinci', 'pack-lama/hilang']
    const wrapper = await mountPicker()

    // Tab default = recent saat ada isinya.
    expect(wrapper.get('[role="tab"]').text()).toBe('Terakhir dipakai')
    expect(cellByName(wrapper, 'Kelinci')).toBeTruthy()
    expect(wrapper.text()).not.toContain('hilang')
  })

  it('tombol tutup mengirim close; tombol "lepas" hanya ada kalau clearLabel diberikan', async () => {
    const wrapper = await mountPicker({ clearLabel: 'Hapus sampul' })
    const clear = wrapper.findAll('button').find((button) => button.text() === 'Hapus sampul')
    expect(clear).toBeTruthy()
    await clear?.trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)

    const close = wrapper
      .findAll('button')
      .find((button) => button.attributes('title') === 'Tutup' || button.text() === '×')
    await close?.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('lewat picker, sticker yang dipilih dicatat sebagai "terakhir dipakai" oleh pemanggil', async () => {
    const wrapper = await mountPicker()
    await cellByName(wrapper, 'Bahagia')?.trigger('click')
    expect(wrapper.emitted('choose')).toEqual([['mood/bahagia']])
    // Pemanggil (DecoLayer/form) memanggil rememberSticker; di sini kontrak store-nya diverifikasi.
    const deco = useDeco()
    deco.rememberSticker('mood/bahagia')
    expect(deco.recent.value).toEqual(['mood/bahagia'])
  })
})
