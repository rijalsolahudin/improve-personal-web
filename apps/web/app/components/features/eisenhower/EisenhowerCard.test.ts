import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import type { Task } from '~/utils/tasks'

import EisenhowerCard from './EisenhowerCard.vue'

/** Rabu, 10 September 2025, 10:00 waktu perangkat. */
const NOW = new Date(2025, 8, 10, 10, 0, 0).getTime()

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Kirim laporan',
    priority: 'urgent',
    deadline: NOW + 60 * 60 * 1000,
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

async function mountCard(task: Task) {
  const wrapper = await mountSuspended(EisenhowerCard, { props: { task, now: NOW } })
  mounted.push(wrapper)
  return wrapper
}

describe('EisenhowerCard - aksi per kartu', () => {
  it('centang memancarkan toggle tanpa ikut memulai drag', async () => {
    const wrapper = await mountCard(makeTask())

    await wrapper.get('[role="checkbox"]').trigger('click')

    expect(wrapper.emitted('toggle')).toHaveLength(1)
    expect(wrapper.emitted('remove')).toBeUndefined()
  })

  it('tombol "×" memancarkan remove dan labelnya menyebut judul task', async () => {
    const wrapper = await mountCard(makeTask())

    const remove = wrapper.get('.remove')
    expect(remove.attributes('aria-label')).toContain('Kirim laporan')
    await remove.trigger('click')

    expect(wrapper.emitted('remove')).toHaveLength(1)
  })

  it('pill "▶ Fokus" memancarkan focus dengan judul task (design kartu Eisenhower)', async () => {
    const wrapper = await mountCard(makeTask())

    const focus = wrapper.get('.focus')
    expect(focus.text()).toContain('Fokus')
    await focus.trigger('click')

    expect(wrapper.emitted('focus')).toEqual([['Kirim laporan']])
  })

  it('task selesai: tercoret, checkbox checked, label "Selesai", tanpa pill Fokus', async () => {
    const wrapper = await mountCard(makeTask({ done: true }))

    expect(wrapper.get('[role="checkbox"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.get('.left').text()).toBe('Selesai')
    expect(wrapper.find('.focus').exists()).toBe(false)
  })

  it('task belum selesai menampilkan sisa waktu deadline, bukan "Selesai"', async () => {
    const wrapper = await mountCard(makeTask())

    expect(wrapper.get('.left').text()).toBe('1 jam lagi')
    expect(wrapper.get('.left').classes()).not.toContain('overdue')
  })

  it('deadline lewat ditandai overdue supaya warnanya beda dari sisa waktu biasa', async () => {
    const wrapper = await mountCard(makeTask({ deadline: NOW - 60 * 60 * 1000 }))

    expect(wrapper.get('.left').classes()).toContain('overdue')
  })
})
