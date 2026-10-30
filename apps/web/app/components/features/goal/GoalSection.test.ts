import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import type { GoalItem } from '~/utils/goals'

import GoalSection from './GoalSection.vue'

/**
 * Baris item versi design v2: tanda selesai/titik di KIRI, judul di tengah, chip jenis pindah ke
 * baris meta di bawah judul, dan persentase tetap paling kanan (habit/jadwal).
 */
const TASK: GoalItem = {
  id: '018f2c4e-0000-7000-8000-0000000000t1',
  kind: 'task',
  title: 'Baca bab 1',
  meta: 'selesai Jumat',
  done: false,
  rate: null,
}

const HABIT: GoalItem = {
  id: '018f2c4e-0000-7000-8000-0000000000h1',
  kind: 'habit',
  title: 'Jalan 30 menit',
  meta: '3x pekan',
  done: false,
  rate: 50,
}

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function mountSection(items: GoalItem[]) {
  const wrapper = await mountSuspended(GoalSection, {
    props: {
      badge: '1',
      title: 'Bab 1',
      sub: '1 Okt – 31 Okt · 2 item',
      status: 'berjalan',
      progress: 50,
      items,
      isOpen: true,
    },
  })
  mounted.push(wrapper)
  return wrapper
}

describe('GoalSection - baris item', () => {
  it('menaruh checkbox di kiri baris task', async () => {
    const wrapper = await mountSection([TASK])

    const item = wrapper.get('.item')
    const first = item.element.children[0]
    expect(first?.classList.contains('checkbox')).toBe(true)
    expect(item.get('.item-title').text()).toBe('Baca bab 1')
  })

  it('menaruh titik jenis di kiri baris habit, bukan checkbox', async () => {
    const wrapper = await mountSection([HABIT])

    const first = wrapper.get('.item').element.children[0]
    expect(first?.classList.contains('marker')).toBe(true)
    expect(first?.classList.contains('checkbox')).toBe(false)
  })

  it('memindahkan chip jenis ke baris meta di bawah judul', async () => {
    const wrapper = await mountSection([TASK, HABIT])

    const taskMeta = wrapper.findAll('.item')[0]?.get('.item-meta')
    expect(taskMeta?.get('.chip').text()).toBe('Task')
    expect(taskMeta?.text()).toContain('selesai Jumat')

    const habitMeta = wrapper.findAll('.item')[1]?.get('.item-meta')
    expect(habitMeta?.get('.chip').text()).toBe('Habit')
  })

  it('menampilkan persentase habit di ujung kanan', async () => {
    const wrapper = await mountSection([HABIT])

    const item = wrapper.get('.item')
    expect(item.get('.rate').text()).toBe('50%')
    expect(item.element.lastElementChild?.classList.contains('rate')).toBe(true)
  })

  it('mengirim toggle-item saat checkbox task diklik', async () => {
    const wrapper = await mountSection([TASK])

    await wrapper.get('.item .checkbox').trigger('click')

    expect(wrapper.emitted('toggle-item')?.[0]).toEqual([TASK.id])
  })
})
