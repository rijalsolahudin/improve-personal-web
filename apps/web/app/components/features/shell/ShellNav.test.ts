import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import ShellMenuSheet from './ShellMenuSheet.vue'
import ShellUserMenu from './ShellUserMenu.vue'

/**
 * Pintu masuk halaman Import & Export (F10).
 *
 * Alasannya diuji di level navigasi, bukan hanya di `features.ts`: fitur ini terdaftar di grup
 * `lainnya`, dan grup itu TIDAK dirender sidebar. Tanpa entri di menu akun (desktop) dan menu HP,
 * halamannya ada tapi tidak bisa ditemukan user - persis gap yang dilaporkan QA T12.
 */

afterEach(async () => {
  await flushPromises()
})

function importExportLink(wrapper: VueWrapper) {
  return wrapper.findAll('a').find((link) => link.attributes('href') === '/app/import-export')
}

describe('navigasi ke Import & Export', () => {
  it('menu HP memuat tautan Import / Export beserta labelnya', async () => {
    const wrapper = await mountSuspended(ShellMenuSheet, {
      attrs: { id: 'shell-menu-test' },
    })

    const link = importExportLink(wrapper)
    expect(link).toBeDefined()
    expect(link?.text()).toContain('Import / Export')
  })

  it('menu akun di sidebar memuat tautan Import / Export', async () => {
    const wrapper = await mountSuspended(ShellUserMenu)

    await wrapper.find('button.card').trigger('click')
    await flushPromises()

    const link = importExportLink(wrapper)
    expect(link).toBeDefined()
    expect(link?.text()).toContain('Import / Export')
  })
})
