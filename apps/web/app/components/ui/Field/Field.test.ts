import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import Input from '../Input/index.vue'
import Field from './index.vue'

describe('Field + Input', () => {
  it('label memakai `for` yang menunjuk id Input di dalamnya', async () => {
    const wrapper = await mountSuspended(
      defineComponent({
        setup: () => () => h(Field, { label: 'Judul' }, () => h(Input, { modelValue: '' })),
      }),
    )

    const id = wrapper.find('input').attributes('id')
    expect(id).toBeTruthy()
    expect(wrapper.find('label').attributes('for')).toBe(id)
    expect(wrapper.find('label').text()).toBe('Judul')
  })

  it('isGroup: label menamai role=group, bukan <label for>', async () => {
    const wrapper = await mountSuspended(Field, {
      props: { label: 'Warna', isGroup: true },
      slots: { default: '<button type="button">Merah</button>' },
    })

    const group = wrapper.find('[role="group"]')
    const labelId = group.attributes('aria-labelledby')
    expect(wrapper.find(`#${labelId}`).text()).toBe('Warna')
    expect(wrapper.find('label').exists()).toBe(false)
  })
})

describe('Input', () => {
  it('v-model dua arah; atribut native diteruskan', async () => {
    const value = ref('awal')
    const wrapper = await mountSuspended(
      defineComponent({
        setup: () => () =>
          h(Input, {
            modelValue: value.value,
            'onUpdate:modelValue': (next: string | number) => (value.value = String(next)),
            maxlength: 10,
            'aria-invalid': true,
          }),
      }),
    )

    const input = wrapper.find('input')
    expect(input.element.value).toBe('awal')
    expect(input.attributes('maxlength')).toBe('10')
    expect(input.attributes('aria-invalid')).toBe('true')

    await input.setValue('baru')
    expect(value.value).toBe('baru')
  })

  it('multiline merender textarea; bare tidak memasang class gaya', async () => {
    const area = await mountSuspended(Input, { props: { modelValue: '', multiline: true } })
    expect(area.find('textarea').exists()).toBe(true)

    const bare = await mountSuspended(Input, {
      props: { modelValue: '', variant: 'bare' },
      attrs: { class: 'tulisan' },
    })
    expect(bare.find('input').classes()).toEqual(['tulisan'])
  })
})
