import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import DailyPriorityList from './DailyPriorityList.vue'

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

describe('DailyPriorityList - quick add', () => {
  it('emit add dengan judul ter-trim lalu mengosongkan input', async () => {
    const wrapper = await mountSuspended(DailyPriorityList, {
      props: { priorities: [], now: 0 },
    })
    mounted.push(wrapper)

    const input = wrapper.find('input')
    await input.setValue('  Kirim laporan  ')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('add')).toEqual([['Kirim laporan']])
    expect(input.element.value).toBe('')
  })

  it('tidak emit untuk judul kosong', async () => {
    const wrapper = await mountSuspended(DailyPriorityList, {
      props: { priorities: [], now: 0 },
    })
    mounted.push(wrapper)

    await wrapper.find('input').setValue('   ')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('add')).toBeUndefined()
  })
})
