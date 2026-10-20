import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import Segmented from './index.vue'

describe('Segmented', () => {
  it('opsi disabled tidak bisa dipilih', async () => {
    const wrapper = await mountSuspended(Segmented, {
      props: {
        label: 'Fase',
        modelValue: 'a',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B', disabled: true },
        ],
      },
    })
    const second = wrapper.findAll('button')[1]

    expect(second?.attributes('disabled')).toBeDefined()
    await second?.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
