import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import SwatchPicker from './index.vue'

const OPTIONS = [
  { value: 0, color: '#f00', label: 'Warna 1' },
  { value: 1, color: '#0f0', label: 'Warna 2' },
]

describe('SwatchPicker', () => {
  it('menandai warna terpilih dan memancarkan nilai baru saat diklik', async () => {
    const wrapper = await mountSuspended(SwatchPicker, {
      props: { options: OPTIONS, modelValue: 0 },
    })
    const [first, second] = wrapper.findAll('button')

    expect(first?.attributes('aria-pressed')).toBe('true')
    expect(second?.attributes('aria-pressed')).toBe('false')
    expect(second?.attributes('aria-label')).toBe('Warna 2')

    await second?.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[1]])
  })
})
