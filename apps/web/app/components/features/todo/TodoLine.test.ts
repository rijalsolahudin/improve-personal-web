import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import type { Task } from '~/utils/tasks'

import TodoLine from './TodoLine.vue'

/**
 * Design v2 kartu To-do Daily: judul di baris pertama, badge prioritas + jam di baris kedua,
 * tombol Fokus/Edit tetap di kanan. Varian `isDense` (kartu jadwal Kalender) tidak boleh berubah
 * karena tingginya dipakai `LINKED_ROW_PX`.
 */
function task(patch: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Kirim laporan',
    priority: 'urgent',
    deadline: null,
    done: false,
    scheduleId: null,
    quadrant: null,
    position: 0,
    ...patch,
  }
}

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

describe('TodoLine - varian Daily', () => {
  it('judul di baris pertama, badge prioritas + jam di baris kedua', async () => {
    const wrapper = await mountSuspended(TodoLine, {
      props: { task: task(), meta: '14:00', isDaily: true, canEdit: true },
    })
    mounted.push(wrapper)

    const text = wrapper.get('.text')
    expect(text.get('.title').text()).toBe('Kirim laporan')

    const secondRow = text.get('.meta-row')
    expect(secondRow.text()).toContain('Urgent')
    expect(secondRow.get('.meta').text()).toBe('14:00')

    // Tombol aksi tidak ikut masuk baris kedua (tetap sejajar di kanan).
    expect(secondRow.find('button').exists()).toBe(false)
    expect(wrapper.findAll('.focus')).toHaveLength(1)
    expect(wrapper.findAll('.edit')).toHaveLength(1)
  })

  it('tanpa jam: baris kedua tetap ada untuk badge prioritas', async () => {
    const wrapper = await mountSuspended(TodoLine, {
      props: { task: task({ priority: 'medium' }), isDaily: true },
    })
    mounted.push(wrapper)

    const secondRow = wrapper.get('.meta-row')
    expect(secondRow.text()).toContain('Medium')
    expect(secondRow.find('.meta').exists()).toBe(false)
  })
})

describe('TodoLine - varian dense tetap satu baris', () => {
  it('badge & jam tetap sejajar judul, bukan pindah ke baris kedua', async () => {
    const wrapper = await mountSuspended(TodoLine, {
      props: { task: task({ priority: 'medium' }), meta: '09:00', isDense: true },
    })
    mounted.push(wrapper)

    expect(wrapper.find('.text').exists()).toBe(false)
    expect(wrapper.findAll('.line > .meta')).toHaveLength(1)
    expect(wrapper.get('.line').text()).toContain('Kirim laporan')
  })
})
