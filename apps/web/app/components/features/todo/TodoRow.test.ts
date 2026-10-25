import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import type { Schedule } from '~/utils/schedule'
import type { Task } from '~/utils/tasks'

import TodoRow from './TodoRow.vue'

/**
 * Baris To-do halaman F2 (design Desktop.dc.html `isTodo`): satu baris membawa centang, judul +
 * chip, aksi "▶ Fokus"/edit, lalu sisa deadline. Tiga aksi harus tetap terpisah supaya klik
 * "▶ Fokus" tidak ikut membuka form edit.
 */

/** Rabu, 10 September 2025, 10:00. */
const NOW = new Date(2025, 8, 10, 10, 0, 0).getTime()

const KELAS: Schedule = {
  id: 'sched-kelas',
  title: 'Kelas AWS',
  color: 0,
  start: '2025-09-01',
  time: '09:00',
  dur: 90,
  allDay: false,
  rec: { type: 'weekly', days: [1, 4], interval: 1 },
  ends: { type: 'never' },
  exceptions: [],
  goalId: null,
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Kirim laporan',
    priority: 'urgent',
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

async function mountRow(item: Task, schedules: Schedule[] = []): Promise<VueWrapper> {
  useState<Schedule[]>('schedules').value = schedules
  const wrapper = await mountSuspended(TodoRow, { props: { task: item, now: NOW } })
  mounted.push(wrapper)
  return wrapper
}

const byLabel = (wrapper: VueWrapper, label: string) =>
  wrapper.findAll('button').find((button) => button.attributes('aria-label') === label)

describe('TodoRow - isi baris', () => {
  it('menampilkan judul, chip prioritas, jadwal, dan kuadran', async () => {
    const wrapper = await mountRow(
      task({
        scheduleId: KELAS.id,
        quadrant: 'do',
        deadline: new Date(2025, 8, 10, 14, 0).getTime(),
      }),
      [KELAS],
    )

    expect(wrapper.get('.title').text()).toBe('Kirim laporan')
    expect(wrapper.get('.chips').text()).toContain('Urgent')
    expect(wrapper.get('.chips').text()).toContain('Kelas AWS')
    expect(wrapper.get('.chips').text()).toContain('Kerjakan')
    // Sisa waktu + tanggal deadline di kolom kanan.
    expect(wrapper.get('.left').text()).toBe('4 jam lagi')
    expect(wrapper.get('.deadline').text()).toBe('10 Sep, 14:00')
  })

  it('task tanpa deadline menampilkan "Tanpa deadline" tanpa label tanggal', async () => {
    const wrapper = await mountRow(task())

    expect(wrapper.get('.left').text()).toBe('Tanpa deadline')
    expect(wrapper.get('.deadline').text()).toBe('')
  })

  it('deadline lewat: label terlambat ditandai merah (kelas overdue)', async () => {
    const wrapper = await mountRow(task({ deadline: new Date(2025, 8, 10, 8, 0).getTime() }))

    expect(wrapper.get('.left').text()).toBe('Terlambat 2 jam')
    expect(wrapper.get('.left').classes()).toContain('overdue')
  })
})

describe('TodoRow - aksi per baris', () => {
  it('klik "▶ Fokus" hanya mengirim focus, tidak membuka form edit', async () => {
    const wrapper = await mountRow(task())

    const focus = byLabel(wrapper, 'Fokus pakai Pomodoro: Kirim laporan')
    expect(focus?.text()).toBe('▶ Fokus')
    await focus?.trigger('click')

    expect(wrapper.emitted('focus')).toEqual([['Kirim laporan']])
    expect(wrapper.emitted('edit')).toBeUndefined()
  })

  it('judul dan tombol pensil sama-sama membuka form edit', async () => {
    const wrapper = await mountRow(task())

    await wrapper.get('.main').trigger('click')
    expect(wrapper.emitted('edit')).toHaveLength(1)

    // Tombol pensil juga tersedia (muncul saat hover / selalu di layar sentuh).
    const edit = byLabel(wrapper, 'Edit task: Kirim laporan')
    await edit?.trigger('click')
    expect(wrapper.emitted('edit')).toHaveLength(2)
    expect(wrapper.emitted('focus')).toBeUndefined()
  })

  it('centang mengirim toggle tanpa memicu edit', async () => {
    const wrapper = await mountRow(task())

    await wrapper.get('[role="checkbox"]').trigger('click')

    expect(wrapper.emitted('toggle')).toEqual([[]])
    expect(wrapper.emitted('edit')).toBeUndefined()
  })
})
