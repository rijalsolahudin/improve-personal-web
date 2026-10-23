import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDecoScope } from './useDecoScope'

const routeState = vi.hoisted(() => ({ path: '/app/memo' }))
mockNuxtImport('useRoute', () => () => ({ path: routeState.path }))

/**
 * AC "hiasan desktop tidak muncul di HP & sebaliknya; resize jendela lintas batas mengganti set
 * hiasan". Yang diuji di sini: scope (halaman + bucket) benar-benar berganti saat jendela
 * melewati batas 600/1024 px, dua arah, tanpa reload.
 */
const queries: Array<{ listeners: Array<() => void> }> = []

const Harness = defineComponent({
  setup() {
    const { scope } = useDecoScope()
    return () => h('div', { 'data-testid': 'scope' }, `${scope.value.page}|${scope.value.bucket}`)
  },
})

let mounted: VueWrapper | null = null

function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
}

/** Meniru browser: callback matchMedia jalan saat lebar melewati breakpoint. */
function fireBreakpoints(): void {
  for (const query of queries) {
    for (const listener of query.listeners) listener()
  }
}

function scopeText(wrapper: VueWrapper): string {
  return wrapper.get('[data-testid="scope"]').text()
}

beforeEach(() => {
  queries.length = 0
  vi.stubGlobal('matchMedia', (media: string) => {
    const entry = { listeners: [] as Array<() => void> }
    queries.push(entry)
    return {
      matches: false,
      media,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => entry.listeners.push(listener),
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }
  })
  setWidth(1400)
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  vi.unstubAllGlobals()
  await flushPromises()
})

describe('QA T24 · resize lintas batas mengganti set hiasan', () => {
  it('desktop → tablet → hp → tablet → desktop, tiap batas memicu ganti bucket', async () => {
    mounted = await mountSuspended(Harness)
    await flushPromises()
    expect(scopeText(mounted)).toContain('|desktop')

    setWidth(1000)
    fireBreakpoints()
    await mounted.vm.$nextTick()
    expect(scopeText(mounted)).toContain('|tablet')

    setWidth(420)
    fireBreakpoints()
    await mounted.vm.$nextTick()
    expect(scopeText(mounted)).toContain('|hp')

    // Naik lagi: hp → tablet → desktop.
    setWidth(800)
    fireBreakpoints()
    await mounted.vm.$nextTick()
    expect(scopeText(mounted)).toContain('|tablet')

    setWidth(1280)
    fireBreakpoints()
    await mounted.vm.$nextTick()
    expect(scopeText(mounted)).toContain('|desktop')
  })

  it('mendengar dua breakpoint (600 & 1024) dan melepas listener saat unmount', async () => {
    const removeSpy = vi.fn()
    queries.length = 0
    vi.stubGlobal('matchMedia', (media: string) => {
      const entry = { listeners: [] as Array<() => void> }
      queries.push(entry)
      return {
        matches: false,
        media,
        onchange: null,
        addEventListener: (_type: string, listener: () => void) => entry.listeners.push(listener),
        removeEventListener: removeSpy,
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }
    })

    mounted = await mountSuspended(Harness)
    await flushPromises()
    expect(queries).toHaveLength(2)
    expect(queries[0]?.listeners.length).toBe(1)

    mounted.unmount()
    mounted = null
    expect(removeSpy).toHaveBeenCalledTimes(2)
  })

  it('halaman diambil dari path (bukan selalu "home"): /app/memo → memo', async () => {
    mounted = await mountSuspended(Harness)
    await flushPromises()
    expect(scopeText(mounted)).toBe('memo|desktop')
  })
})
