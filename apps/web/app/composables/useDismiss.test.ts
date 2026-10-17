import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import { useDismiss } from './useDismiss'

function mountWithDismiss(initiallyOpen: boolean) {
  const isOpen = ref(initiallyOpen)
  const Host = defineComponent({
    setup() {
      const root = ref<HTMLElement | null>(null)
      useDismiss(root, isOpen)
      return () => h('div', [h('div', { ref: root, id: 'inside' }), h('div', { id: 'outside' })])
    },
  })
  return { isOpen, mounted: mountSuspended(Host, { attachTo: document.body }) }
}

describe('useDismiss', () => {
  it('klik di luar menutup, klik di dalam tidak', async () => {
    const { isOpen, mounted } = mountWithDismiss(true)
    const wrapper = await mounted
    const inside = wrapper.find('#inside').element
    const outside = wrapper.find('#outside').element

    inside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(isOpen.value).toBe(true)

    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(isOpen.value).toBe(false)
    wrapper.unmount()
  })

  it('Escape menutup; listener tidak aktif saat tertutup', async () => {
    const { isOpen, mounted } = mountWithDismiss(false)
    const wrapper = await mounted
    isOpen.value = true
    await nextTick()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(isOpen.value).toBe(false)
    wrapper.unmount()
  })
})
