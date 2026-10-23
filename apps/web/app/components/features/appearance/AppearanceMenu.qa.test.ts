import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { themes as themeTokens, uiStyles } from '@improve-personal/tokens'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useAppearanceStore } from '~/stores/appearance'
import { useUiStore } from '~/stores/ui'

import AppearanceMenu from './AppearanceMenu.vue'

/**
 * QA T25 (F16) - menu "Tampilan" (PRD: pilih tema + gaya, preview langsung).
 *
 * Yang diuji dari sisi user: menu bisa dibuka, menampilkan 3 tema + 7 gaya, memilih langsung
 * mengubah preferensi tanpa menutup menu / reload, ringkasan ikut berubah, dan bisa ditutup
 * (klik luar / Escape) - termasuk atribut aksesibilitasnya.
 */

const mounted: VueWrapper[] = []

function normalizeColor(value: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim())
  if (!hex) return value.trim()
  const n = Number.parseInt(hex[1]!, 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

async function mountMenu(): Promise<VueWrapper> {
  const wrapper = await mountSuspended(AppearanceMenu)
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

describe('AppearanceMenu (F16)', () => {
  it('tertutup awalnya dan bisa dibuka dari tombol "Tampilan"', async () => {
    const wrapper = await mountMenu()
    const trigger = wrapper.get('button.trigger')
    expect(wrapper.find('#appearance-panel').exists()).toBe(false)
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(trigger.attributes('aria-controls')).toBe('appearance-panel')
    expect(trigger.text()).toContain('Tampilan')

    await trigger.trigger('click')
    expect(wrapper.find('#appearance-panel').exists()).toBe(true)
    expect(trigger.attributes('aria-expanded')).toBe('true')

    await trigger.trigger('click')
    expect(wrapper.find('#appearance-panel').exists()).toBe(false)
  })

  it('menampilkan 3 pilihan tema dengan swatch warna tema masing-masing', async () => {
    const wrapper = await mountMenu()
    await wrapper.get('button.trigger').trigger('click')

    const opsi = wrapper.findAll('.themes button')
    expect(opsi).toHaveLength(3)
    expect(opsi.map((button) => button.text())).toEqual(['Kuning', 'Hijau', 'Ungu'])

    const swatch = wrapper.findAll('.themes .swatch')
    expect(swatch).toHaveLength(3)
    const warnaIswatch = swatch.map((node) => {
      const style = node.attributes('style') ?? ''
      const cocok = /background(?:-color)?:\s*([^;]+)/.exec(style)
      return normalizeColor(cocok?.[1] ?? '')
    })
    expect(warnaIswatch).toEqual(
      (['kuning', 'hijau', 'ungu'] as const).map((nama) =>
        normalizeColor(themeTokens[nama].primary),
      ),
    )
  })

  it('menampilkan 7 gaya dengan label, deskripsi, dan preview font gaya itu', async () => {
    const wrapper = await mountMenu()
    await wrapper.get('button.trigger').trigger('click')

    const opsi = wrapper.findAll('.style')
    expect(opsi).toHaveLength(7)
    const nama = ['cute', 'cute-pure', 'kertas', 'simple', 'elegan', 'vintage', 'tegas'] as const

    for (const [index, gaya] of nama.entries()) {
      const node = opsi[index]!
      const styleName = node.get('.style-name')
      expect(styleName.text().length).toBeGreaterThan(0)
      expect(node.get('.style-desc').text().length).toBeGreaterThan(0)
      // Preview: nama gaya dirender dengan font display gaya tersebut (bukan font gaya aktif saja).
      const fontPertama = uiStyles[gaya].fonts.display.split(',')[0]!.replace(/['"]/g, '').trim()
      const inline = styleName.attributes('style') ?? ''
      expect(inline.toLowerCase()).toContain(fontPertama.toLowerCase())
    }
  })

  it('memilih tema langsung mengubah preferensi & ringkasan tanpa menutup menu', async () => {
    const wrapper = await mountMenu()
    await wrapper.get('button.trigger').trigger('click')

    const tombolHijau = wrapper.findAll('.themes button')[1]!
    await tombolHijau.trigger('click')

    const store = useAppearanceStore()
    expect(store.theme).toBe('hijau')
    expect(tombolHijau.attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('.themes button')[0]!.attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('.summary').text()).toBe('Hijau · Cute')
    // Tanpa reload / tanpa remount: panel tetap terbuka.
    expect(wrapper.find('#appearance-panel').exists()).toBe(true)
  })

  it('memilih gaya langsung mengubah preferensi, penanda aktif, dan ringkasan', async () => {
    const wrapper = await mountMenu()
    await wrapper.get('button.trigger').trigger('click')

    const opsi = wrapper.findAll('.style')
    await opsi[6]!.trigger('click')

    const store = useAppearanceStore()
    expect(store.style).toBe('tegas')
    expect(opsi[6]!.attributes('aria-pressed')).toBe('true')
    expect(opsi[0]!.attributes('aria-pressed')).toBe('false')
    expect(opsi[6]!.classes()).toContain('on')
    expect(wrapper.get('.summary').text()).toBe('Kuning · Tegas')
    expect(wrapper.find('#appearance-panel').exists()).toBe(true)
  })

  it('pilihan aktif mengikuti nilai tersimpan saat menu dibuka', async () => {
    const store = useAppearanceStore()
    store.setTheme('ungu')
    store.setStyle('elegan')

    const wrapper = await mountMenu()
    await wrapper.get('button.trigger').trigger('click')

    expect(wrapper.get('.summary').text()).toBe('Ungu · Elegan')
    expect(wrapper.findAll('.themes button')[2]!.attributes('aria-pressed')).toBe('true')
    expect(wrapper.findAll('.style')[4]!.attributes('aria-pressed')).toBe('true')
  })

  it('menutup saat Escape atau klik di luar menu', async () => {
    const wrapper = await mountMenu()
    const trigger = wrapper.get('button.trigger')

    await trigger.trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#appearance-panel').exists()).toBe(false)

    await trigger.trigger('click')
    expect(wrapper.find('#appearance-panel').exists()).toBe(true)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#appearance-panel').exists()).toBe(false)
  })
})
