import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import IndexPage from '~/pages/app/index.vue'

/**
 * Regresi Ergonio #135: panel Prioritas kembali jadi kartu pertama kolom kiri Daily
 * (anchor `daily-prio`) dan tetap ada sebelum To-do. Struktur halaman diuji lewat anchor yang
 * sama dengan yang dipakai tur halaman, bukan selector kelas internal.
 */
const mounted: VueWrapper[] = []

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

describe('Halaman Daily - panel Prioritas (#135)', () => {
  it('merender panel Prioritas di kolom kiri, sebelum To-do', async () => {
    const wrapper = await mountSuspended(IndexPage)
    mounted.push(wrapper)

    const side = wrapper.get('.side')
    const anchors = side.findAll('[data-anchor]').map((node) => node.attributes('data-anchor'))

    expect(anchors.slice(0, 2)).toEqual(['daily-prio', 'daily-todo'])
  })

  it('panel Prioritas punya judul dan anchor tur halaman', async () => {
    const wrapper = await mountSuspended(IndexPage)
    mounted.push(wrapper)

    const panel = wrapper.get('[data-anchor="daily-prio"]')
    expect(panel.get('.title').text()).toContain('Prioritas')
    expect(panel.attributes('aria-labelledby')).toBe('daily-prio-title')
  })
})
