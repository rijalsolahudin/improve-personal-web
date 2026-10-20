import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import Modal from './index.vue'

let mounted: VueWrapper | null = null

async function mount(props: { open: boolean; isDismissible?: boolean }): Promise<VueWrapper> {
  mounted = await mountSuspended(Modal, {
    props: { labelledBy: 'judul', ...props },
    slots: { default: '<h2 id="judul">Judul</h2><button type="button">Satu</button>' },
  })
  return mounted
}

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
  document.documentElement.style.overflow = ''
})

describe('Modal', () => {
  it('mematikan scroll halaman selama terbuka, dan mengembalikannya saat ditutup', async () => {
    const wrapper = await mount({ open: true })
    expect(document.documentElement.style.overflow).toBe('hidden')

    await wrapper.setProps({ open: false })
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('melepas kunci scroll saat di-unmount (mis. rute berpindah saat modal terbuka)', async () => {
    const wrapper = await mount({ open: true })
    expect(document.documentElement.style.overflow).toBe('hidden')

    wrapper.unmount()
    mounted = null
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('default-nya tidak bisa ditutup: Esc dan klik latar diabaikan', async () => {
    const wrapper = await mount({ open: true })

    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    await wrapper.find('.backdrop').trigger('click')

    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.find('[role="dialog"]').attributes('aria-labelledby')).toBe('judul')
  })

  it('isDismissible: Esc dan klik latar meminta ditutup, klik di dalam dialog tidak', async () => {
    const wrapper = await mount({ open: true, isDismissible: true })

    await wrapper.find('[role="dialog"]').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()

    await wrapper.find('.backdrop').trigger('click')
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(2)
  })
})
