import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import App from '~/app.vue'
import { useAppearance } from '~/composables/useAppearance'
import { STYLE_STORAGE_KEY, THEME_STORAGE_KEY } from '~/stores/appearance'

/**
 * QA T25 (F16) - gaya/tema terpasang di `<html>` lewat `data-theme`/`data-style`.
 *
 * app.vue yang diuji, bukan harness tiruan: kalau binding-nya lepas, seluruh CSS token berhenti
 * berlaku walau store-nya benar.
 */

const mounted: VueWrapper[] = []

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 60))
}

function attrs(): { theme: string | undefined; style: string | undefined } {
  return {
    theme: document.documentElement.dataset.theme,
    style: document.documentElement.dataset.style,
  }
}

describe('app.vue - tema & gaya di <html> (F16)', () => {
  beforeEach(() => {
    localStorage.clear()
    const { setTheme, setStyle } = useAppearance()
    setTheme('kuning')
    setStyle('cute')
  })

  afterEach(() => {
    while (mounted.length) mounted.pop()?.unmount()
    localStorage.clear()
  })

  it('memasang default Cute + Kuning saat pertama dibuka', async () => {
    const wrapper = await mountSuspended(App)
    mounted.push(wrapper)
    await flush()
    expect(attrs()).toEqual({ theme: 'kuning', style: 'cute' })
  })

  it('ganti tema & gaya berlaku langsung tanpa reload / tanpa mount ulang', async () => {
    const wrapper = await mountSuspended(App)
    mounted.push(wrapper)
    await flush()

    const rootSebelum = wrapper.element
    const { setTheme, setStyle } = useAppearance()
    setTheme('hijau')
    setStyle('vintage')
    await flush()

    expect(attrs()).toEqual({ theme: 'hijau', style: 'vintage' })
    // Elemen root yang sama = tidak ada reload / remount.
    expect(wrapper.element).toBe(rootSebelum)
  })

  it('pilihan tersimpan dipasang pada render pertama, bukan setelah interaksi', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'ungu')
    localStorage.setItem(STYLE_STORAGE_KEY, 'elegan')

    // Ini yang dijalankan plugin theme.client sebelum app di-mount.
    const appearance = useAppearance()
    appearance.restore()
    expect(appearance.theme.value).toBe('ungu')
    expect(appearance.style.value).toBe('elegan')

    const wrapper = await mountSuspended(App)
    mounted.push(wrapper)
    await flush()
    expect(attrs()).toEqual({ theme: 'ungu', style: 'elegan' })
  })

  it('nilai tersimpan yang tak dikenal tidak bikin error dan tetap default', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'merah')
    localStorage.setItem(STYLE_STORAGE_KEY, 'neon')
    useAppearance().restore()

    const wrapper = await mountSuspended(App)
    mounted.push(wrapper)
    await flush()
    expect(attrs()).toEqual({ theme: 'kuning', style: 'cute' })
  })
})
