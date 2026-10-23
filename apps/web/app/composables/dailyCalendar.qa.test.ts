import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { resetSchedulesHydrationForTest, useSchedules } from '~/composables/useSchedules'
import { resetTasksHydrationForTest, useTasks } from '~/composables/useTasks'
import { useTimeGrid, type GridEvent } from '~/composables/useTimeGrid'
import type { Task } from '~/utils/tasks'
import { newScheduleDraft } from '~/utils/schedule'
import { MS_PER_HOUR, addDays, fromIsoDate } from '~/utils/time'

/**
 * QA T14 (Ergonio #28) - AC4: kalender "Jadwal hari ini" di Daily memuat jadwal hari ini
 * (recurring sudah di-expand) dan task yang tertaut/ber-deadline hari ini.
 *
 * Yang diuji adalah layout yang dipakai `DailySchedule.vue` (`useTimeGrid` dengan satu hari,
 * `isBare`), bukan komponen grid itu sendiri.
 */
const TODAY = '2026-10-19'
const START = fromIsoDate(TODAY).getTime()
const NOW = START + 8 * MS_PER_HOUR

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    priority: 'medium',
    deadline: null,
    done: false,
    scheduleId: null,
    quadrant: null,
    position: 0,
    ...patch,
  }
}

async function mountGrid(day: string) {
  let grid: ReturnType<typeof useTimeGrid> | undefined
  const Host = defineComponent({
    setup() {
      grid = useTimeGrid({ days: () => [day], isCompact: () => false, now: () => NOW })
      return () => h('div')
    },
  })
  const wrapper = await mountSuspended(Host)
  await flushPromises()
  if (!grid) throw new Error('grid tidak terpasang')
  return { grid, wrapper }
}

beforeEach(() => {
  clearNuxtState([
    'tasks',
    'tasksStatus',
    'tasksError',
    'schedules',
    'schedule-attendance',
    'schedulesStatus',
    'schedulesError',
    'now',
  ])
  resetSchedulesHydrationForTest()
  resetTasksHydrationForTest()
  useState<number>('now').value = NOW
})

describe('Jadwal hari ini di Daily (AC4)', () => {
  it('recurring yang mulai kemarin tampil hari ini (sudah di-expand), jadwal besok tidak ikut', async () => {
    const { save } = useSchedules()
    // `dailyN` = interval hari (setiap N hari), bukan jumlah kejadian: 1 = tiap hari.
    const recurring = { ...newScheduleDraft(addDays(TODAY, -1), '10:00'), title: 'Kelas AWS' }
    recurring.rec = 'daily'
    save(recurring, null)

    const besok = { ...newScheduleDraft(addDays(TODAY, 1), '10:00'), title: 'Besok saja' }
    save(besok, null)

    const { grid, wrapper } = await mountGrid(TODAY)
    const titles = grid.layout.value.columns[0]?.items.map((item) =>
      item.kind === 'event' ? item.occurrence.schedule.title : item.task.title,
    )

    expect(titles).toContain('Kelas AWS')
    expect(titles).not.toContain('Besok saja')

    wrapper.unmount()
  })

  it('task ber-deadline hari ini tampil sebagai penanda, task besok tidak', async () => {
    useState<Task[]>('tasks').value = [
      task('deadline-hari-ini', { title: 'Kirim laporan', deadline: START + 14 * MS_PER_HOUR }),
      task('deadline-besok', {
        title: 'Besok',
        deadline: fromIsoDate(addDays(TODAY, 1)).getTime() + 9 * MS_PER_HOUR,
      }),
    ]

    const { grid, wrapper } = await mountGrid(TODAY)
    const marker = grid.layout.value.columns[0]?.items.find(
      (item) => item.kind === 'task' && item.task.title === 'Kirim laporan',
    )

    expect(marker).toBeDefined()
    expect(marker?.kind === 'task' && marker.start).toBe(14 * 60)
    expect(
      grid.layout.value.columns[0]?.items.some(
        (item) => item.kind === 'task' && item.task.title === 'Besok',
      ),
    ).toBe(false)

    wrapper.unmount()
  })

  it('task yang tertaut ke jadwal hari ini tampil bersama jadwalnya', async () => {
    const { save } = useSchedules()
    const draft = { ...newScheduleDraft(TODAY, '09:00'), title: 'Deep work', dur: 180 }
    const result = save(draft, null)
    if (!('id' in result)) throw new Error('jadwal uji gagal dibuat')

    useState<Task[]>('tasks').value = [
      task('tertaut', { title: 'Review desain', scheduleId: result.id, deadline: null }),
    ]

    const { grid, wrapper } = await mountGrid(TODAY)
    const event = grid.layout.value.columns[0]?.items.find(
      (item): item is GridEvent =>
        item.kind === 'event' && item.occurrence.schedule.title === 'Deep work',
    )

    expect(event?.linked.map((item) => item.title)).toEqual(['Review desain'])

    wrapper.unmount()
  })

  it('edit deadline dari widget Daily langsung menggeser penanda di kalender hari ini (F6)', async () => {
    useState<Task[]>('tasks').value = [
      task('edit-1', { title: 'Kirim laporan', deadline: START + 14 * MS_PER_HOUR }),
    ]
    const { grid, wrapper } = await mountGrid(TODAY)
    const hasMarker = () =>
      grid.layout.value.columns[0]?.items.some(
        (item) => item.kind === 'task' && item.task.id === 'edit-1',
      )
    expect(hasMarker()).toBe(true)

    // Aksi yang sama dengan form edit di widget Daily.
    const { save } = useTasks()
    save(
      {
        title: 'Kirim laporan',
        priority: 'medium',
        hasDeadline: true,
        date: addDays(TODAY, 1),
        time: '14:00',
        scheduleId: null,
      },
      'edit-1',
    )

    expect(hasMarker()).toBe(false)

    wrapper.unmount()
  })
})
