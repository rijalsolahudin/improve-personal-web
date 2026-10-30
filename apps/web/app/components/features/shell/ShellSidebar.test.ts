import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'

import { useUiStore } from '~/stores/ui'

import ShellSidebar from './ShellSidebar.vue'

/**
 * Collapse sidebar (regresi: judul grup, label nav, dan wordmark lenyap mendadak karena `v-if`).
 *
 * Yang dijaga: teks tetap ada di DOM supaya transisi CSS bisa berjalan, dan lebar sidebar tetap
 * 248px ↔ 88px - animasinya milik stylesheet, bukan struktur DOM.
 */
describe('ShellSidebar collapse', () => {
  beforeEach(() => {
    useUiStore().isCollapsed = false
  })

  it('judul grup, label nav, dan wordmark tetap dirender saat collapsed', async () => {
    const wrapper = await mountSuspended(ShellSidebar)
    const aside = wrapper.get('aside')

    expect(aside.classes()).not.toContain('collapsed')
    const expandedTitles = wrapper.findAll('.group-title').length
    expect(expandedTitles).toBeGreaterThan(0)

    await wrapper.get('.brand-row button').trigger('click')

    expect(aside.classes()).toContain('collapsed')
    // Jumlahnya sama: elemen tidak dilepas dari DOM, hanya dianimasikan CSS.
    expect(wrapper.findAll('.group-title')).toHaveLength(expandedTitles)
    expect(wrapper.get('.brand-row').text()).toContain('Improve')
    expect(wrapper.findAll('a.nav-item')).not.toHaveLength(0)
    expect(wrapper.find('a.nav-item .label').exists()).toBe(true)
  })

  it('collapse tidak mengubah menu, urutan, atau rute navigasi', async () => {
    const expanded = await mountSuspended(ShellSidebar)
    const expandedHrefs = expanded.findAll('a.nav-item').map((link) => link.attributes('href'))

    useUiStore().isCollapsed = true
    const collapsed = await mountSuspended(ShellSidebar)
    const collapsedHrefs = collapsed.findAll('a.nav-item').map((link) => link.attributes('href'))

    expect(expandedHrefs.length).toBeGreaterThan(0)
    expect(collapsedHrefs).toEqual(expandedHrefs)
  })

  it('semua label nav collapsed memakai title sebagai nama aksesibel', async () => {
    useUiStore().isCollapsed = true
    const wrapper = await mountSuspended(ShellSidebar)
    const links = wrapper.findAll('a.nav-item')

    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.attributes('title')).toBeTruthy()
      expect(link.get('.label').attributes('aria-hidden')).toBe('true')
    }
  })
})
