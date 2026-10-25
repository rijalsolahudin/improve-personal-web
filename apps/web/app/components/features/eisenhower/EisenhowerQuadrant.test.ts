import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import type { Quadrant, Task } from '~/utils/tasks'

import EisenhowerQuadrant from './EisenhowerQuadrant.vue'

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
    quadrant: 'do',
    position: 0,
    ...overrides,
  }
}

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function mountQuadrant(
  quadrant: Quadrant,
  tasks: Task[] = [],
  pool: Task[] = [],
  isOver = false,
) {
  const wrapper = await mountSuspended(EisenhowerQuadrant, {
    props: { quadrant, tasks, pool, now: NOW, isOver, draggingId: null },
  })
  mounted.push(wrapper)
  return wrapper
}

describe('EisenhowerQuadrant - kepala & isi', () => {
  it('menampilkan judul, subjudul, dan jumlah task kuadran', async () => {
    const wrapper = await mountQuadrant('plan', [makeTask('a'), makeTask('b')])

    expect(wrapper.get('h2').text()).toBe('Jadwalkan')
    expect(wrapper.get('.sub').text()).toBe('Penting · tidak mendesak')
    expect(wrapper.get('.count').text()).toBe('2')
    expect(wrapper.findAll('.card')).toHaveLength(2)
  })

  it('kuadran kosong tidak merender daftar kosong, jadi jarak ke tombol tambah tidak dobel', async () => {
    const wrapper = await mountQuadrant('drop')

    expect(wrapper.find('.cards').exists()).toBe(false)
    expect(wrapper.get('.add').text()).toContain('Tambah dari to-do')
  })

  it('menandai dirinya sebagai zona drop untuk drag & drop', async () => {
    const wrapper = await mountQuadrant('delegate')

    expect(wrapper.get('section').attributes('data-drop-zone')).toBe('delegate')
  })

  it('border putus-putus aktif saat task diseret di atas kuadran', async () => {
    const wrapper = await mountQuadrant('do', [], [], true)

    expect(wrapper.get('section').classes()).toContain('over')
  })
})

describe('EisenhowerQuadrant - tambah dari to-do', () => {
  it('tombol tambah membuka daftar task pool, memilih satu memancarkan add lalu menutup daftar', async () => {
    const pool = [makeTask('p1'), makeTask('p2')]
    const wrapper = await mountQuadrant('do', [], pool)

    const add = wrapper.get('.add')
    expect(add.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.picker').exists()).toBe(false)

    await add.trigger('click')
    expect(wrapper.get('.add').attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('.pick')).toHaveLength(2)

    await wrapper.get('.pick').trigger('click')

    expect(wrapper.emitted('add')).toEqual([['p1']])
    expect(wrapper.get('.add').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.picker').exists()).toBe(false)
  })

  it('pool kosong menjelaskan bahwa semua task aktif sudah masuk matrix', async () => {
    const wrapper = await mountQuadrant('do')

    await wrapper.get('.add').trigger('click')

    expect(wrapper.get('.pick-empty').text()).toBe('Semua task aktif sudah masuk matrix.')
  })
})

describe('EisenhowerQuadrant - meneruskan aksi kartu', () => {
  it('toggle, remove, dan focus dari kartu naik ke halaman lewat event kuadran', async () => {
    const wrapper = await mountQuadrant('do', [makeTask('t1')])
    const card = wrapper.get('.card')

    await card.get('[role="checkbox"]').trigger('click')
    await wrapper.get('.remove').trigger('click')
    await wrapper.get('.focus').trigger('click')

    expect(wrapper.emitted('toggle')).toEqual([['t1']])
    expect(wrapper.emitted('remove')).toEqual([['t1']])
    expect(wrapper.emitted('focus')).toEqual([['task t1']])
  })
})
