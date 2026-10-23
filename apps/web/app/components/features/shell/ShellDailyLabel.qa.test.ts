import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ShellSidebar from './ShellSidebar.vue'

/**
 * QA T14 (Ergonio #28) - AC6: label menu sidebar untuk halaman utama harus "Daily"
 * (PRD F12: "Halaman utama (menggantikan Home; nama menu di sidebar: Daily)").
 *
 * Diuji di level render: yang dibaca user adalah teks tautan navigasi, bukan konstanta i18n.
 */
describe('label menu sidebar Daily (AC6)', () => {
  it('sidebar menampilkan tautan "/app" dengan label "Daily", bukan "Home"', async () => {
    const wrapper = await mountSuspended(ShellSidebar)
    await flushPromises()

    const home = wrapper.findAll('a').find((link) => link.attributes('href') === '/app')
    expect(home).toBeDefined()
    expect(home?.text()).toBe('Daily')

    const nav = wrapper.find('nav')
    expect(nav.text()).not.toContain('Home')
  })
})
