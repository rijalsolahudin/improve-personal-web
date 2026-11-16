import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import DailyPriorityList from './DailyPriorityList.vue'

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function openAdd() {
  const wrapper = await mountSuspended(DailyPriorityList, {
    props: { priorities: [], now: 0 },
  })
  mounted.push(wrapper)
  await wrapper.get('.add-btn').trigger('click')
  return wrapper
}

describe('DailyPriorityList - quick add', () => {
  it('input baru muncul setelah tombol "+ Tambah" ditekan', async () => {
    const wrapper = await mountSuspended(DailyPriorityList, {
      props: { priorities: [], now: 0 },
    })
    mounted.push(wrapper)

    expect(wrapper.find('form').exists()).toBe(false)
    await wrapper.get('.add-btn').trigger('click')
    expect(wrapper.find('form input').exists()).toBe(true)
  })

  it('emit add dengan judul ter-trim lalu mengosongkan input', async () => {
    const wrapper = await openAdd()

    const input = wrapper.find('input')
    await input.setValue('  Kirim laporan  ')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('add')).toEqual([['Kirim laporan']])
    expect(input.element.value).toBe('')
  })

  it('tidak emit untuk judul kosong', async () => {
    const wrapper = await openAdd()

    await wrapper.find('input').setValue('   ')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('add')).toBeUndefined()
  })

  it('Esc menutup input tanpa emit', async () => {
    const wrapper = await openAdd()

    await wrapper.find('input').setValue('Draft')
    await wrapper.find('input').trigger('keydown', { key: 'Escape' })

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.emitted('add')).toBeUndefined()
  })
})
