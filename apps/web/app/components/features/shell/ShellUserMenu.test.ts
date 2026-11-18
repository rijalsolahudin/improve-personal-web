import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'

import { useUiStore } from '~/stores/ui'

import ShellUserMenu from './ShellUserMenu.vue'

/**
 * Tampilan berlaku di seluruh app: menu Profil membuka modalnya di tempat, bukan menavigasi ke
 * Daily dulu seperti "Preferensi" lama.
 */
describe('ShellUserMenu - Tampilan', () => {
  beforeEach(() => {
    useUiStore().isPickerOpen = false
  })

  it('item "Tampilan" membuka modal global lalu menutup menu', async () => {
    const wrapper = await mountSuspended(ShellUserMenu)
    await wrapper.get('button.card').trigger('click')

    const item = wrapper.findAll('#user-menu .item').find((node) => node.text() === 'Tampilan')
    expect(item?.element.tagName).toBe('BUTTON')
    await item?.trigger('click')

    expect(useUiStore().isPickerOpen).toBe(true)
    expect(wrapper.find('#user-menu').exists()).toBe(false)
  })
})
