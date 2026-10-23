import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import ShellMenuSheet from './ShellMenuSheet.vue'
import ShellUserMenu from './ShellUserMenu.vue'

/**
 * QA T15: Panduan harus bisa ditemukan user.
 *
 * Halaman `/app/panduan` ada di grup `lainnya`, dan grup itu TIDAK dirender sidebar
 * (`NAV_GROUPS = ['utama','rencana','fokus']`). Satu-satunya pintu di desktop adalah menu akun, dan di
 * HP adalah menu sheet. Tanpa test ini, halaman Panduan bisa "ada" tapi tidak bisa dibuka - persis gap
 * yang pernah dilaporkan untuk Import & Export (lihat `ShellNav.test.ts`).
 */

afterEach(async () => {
  await flushPromises()
})

function panduanLink(wrapper: VueWrapper) {
  return wrapper.findAll('a').find((link) => link.attributes('href') === '/app/panduan')
}

describe('navigasi ke Panduan', () => {
  it('menu HP memuat tautan Panduan', async () => {
    const wrapper = await mountSuspended(ShellMenuSheet, {
      attrs: { id: 'shell-menu-guide-test' },
    })

    const link = panduanLink(wrapper)
    expect(link).toBeDefined()
    expect(link?.text()).toContain('Panduan')
  })

  it('menu akun di sidebar memuat tautan Panduan', async () => {
    const wrapper = await mountSuspended(ShellUserMenu)

    await wrapper.find('button.card').trigger('click')
    await flushPromises()

    const link = panduanLink(wrapper)
    expect(link).toBeDefined()
    expect(link?.text()).toContain('Panduan')
  })
})
