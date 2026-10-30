import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import NavItem from './index.vue'

/**
 * Animasi collapse sidebar (regresi: label lenyap mendadak karena `v-if`).
 *
 * Label harus tetap ada di DOM supaya CSS bisa memudarkannya; nama aksesibel diambil dari satu
 * sumber saja - teks label saat terbuka, `title` saat collapsed.
 */
describe('NavItem', () => {
  it('terbuka: label tampil sebagai teks, tanpa title & atribut aria tambahan', async () => {
    const wrapper = await mountSuspended(NavItem, {
      props: { glyph: '•', color: '--icon-todo', label: 'To-do', to: '/app/to-do' },
    })
    const link = wrapper.get('a')

    expect(link.get('.label').text()).toBe('To-do')
    expect(link.classes()).not.toContain('collapsed')
    expect(link.attributes('title')).toBeUndefined()
    expect(link.get('.label').attributes('aria-hidden')).toBeUndefined()
  })

  it('collapsed: label tetap dirender (dianimasikan CSS) tapi tidak dibaca dua kali', async () => {
    const wrapper = await mountSuspended(NavItem, {
      props: {
        glyph: '•',
        color: '--icon-todo',
        label: 'To-do',
        to: '/app/to-do',
        collapsed: true,
      },
    })
    const link = wrapper.get('a')

    expect(link.classes()).toContain('collapsed')
    expect(link.attributes('title')).toBe('To-do')
    expect(link.find('.label').exists()).toBe(true)
    expect(link.find('.label').attributes('aria-hidden')).toBe('true')
    expect(link.find('.visually-hidden').exists()).toBe(false)
  })

  it('tanpa `to` jadi tombol dan meneruskan klik', async () => {
    const wrapper = await mountSuspended(NavItem, {
      props: { glyph: '»', color: '--accent', label: 'Keluar' },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})
