import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import MoodPicker from './index.vue'

/** Mood 5 skala: pilihan tunggal (klik lagi = batal) yang dipakai kartu "Perasaan hari ini". */
const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function mountPicker(modelValue: number | null = null): Promise<VueWrapper> {
  const wrapper = await mountSuspended(MoodPicker, {
    props: { label: 'Mood hari ini', modelValue },
  })
  mounted.push(wrapper)
  return wrapper
}

describe('MoodPicker', () => {
  it('merender lima pilihan mood, hanya satu yang terpilih, berlabel teks', async () => {
    const wrapper = await mountPicker(3)

    expect(wrapper.findAll('.mood')).toHaveLength(5)
    expect(wrapper.find('.moods').attributes('aria-label')).toBe('Mood hari ini')

    const pressed = wrapper.findAll('.mood[aria-pressed="true"]')
    expect(pressed).toHaveLength(1)
    expect(pressed[0]?.text()).toContain('🙂')
    expect(pressed[0]?.text()).toContain('Senang')
  })

  it('klik tile memilih mood, klik tile yang sama membatalkannya', async () => {
    const wrapper = await mountPicker(null)

    await wrapper.findAll('.mood')[4]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([4])

    await wrapper.setProps({ modelValue: 4 })
    await wrapper.findAll('.mood')[4]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([null])

    // Tile lain tetap bisa dipilih setelah pilihan dibatalkan.
    await wrapper.setProps({ modelValue: null })
    await wrapper.findAll('.mood')[0]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[2]).toEqual([0])
  })
})
