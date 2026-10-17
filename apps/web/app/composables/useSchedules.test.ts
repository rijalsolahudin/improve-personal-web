import { beforeEach, describe, expect, it } from 'vitest'

import { newScheduleDraft } from '~/utils/schedule'
import { toIsoDate } from '~/utils/time'

import { useSchedules } from './useSchedules'

describe('useSchedules', () => {
  beforeEach(() => {
    clearNuxtState(['schedules', 'schedule-attendance'])
  })

  it('draft tidak valid ditolak; jadwal baru ditambahkan', () => {
    const { schedules, save } = useSchedules()
    const count = schedules.value.length
    const draft = newScheduleDraft(toIsoDate(new Date()))
    expect(save(draft, null)).toEqual({ error: 'titleRequired' })
    expect(save({ ...draft, title: 'Rapat' }, null)).toEqual({ ok: true })
    expect(schedules.value).toHaveLength(count + 1)
  })

  it('hapus semua kejadian & tandai hadir', () => {
    const { schedules, remove, toggleAttendance, attendance } = useSchedules()
    const first = schedules.value[0]
    if (!first) throw new Error('mock kosong')
    remove(first.id, first.start, 'all')
    expect(schedules.value.some((item) => item.id === first.id)).toBe(false)

    toggleAttendance('x@2026-10-10')
    expect(attendance.value['x@2026-10-10']).toBe(true)
    toggleAttendance('x@2026-10-10')
    expect(attendance.value['x@2026-10-10']).toBe(false)
  })

  it('retime mengubah jam & durasi seri; durasi dijepit minimal 15 menit', () => {
    const { schedules, retime } = useSchedules()
    const timed = schedules.value.find((item) => !item.allDay)
    if (!timed) throw new Error('mock tanpa jadwal berjam')

    retime(timed.id, 9 * 60 + 30, 45)
    expect(schedules.value.find((item) => item.id === timed.id)).toMatchObject({
      time: '09:30',
      dur: 45,
    })

    retime(timed.id, 9 * 60 + 30, 5)
    expect(schedules.value.find((item) => item.id === timed.id)?.dur).toBe(15)
  })
})
