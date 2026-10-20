import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { newScheduleDraft, toMinutes } from '~/utils/schedule'
import { toIsoDate } from '~/utils/time'

import { resetSchedulesHydrationForTest } from './useSchedules'
import { useTimeGrid, type GridEvent } from './useTimeGrid'

async function mountGrid(day: string) {
  let grid: ReturnType<typeof useTimeGrid> | undefined
  const Host = defineComponent({
    setup() {
      grid = useTimeGrid({ days: () => [day], isCompact: () => false, now: () => Date.now() })
      return () => h('div')
    },
  })
  const wrapper = await mountSuspended(Host)
  if (!grid) throw new Error('grid tidak terpasang')
  return { grid, wrapper }
}

function pointer(type: string, clientY: number): PointerEvent {
  return new PointerEvent(type, { clientY, bubbles: true, cancelable: true })
}

describe('useTimeGrid', () => {
  beforeEach(() => {
    clearNuxtState([
      'schedules',
      'schedule-attendance',
      'schedulesStatus',
      'schedulesError',
      'tasks',
    ])
    resetSchedulesHydrationForTest()
  })

  it('jadwal hari ini jadi item event; tarik tepi bawah menyimpan durasi baru', async () => {
    const today = toIsoDate(new Date())
    const { schedules, save } = useSchedules()
    save({ ...newScheduleDraft(today, '10:00'), title: 'Uji tarik' }, null)
    const { grid, wrapper } = await mountGrid(today)
    const event = grid.layout.value.columns[0]?.items.find(
      (item): item is GridEvent =>
        item.kind === 'event' && item.occurrence.schedule.title === 'Uji tarik',
    )
    if (!event) throw new Error('jadwal uji tidak tampil')
    const before = schedules.value.find((item) => item.id === event.occurrence.schedule.id)
    if (!before) throw new Error('jadwal hilang')

    // Tepi bawah ditarik 2 slot ke bawah = +30 menit.
    grid.startResize(event, 'bottom', pointer('pointerdown', 100))
    const slotPx =
      grid.layout.value.scale.yAt(toMinutes(before.time) + before.dur) -
      grid.layout.value.scale.yAt(toMinutes(before.time) + before.dur - 15)
    window.dispatchEvent(pointer('pointermove', 100 + slotPx * 2))
    window.dispatchEvent(pointer('pointerup', 100 + slotPx * 2))

    expect(schedules.value.find((item) => item.id === before.id)?.dur).toBe(before.dur + 30)
    expect(grid.isJustDragged()).toBe(true)
    wrapper.unmount()
  })
})
