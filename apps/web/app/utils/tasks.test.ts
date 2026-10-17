import { describe, expect, it } from 'vitest'

import {
  applyTaskDraft,
  clearDoneFromMatrix,
  countByFilter,
  deadlineFrom,
  draftFromTask,
  emptyTaskDraft,
  matchesFilter,
  quickTask,
  sortTasks,
  tasksInQuadrant,
  unsortedTasks,
  validateTaskDraft,
  type Task,
} from './tasks'

const NOW = new Date(2026, 9, 10, 12, 0).getTime()
const HOUR = 3_600_000
const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  title: id,
  priority: 'medium',
  deadline: NOW + HOUR,
  done: false,
  scheduleId: null,
  quadrant: null,
  ...overrides,
})

describe('filter', () => {
  const list = [
    task('today', { deadline: NOW + 2 * HOUR }),
    task('late', { deadline: NOW - HOUR }),
    task('later', { deadline: NOW + 30 * HOUR }),
    task('none', { deadline: null }),
    task('done', { done: true }),
  ]
  const ids = (filter: Parameters<typeof matchesFilter>[1]) =>
    list.filter((item) => matchesFilter(item, filter, NOW)).map((item) => item.id)

  it('tiap filter sesuai design', () => {
    expect(ids('semua')).toEqual(['today', 'late', 'later', 'none'])
    expect(ids('hari')).toEqual(['today', 'late'])
    expect(ids('mendatang')).toEqual(['today', 'later'])
    expect(ids('terlambat')).toEqual(['late'])
    expect(ids('selesai')).toEqual(['done'])
  })

  it('hitungan per filter', () => {
    expect(countByFilter(list, NOW)).toEqual({
      semua: 4,
      hari: 2,
      mendatang: 2,
      terlambat: 1,
      selesai: 1,
    })
  })
})

describe('urutan', () => {
  const list = [
    task('none', { deadline: null, priority: 'urgent' }),
    task('low-soon', { priority: 'low', deadline: NOW }),
    task('urgent-later', { priority: 'urgent', deadline: NOW + 5 * HOUR }),
  ]

  it('deadline terdekat dulu, tanpa deadline paling bawah', () => {
    expect(sortTasks(list, 'deadline').map((item) => item.id)).toEqual([
      'low-soon',
      'urgent-later',
      'none',
    ])
  })

  it('prioritas, lalu deadline', () => {
    expect(sortTasks(list, 'prioritas').map((item) => item.id)).toEqual([
      'urgent-later',
      'none',
      'low-soon',
    ])
  })
})

describe('form task', () => {
  it('validasi', () => {
    const draft = { ...emptyTaskDraft('2026-10-10'), title: 'Laporan' }
    expect(validateTaskDraft(draft)).toBeNull()
    expect(validateTaskDraft({ ...draft, title: '  ' })).toBe('titleRequired')
    expect(validateTaskDraft({ ...draft, title: 'x'.repeat(201) })).toBe('titleTooLong')
    expect(validateTaskDraft({ ...draft, time: '99:00' })).toBe('deadline')
    expect(validateTaskDraft({ ...draft, hasDeadline: false, time: '' })).toBeNull()
  })

  it('draft ↔ task bolak-balik; selesai & kuadran dipertahankan', () => {
    const original = task('a', {
      deadline: deadlineFrom('2026-10-12', '08:30'),
      done: true,
      quadrant: 'do',
      scheduleId: 'aws',
    })
    const draft = draftFromTask(original, '2026-10-10')
    expect(draft).toMatchObject({ date: '2026-10-12', time: '08:30', scheduleId: 'aws' })
    const saved = applyTaskDraft({ ...draft, title: '  Baru  ', hasDeadline: false }, original, 'x')
    expect(saved).toMatchObject({
      id: 'a',
      title: 'Baru',
      deadline: null,
      done: true,
      quadrant: 'do',
    })
  })

  it('tambah cepat menolak judul kosong & memotong judul panjang', () => {
    expect(quickTask('   ', 'low', null, 'q')).toBeNull()
    expect(quickTask('x'.repeat(300), 'low', null, 'q')?.title).toHaveLength(200)
  })
})

describe('eisenhower', () => {
  const list = [
    task('done-do', { quadrant: 'do', done: true }),
    task('do', { quadrant: 'do' }),
    task('free'),
    task('free-done', { done: true }),
    task('plan', { quadrant: 'plan' }),
  ]

  it('isi kuadran, selesai di bawah', () => {
    expect(tasksInQuadrant(list, 'do').map((item) => item.id)).toEqual(['do', 'done-do'])
  })

  it('pool = aktif tanpa kuadran', () => {
    expect(unsortedTasks(list).map((item) => item.id)).toEqual(['free'])
  })

  it('bersihkan yang selesai cuma melepas kuadran', () => {
    const cleared = clearDoneFromMatrix(list)
    expect(cleared).toHaveLength(list.length)
    expect(cleared.find((item) => item.id === 'done-do')?.quadrant).toBeNull()
    expect(cleared.find((item) => item.id === 'do')?.quadrant).toBe('do')
  })
})
