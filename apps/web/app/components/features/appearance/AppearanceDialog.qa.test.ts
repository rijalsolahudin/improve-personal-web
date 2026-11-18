import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { THEME_NAMES, themes as themeTokens, uiStyles } from '@improve-personal/tokens'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useAppearanceStore } from '~/stores/appearance'
import { useUiStore } from '~/stores/ui'
import { styleGroups } from '~/utils/appearancePreview'

import AppearanceDialog from './AppearanceDialog.vue'

/**
 * QA T25 (F16) - modal "Tampilan" (PRD: pilih tema + gaya, preview langsung).
 *
 * Yang diuji dari sisi user: modal tampil saat state global dibuka, menampilkan 8 tema + 8 gaya
 * (dikelompokkan per keluarga), memilih langsung mengubah preferensi tanpa menutup modal / reload,
 * ringkasan ikut berubah, dan bisa ditutup (tombol tutup / Escape).
 */

const mounted: VueWrapper[] = []

function normalizeColor(value: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim())
  if (!hex) return value.trim()
  const n = Number.parseInt(hex[1]!, 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

const LABEL_TEMA: Record<string, string> = {
  kuning: 'Kuning',
  hijau: 'Hijau',
  ungu: 'Ungu',
  biru: 'Biru',
  pink: 'Pink',
  toska: 'Toska',
  jingga: 'Jingga',
  grafit: 'Grafit',
}
const labelTema = (nama: string): string => LABEL_TEMA[nama] ?? nama
const namaGaya = (wrapper: VueWrapper): string[] =>
  wrapper.findAll('.style-name').map((node) => node.text())

async function mountDialog(): Promise<VueWrapper> {
  useUiStore().isPickerOpen = true
  const wrapper = await mountSuspended(AppearanceDialog, { attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  const store = useAppearanceStore()
  store.setTheme('kuning')
  store.setStyle('cute')
  useUiStore().isPickerOpen = false
})

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
  document.body.innerHTML = ''
})

describe('AppearanceDialog (F16)', () => {
  it('tertutup saat state global tertutup, tampil berjudul "Tampilan" saat dibuka', async () => {
    const wrapper = await mountSuspended(AppearanceDialog, { attachTo: document.body })
    mounted.push(wrapper)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    useUiStore().isPickerOpen = true
    await wrapper.vm.$nextTick()

    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.get('h2').text()).toBe('Tampilan')
  })

  it('menampilkan 8 pilihan tema dengan swatch warna tema masing-masing', async () => {
    const wrapper = await mountDialog()

    const opsi = wrapper.findAll('.themes button')
    expect(opsi.map((button) => button.text())).toEqual([...THEME_NAMES].map(labelTema))

    const swatch = wrapper.findAll('.themes .swatch')
    const warnaSwatch = swatch.map((node) => {
      const style = node.attributes('style') ?? ''
      const cocok = /background(?:-color)?:\s*([^;]+)/.exec(style)
      return normalizeColor(cocok?.[1] ?? '')
    })
    expect(warnaSwatch).toEqual(
      THEME_NAMES.map((nama) => normalizeColor(themeTokens[nama].primary)),
    )
  })

  it('gaya dikelompokkan per keluarga; tab terbuka di keluarga gaya aktif', async () => {
    const wrapper = await mountDialog()

    const tab = wrapper.findAll('.families button')
    expect(tab.map((button) => button.text())).toEqual(['Cute', 'Klasik'])
    expect(tab[0]!.attributes('aria-pressed')).toBe('true')
    expect(namaGaya(wrapper)).toEqual(['Clean', 'Cute', 'Cute Putih'])

    await tab[1]!.trigger('click')
    expect(namaGaya(wrapper)).toEqual(['Kertas', 'Simpel', 'Elegan', 'Vintage', 'Tegas'])
  })

  it('tiap kartu gaya memakai font display gaya itu & punya deskripsi', async () => {
    const wrapper = await mountDialog()

    for (const [index, group] of styleGroups().entries()) {
      await wrapper.findAll('.families button')[index]!.trigger('click')
      const opsi = wrapper.findAll('.style')
      expect(opsi).toHaveLength(group.styles.length)

      for (const [posisi, gaya] of group.styles.entries()) {
        const node = opsi[posisi]!
        expect(node.get('.style-desc').text().length).toBeGreaterThan(0)
        // Preview: nama gaya dirender dengan font display gaya tersebut (bukan font gaya aktif saja).
        const fontPertama = uiStyles[gaya].fonts.display.split(',')[0]!.replace(/['"]/g, '').trim()
        const inline = node.get('.style-name').attributes('style') ?? ''
        expect(inline.toLowerCase()).toContain(fontPertama.toLowerCase())
      }
    }
  })

  it('memilih tema langsung mengubah preferensi & ringkasan tanpa menutup menu', async () => {
    const wrapper = await mountDialog()

    const tombolHijau = wrapper.findAll('.themes button')[1]!
    await tombolHijau.trigger('click')

    const store = useAppearanceStore()
    expect(store.theme).toBe('hijau')
    expect(tombolHijau.attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('.themes button')[0]!.attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('.summary').text()).toBe('Hijau · Cute')
    // Tanpa reload / tanpa remount: modal tetap terbuka.
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  })

  it('memilih gaya langsung mengubah preferensi, penanda aktif, dan ringkasan', async () => {
    const wrapper = await mountDialog()
    await wrapper.findAll('.families button')[1]!.trigger('click')

    const tegas = wrapper.findAll('.style')[4]!
    await tegas.trigger('click')

    const store = useAppearanceStore()
    expect(store.style).toBe('tegas')
    expect(tegas.attributes('aria-pressed')).toBe('true')
    expect(tegas.classes()).toContain('on')
    expect(wrapper.findAll('.style')[0]!.attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('.summary').text()).toBe('Kuning · Tegas')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  })

  it('pilihan aktif mengikuti nilai tersimpan saat menu dibuka', async () => {
    const store = useAppearanceStore()
    store.setTheme('ungu')
    store.setStyle('elegan')

    const wrapper = await mountDialog()

    expect(wrapper.get('.summary').text()).toBe('Ungu · Elegan')
    expect(wrapper.findAll('.themes button')[2]!.attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('.families button')[1]!.attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('.style')[2]!.attributes('aria-pressed')).toBe('true')
  })

  it('menutup lewat tombol tutup atau Escape', async () => {
    const wrapper = await mountDialog()
    const ui = useUiStore()

    await wrapper.get('[role="dialog"] header button').trigger('click')
    expect(ui.isPickerOpen).toBe(false)

    ui.isPickerOpen = true
    await wrapper.vm.$nextTick()
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(ui.isPickerOpen).toBe(false)
  })
})
