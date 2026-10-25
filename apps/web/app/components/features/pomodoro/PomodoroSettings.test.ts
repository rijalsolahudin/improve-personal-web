import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import PomodoroSettings from './PomodoroSettings.vue'

/**
 * Kontrak tampilan kartu Pengaturan Pomodoro (design `isPomo`): tiap durasi punya tombol −/+ yang
 * bisa dipakai dan angkanya berubah, plus satu switch suara.
 *
 * Kenapa bukan test CSS: happy-dom tidak menghitung gaya, jadi ukuran/ikon hasil override scoped
 * tidak bisa dibuktikan di sini. Yang dijaga adalah yang bisa rusak saat markup disentuh - nama
 * aksesibel tombol (glyph `−`/`+` sekarang dibungkus `<span>`), status disabled di batas nilai, dan
 * nilai yang benar-benar berubah saat diklik.
 */
const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function mountSettings() {
  const wrapper = await mountSuspended(PomodoroSettings)
  mounted.push(wrapper)
  return wrapper
}

function button(wrapper: VueWrapper, label: string) {
  return wrapper.get(`button[aria-label="${label}"]`)
}

describe('PomodoroSettings', () => {
  it('menaikkan durasi fokus lewat tombol + dan menurunkan lagi lewat −', async () => {
    const wrapper = await mountSettings()
    const increase = button(wrapper, 'Tambah Durasi fokus')
    const decrease = button(wrapper, 'Kurangi Durasi fokus')

    const before = Number.parseInt(wrapper.get('.value').text(), 10)
    await increase.trigger('click')
    expect(Number.parseInt(wrapper.get('.value').text(), 10)).toBe(before + 5)

    await decrease.trigger('click')
    await decrease.trigger('click')
    expect(Number.parseInt(wrapper.get('.value').text(), 10)).toBe(before - 5)
  })

  it('menonaktifkan tombol − saat durasi menyentuh batas bawah', async () => {
    const wrapper = await mountSettings()
    const decrease = button(wrapper, 'Kurangi Istirahat pendek')

    // Istirahat pendek minimum 1 menit; klik − sampai berhenti berubah.
    for (let i = 0; i < 40 && !decrease.attributes('disabled'); i += 1) {
      await decrease.trigger('click')
    }

    expect(decrease.attributes('disabled')).toBeDefined()
    expect(button(wrapper, 'Tambah Istirahat pendek').attributes('disabled')).toBeUndefined()
  })

  it('switch suara melaporkan statusnya dan berubah saat diklik', async () => {
    const wrapper = await mountSettings()
    const sound = wrapper.get('[role="switch"]')

    expect(sound.attributes('aria-label')).toBe('Suara pas fase selesai')
    const before = sound.attributes('aria-checked')

    await sound.trigger('click')
    expect(sound.attributes('aria-checked')).not.toBe(before)
  })
})
