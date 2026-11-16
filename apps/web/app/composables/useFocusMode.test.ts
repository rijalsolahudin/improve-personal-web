import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { useFocusMode } from '~/composables/useFocusMode'

/**
 * Mode fokus menulis jurnal: lapisan layar penuh + fullscreen browser di desktop. Yang dijaga:
 * scroll halaman dikunci & dipulihkan, `Esc` menutup, dan keluar fullscreen browser (yang memakan
 * `Esc`) ikut menutup mode fokus supaya dua keadaan itu tidak pernah berbeda.
 */

type FocusApi = ReturnType<typeof useFocusMode>

let api: FocusApi | null = null
let wrapper: VueWrapper | null = null
let fullscreenElement: Element | null = null

const Host = defineComponent({
  setup() {
    api = useFocusMode()
    return () => h('div')
  },
})

function stubScreen(isWide: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: isWide, media: query }))
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  })
  document.documentElement.requestFullscreen = vi.fn(async () => {
    fullscreenElement = document.documentElement
  })
  document.exitFullscreen = vi.fn(async () => {
    fullscreenElement = null
  })
}

async function mountHost(): Promise<FocusApi> {
  wrapper = await mountSuspended(Host)
  if (api === null) throw new Error('composable tidak terpasang')
  return api
}

beforeEach(() => {
  fullscreenElement = null
  document.body.style.overflow = 'auto'
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  api = null
  vi.unstubAllGlobals()
})

describe('useFocusMode', () => {
  it('masuk mengunci scroll halaman dan meminta fullscreen di layar lebar; keluar memulihkannya', async () => {
    stubScreen(true)
    const focus = await mountHost()

    await focus.enter()
    expect(focus.isFocus.value).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1)

    focus.exit()
    await flushPromises()
    expect(focus.isFocus.value).toBe(false)
    expect(document.body.style.overflow).toBe('auto')
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1)
  })

  it('di HP tidak meminta fullscreen browser; lapisan fokus saja', async () => {
    stubScreen(false)
    const focus = await mountHost()

    await focus.enter()
    expect(focus.isFocus.value).toBe(true)
    expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled()
  })

  it('Esc menutup mode fokus', async () => {
    stubScreen(false)
    const focus = await mountHost()

    await focus.enter()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(focus.isFocus.value).toBe(false)
  })

  it('keluar fullscreen lewat browser ikut menutup mode fokus', async () => {
    stubScreen(true)
    const focus = await mountHost()

    await focus.enter()
    fullscreenElement = null
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(focus.isFocus.value).toBe(false)
    expect(document.body.style.overflow).toBe('auto')
  })

  it('fullscreen ditolak browser: mode fokus tetap jalan tanpa melempar', async () => {
    stubScreen(true)
    document.documentElement.requestFullscreen = vi.fn(async () => {
      throw new Error('ditolak')
    })
    const focus = await mountHost()

    await focus.enter()
    expect(focus.isFocus.value).toBe(true)
  })

  it('unmount saat fokus memulihkan scroll halaman', async () => {
    stubScreen(false)
    const focus = await mountHost()

    await focus.enter()
    wrapper?.unmount()
    wrapper = null
    expect(document.body.style.overflow).toBe('auto')
  })
})
