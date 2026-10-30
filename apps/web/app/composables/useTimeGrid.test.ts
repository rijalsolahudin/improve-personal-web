import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { BASE_SLOT_PX, SLOT_MINUTES } from '~/utils/calendarGrid'
import { newScheduleDraft, toMinutes } from '~/utils/schedule'
import { MS_PER_HOUR, fromIsoDate, toIsoDate } from '~/utils/time'

import { resetSchedulesHydrationForTest } from './useSchedules'
import { useTimeGrid, type GridEvent } from './useTimeGrid'

interface Created {
  day: string
  time: string
  dur: number
}

async function mountGrid(day: string, now = Date.now()) {
  let grid: ReturnType<typeof useTimeGrid> | undefined
  const created: Created[] = []
  const Host = defineComponent({
    setup() {
      grid = useTimeGrid({
        days: () => [day],
        isCompact: () => false,
        now: () => now,
        onCreate: (dayOfCreate, time, dur) => created.push({ day: dayOfCreate, time, dur }),
      })
      return () => h('div')
    },
  })
  const wrapper = await mountSuspended(Host)
  if (!grid) throw new Error('grid tidak terpasang')
  return { grid, wrapper, created }
}

function pointer(type: string, clientY: number): PointerEvent {
  return new PointerEvent(type, { clientY, bubbles: true, cancelable: true, button: 0 })
}

/** Hari uji tetap supaya jam "sekarang" tidak bergantung pada jam mesin. */
const DAY = '2026-10-19'
const AT = (hour: number, minute = 0): number => hour * 60 + minute

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

  it('klik slot tanpa geser membuat jadwal 60 menit', async () => {
    const { grid, wrapper, created } = await mountGrid(DAY)

    grid.startCreate(DAY, AT(9), pointer('pointerdown', 100))
    window.dispatchEvent(pointer('pointerup', 100))

    expect(created).toEqual([{ day: DAY, time: '09:00', dur: 60 }])
    // Guard klik: `click` slot yang menyusul pointerup tidak boleh membuat jadwal kedua.
    expect(grid.isJustDragged()).toBe(true)
    wrapper.unmount()
  })

  it('seret 3 slot membuat jadwal mulai di slot pertama dengan durasi 45 menit', async () => {
    const { grid, wrapper, created } = await mountGrid(DAY)

    grid.startCreate(DAY, AT(9), pointer('pointerdown', 100))
    grid.extendCreate(DAY, AT(9, 30))
    window.dispatchEvent(pointer('pointerup', 100))

    expect(created).toEqual([{ day: DAY, time: '09:00', dur: 45 }])
    wrapper.unmount()
  })

  it('pratinjau putus-putus muncul selama seret dan hilang setelah pointerup', async () => {
    const { grid, wrapper, created } = await mountGrid(DAY)
    const column = () => grid.layout.value.columns[0]

    expect(column()?.create).toBeNull()

    grid.startCreate(DAY, AT(9), pointer('pointerdown', 100))
    grid.extendCreate(DAY, AT(9, 30))
    expect(column()?.create?.label).toBe('09:00–09:45')
    expect(column()?.create?.height).toBeGreaterThan(0)

    window.dispatchEvent(pointer('pointerup', 100))
    expect(column()?.create).toBeNull()
    expect(created).toHaveLength(1)
    wrapper.unmount()
  })

  it('pointercancel membatalkan jadwal: tidak ada pratinjau & tidak ada jadwal baru', async () => {
    const { grid, wrapper, created } = await mountGrid(DAY)

    grid.startCreate(DAY, AT(9), pointer('pointerdown', 100))
    window.dispatchEvent(pointer('pointercancel', 100))

    expect(grid.layout.value.columns[0]?.create).toBeNull()
    expect(created).toEqual([])
    wrapper.unmount()
  })

  it('seret melewati 24:00 dipotong di akhir grid', async () => {
    const { grid, wrapper, created } = await mountGrid(DAY)

    grid.startCreate(DAY, AT(23, 30), pointer('pointerdown', 100))
    grid.extendCreate(DAY, AT(23, 45))
    expect(grid.layout.value.columns[0]?.create?.label).toBe('23:30–24:00')
    window.dispatchEvent(pointer('pointerup', 100))

    expect(created).toEqual([{ day: DAY, time: '23:30', dur: 30 }])
    wrapper.unmount()
  })

  it('penanda "sekarang" ada juga sebelum jam 05:00', async () => {
    const now = fromIsoDate(DAY).getTime() + MS_PER_HOUR
    const { grid, wrapper } = await mountGrid(DAY, now)
    const column = grid.layout.value.columns[0]
    const top = (60 / SLOT_MINUTES) * BASE_SLOT_PX

    expect(column?.nowTop).toBe(top)
    // 01:00 masih di atas 140px pertama grid, jadi tidak ada yang perlu digulir.
    expect(grid.scrollTop.value).toBe(0)
    wrapper.unmount()
  })
})
