import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import type { Task } from '~/utils/tasks'

import EisenhowerPool from './EisenhowerPool.vue'

/** Rabu, 10 September 2025, 10:00 waktu perangkat. */
const NOW = new Date(2025, 8, 10, 10, 0, 0).getTime()

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `task ${id}`,
    priority: 'medium',
    deadline: null,
    done: false,
    scheduleId: null,
    quadrant: null,
    position: 0,
    ...overrides,
  }
}

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function mountPool(tasks: Task[], isOver = false) {
  const wrapper = await mountSuspended(EisenhowerPool, {
    props: { tasks, now: NOW, isOver, draggingId: null },
  })
  mounted.push(wrapper)
  return wrapper
}

describe('EisenhowerPool - "Belum masuk matrix"', () => {
  it('menampilkan judul, petunjuk, dan tiap task beserta sisa waktunya', async () => {
    const wrapper = await mountPool([
      makeTask('p1', { deadline: NOW + 2 * 60 * 60 * 1000 }),
      makeTask('p2'),
    ])

    expect(wrapper.get('h2').text()).toBe('Belum masuk matrix')
    expect(wrapper.get('.hint').text()).toBe('Seret ke kuadran yang pas.')
    expect(wrapper.findAll('.item')).toHaveLength(2)
    expect(wrapper.findAll('.item-title').map((el) => el.text())).toEqual(['task p1', 'task p2'])
    expect(wrapper.findAll('.left').map((el) => el.text())).toEqual([
      '2 jam lagi',
      'Tanpa deadline',
    ])
    expect(wrapper.find('.empty').exists()).toBe(false)
  })

  it('pool kosong menampilkan pesan design, bukan daftar kosong', async () => {
    const wrapper = await mountPool([])

    expect(wrapper.findAll('.item')).toHaveLength(0)
    expect(wrapper.get('.empty').text()).toBe('Semua beres masuk matrix.')
  })

  it('deadline lewat ditandai overdue di baris pool', async () => {
    const wrapper = await mountPool([makeTask('telat', { deadline: NOW - 60 * 1000 })])

    expect(wrapper.get('.left').classes()).toContain('overdue')
  })

  it('zona drop pool tetap dikenali saat task diseret keluar dari matrix', async () => {
    const wrapper = await mountPool([makeTask('p1')], true)

    expect(wrapper.get('aside').attributes('data-drop-zone')).toBe('pool')
    expect(wrapper.get('aside').classes()).toContain('over')
  })

  it('tekan-geser pada baris meneruskan event drag beserta id task', async () => {
    const wrapper = await mountPool([makeTask('p1')])

    await wrapper.get('.item').trigger('pointerdown')

    const events = wrapper.emitted('drag')
    expect(events).toHaveLength(1)
    expect(events?.[0]?.[1]).toBe('p1')
  })
})
