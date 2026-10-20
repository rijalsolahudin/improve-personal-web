import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import PasswordInput from './index.vue'

describe('PasswordInput', () => {
  it('tersembunyi dulu, tombol mata menampilkan lalu menyembunyikan lagi', async () => {
    const wrapper = await mountSuspended(PasswordInput, {
      props: { id: 'kata-sandi', modelValue: 'rahasia' },
    })
    const input = wrapper.find('input')
    const toggle = wrapper.find('button')

    expect(input.attributes('type')).toBe('password')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    expect(toggle.attributes('aria-label')).toBe('Tampilkan kata sandi')

    await toggle.trigger('click')
    expect(input.attributes('type')).toBe('text')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(toggle.attributes('aria-label')).toBe('Sembunyikan kata sandi')

    await toggle.trigger('click')
    expect(input.attributes('type')).toBe('password')
  })

  it('mengabarkan isi yang diketik lewat v-model', async () => {
    const wrapper = await mountSuspended(PasswordInput, {
      props: { id: 'kata-sandi', modelValue: '' },
    })

    await wrapper.find('input').setValue('baru')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['baru'])
  })
})
