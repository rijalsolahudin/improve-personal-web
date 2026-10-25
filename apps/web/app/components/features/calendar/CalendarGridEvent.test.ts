import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import CalendarGridEvent from '~/components/features/calendar/CalendarGridEvent.vue'
import type { GridEvent } from '~/composables/useTimeGrid'
import type { Schedule } from '~/utils/schedule'

/**
 * Regresi QA #98: pill "▶ Fokus" di kartu jadwal pendek (< 24 menit) harus 14px dan di tengah
 * kartu - dulu kalah oleh rule `.event .focus` (18px) sehingga terpotong `overflow: hidden`.
 * Yang diuji: style yang benar-benar dirender, bukan isi file CSS.
 */
const JADWAL: Schedule = {
  id: 'sched-1',
  title: 'Kelas AWS',
  color: 0,
  start: '2025-09-01',
  time: '09:00',
  dur: 15,
  allDay: false,
  rec: { type: 'once' },
  ends: { type: 'never' },
  exceptions: [],
  goalId: null,
}

function event(size: GridEvent['size'], height: number): GridEvent {
  return {
    key: 'sched-1@2025-09-10',
    kind: 'event',
    top: 0,
    height,
    left: 0,
    width: 100,
    start: 540,
    dur: 15,
    solid: '#9B4FC9',
    tint: '#EEE6FA',
    size,
    isDone: false,
    isDragging: false,
    linked: [],
    moreCount: 0,
    occurrence: {
      key: 'sched-1@2025-09-10',
      day: '2025-09-10',
      start: 540,
      end: 555,
      at: new Date(2025, 8, 10, 9, 0).getTime(),
      schedule: JADWAL,
    },
  }
}

describe('CalendarGridEvent - pill Fokus', () => {
  it('kartu pendek memakai pill 14px di tengah, bukan 18px', async () => {
    const wrapper = await mountSuspended(CalendarGridEvent, {
      props: { item: event('tiny', 20), canFocus: true },
    })
    const pill = wrapper.find('.focus')

    expect(pill.exists()).toBe(true)
    expect(pill.attributes('style')).toContain('min-height: 14px')
    expect(pill.attributes('style')).toContain('top: calc(50% - 7px)')
  })

  it('kartu normal tetap 18px dan menempel di atas', async () => {
    const wrapper = await mountSuspended(CalendarGridEvent, {
      props: { item: event('big', 90), canFocus: true },
    })

    expect(wrapper.find('.focus').attributes('style')).toContain('min-height: 18px')
  })

  it('klik pill meneruskan judul jadwal, tanpa membuka form edit', async () => {
    const wrapper = await mountSuspended(CalendarGridEvent, {
      props: { item: event('big', 90), canFocus: true },
    })

    await wrapper.find('.focus').trigger('click')

    expect(wrapper.emitted('focus')).toEqual([['Kelas AWS']])
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('tanpa izin fokus, pill tidak dirender', async () => {
    const wrapper = await mountSuspended(CalendarGridEvent, {
      props: { item: event('big', 90) },
    })

    expect(wrapper.find('.focus').exists()).toBe(false)
  })
})
