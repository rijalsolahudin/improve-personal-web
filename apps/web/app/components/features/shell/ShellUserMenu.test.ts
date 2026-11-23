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

  it('nama belum diisi: kartu & item profil mengajak "Atur nama kamu", bukan "Friend"', async () => {
    const wrapper = await mountSuspended(ShellUserMenu)

    expect(wrapper.get('button.card').text()).toContain('Atur nama kamu')
    expect(wrapper.get('button.card').text()).not.toContain('Friend')
    await wrapper.get('button.card').trigger('click')
    expect(wrapper.get('#user-menu .item').text()).toContain('Atur nama kamu')
  })

  it('"Keluar dari perangkat ini" membuka konfirmasi keluar', async () => {
    const wrapper = await mountSuspended(ShellUserMenu)
    await wrapper.get('button.card').trigger('click')

    await wrapper.get('#user-menu .sign-out').trigger('click')

    expect(useAccountDialogs().current.value).toBe('signOut')
    expect(wrapper.find('#user-menu').exists()).toBe(false)
  })
})
