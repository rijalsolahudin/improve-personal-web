import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import Modal from './index.vue'

let mounted: VueWrapper | null = null

async function mount(props: {
  open: boolean
  isDismissible?: boolean
  title?: string
  align?: 'center' | 'top'
  width?: string
  slot?: string
}): Promise<VueWrapper> {
  const { slot, ...rest } = props
  mounted = await mountSuspended(Modal, {
    props: { labelledBy: 'judul', ...rest },
    attachTo: document.body,
    slots: { default: slot ?? '<h2 id="judul">Judul</h2><button type="button">Satu</button>' },
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

  it('title: kepala dengan judul menamai dialog; tombol tutup hanya bila isDismissible', async () => {
    const wrapper = await mount({ open: true, title: 'Momen baru', slot: '<p>isi</p>' })
    const titleId = wrapper.find('h2').attributes('id')

    expect(wrapper.find('h2').text()).toBe('Momen baru')
    expect(wrapper.find('[role="dialog"]').attributes('aria-labelledby')).toBe(titleId)
    expect(wrapper.find('header button').exists()).toBe(false)

    await wrapper.setProps({ isDismissible: true })
    await wrapper.find('header button').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('align top & width diteruskan ke dialog', async () => {
    const wrapper = await mount({ open: true, align: 'top', width: '540px' })

    expect(wrapper.find('.backdrop').classes()).toContain('align-top')
    expect(wrapper.find('[role="dialog"]').attributes('style')).toContain('--modal-width: 540px')
  })

  it('fokus awal ke kolom bertanda data-autofocus, bila ada', async () => {
    const wrapper = await mount({
      open: true,
      slot: '<input class="a" /><input class="b" data-autofocus />',
    })
    await flushPromises()

    expect(document.activeElement).toBe(wrapper.find('.b').element)
  })

  it('Esc di modal bertumpuk hanya menutup yang paling dalam', async () => {
    const wrapper = await mount({
      open: true,
      isDismissible: true,
      slot: '<div class="inner" role="dialog" tabindex="0" @keydown.esc.prevent>dalam</div>',
    })

    await wrapper.find('.inner').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toBeUndefined()

    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('atribut luar (mis. data-deco-ui) jatuh ke latar; isFlush membuang padding bawaan', async () => {
    const wrapper = await mountSuspended(Modal, {
      props: { open: true, labelledBy: 'judul', isFlush: true },
      attrs: { 'data-deco-ui': '' },
      slots: { default: '<h2 id="judul">Judul</h2>' },
    })
    mounted = wrapper

    expect(wrapper.find('.backdrop').attributes('data-deco-ui')).toBeDefined()
    expect(wrapper.find('.dialog').classes()).toContain('flush')
  })
})
