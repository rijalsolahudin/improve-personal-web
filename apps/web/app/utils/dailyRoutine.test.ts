import { describe, expect, it } from 'vitest'

import {
  DAILY_STORE_MAX_DAYS,
  EMPTY_DAILY_DAY,
  blockOf,
  dailyPriorities,
  parseDailyDays,
  splitMinutes,
  sumProgress,
  todayTasks,
  withDailyDay,
} from './dailyRoutine'
import type { Task } from './tasks'

const NOW = new Date(2026, 9, 16, 14, 0).getTime()
const TODAY = '2026-10-16'
const at = (day: number, hour: number): number => new Date(2026, 9, day, hour, 0).getTime()

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

describe('blockOf', () => {
  it('pagi < 12, siang < 18, sisanya malam; dini hari ikut pagi', () => {
    expect(blockOf(2)).toBe('pagi')
    expect(blockOf(11)).toBe('pagi')
    expect(blockOf(12)).toBe('siang')
    expect(blockOf(17)).toBe('siang')
    expect(blockOf(18)).toBe('malam')
    expect(blockOf(23)).toBe('malam')
  })
})

describe('dailyPriorities', () => {
  const tasks = [
    task('urgent-late', { priority: 'urgent', deadline: at(18, 9) }),
    task('do-no-deadline', { quadrant: 'do', priority: 'low' }),
    task('urgent-no-deadline', { priority: 'urgent' }),
    task('do-soon', { quadrant: 'do', deadline: at(16, 9) }),
    task('urgent-in-do', { quadrant: 'do', priority: 'urgent', deadline: at(17, 9) }),
    task('medium', { priority: 'medium', deadline: at(16, 8) }),
    task('urgent-plan', { quadrant: 'plan', priority: 'urgent', deadline: at(16, 10) }),
    task('done-old', { priority: 'urgent', done: true }),
    task('done-today', { quadrant: 'do', done: true, deadline: at(20, 9) }),
  ]

  it('kuadran Penting & Mendesak dulu lalu urgent, tiap grup urut deadline, tanpa duplikat', () => {
    const list = dailyPriorities(tasks, [])
    expect(list.map(({ task: item, origin }) => [item.id, origin])).toEqual([
      ['do-soon', 'quadrant'],
      ['urgent-in-do', 'quadrant'],
      ['do-no-deadline', 'quadrant'],
      ['urgent-plan', 'urgent'],
      ['urgent-late', 'urgent'],
      ['urgent-no-deadline', 'urgent'],
    ])
  })

  it('tidak dibatasi 3; task selesai hanya ikut kalau dicentang hari ini', () => {
    const many = Array.from({ length: 9 }, (_, i) => task(`u${i}`, { priority: 'urgent' }))
    expect(dailyPriorities(many, [])).toHaveLength(9)

    const ids = dailyPriorities(tasks, ['done-today']).map(({ task: item }) => item.id)
    expect(ids).toContain('done-today')
    expect(ids).not.toContain('done-old')
  })
})

describe('todayTasks', () => {
  const tasks = [
    task('late-yesterday', { deadline: at(15, 10) }),
    task('late-today', { deadline: at(16, 9) }),
    task('later-today', { deadline: at(16, 20) }),
    task('done-today', { deadline: at(16, 8), done: true }),
    task('done-yesterday', { deadline: at(15, 8), done: true }),
    task('tomorrow', { deadline: at(17, 9) }),
    task('pinned', { deadline: at(16, 21) }),
    task('no-deadline'),
  ]

  it('satu daftar urutan asli: terlambat, hari ini, selesai hari ini; tanpa pinned & besok', () => {
    const list = todayTasks(tasks, ['pinned'], [], TODAY, NOW)
    expect(list.map(({ task: item, isOverdue }) => [item.id, isOverdue])).toEqual([
      ['late-yesterday', true],
      ['late-today', true],
      ['later-today', false],
      ['done-today', false],
    ])
  })

  it('task tambahan hari ini ikut walau tanpa deadline, tidak dianggap terlambat', () => {
    const list = todayTasks(tasks, ['pinned'], ['no-deadline'], TODAY, NOW)
    expect(list.at(-1)).toEqual({
      task: expect.objectContaining({ id: 'no-deadline' }),
      isOverdue: false,
    })
  })

  it('tidak memotong daftar: 12 task hari ini semuanya kembali (B2)', () => {
    const banyak = Array.from({ length: 12 }, (_, index) =>
      task(`due-${index}`, { deadline: at(16, index + 8) }),
    )

    // Batas tampilan di widget bukan batas data: progres harus menghitung seluruh to-do hari ini.
    expect(todayTasks(banyak, [], [], TODAY, NOW)).toHaveLength(12)
  })
})

describe('state harian tersimpan (B3)', () => {
  it('baca storage tak tepercaya: field divalidasi, tanggal/field asing dibuang', () => {
    const parsed = parseDailyDays({
      '2026-10-19': {
        doneSteps: ['langkah-1'],
        checkedTaskIds: ['task-1', 42, ''],
        weather: 'hujan',
      },
      '2026-10-18': { weather: 'badai' },
      'bukan-tanggal': { checkedTaskIds: ['task-x'] },
      '2026-10-17': null,
      '2026-10-16': ['array'],
    })

    expect(parsed['2026-10-19']).toEqual({
      doneSteps: ['langkah-1'],
      checkedTaskIds: ['task-1'],
      weather: 'hujan',
      addedTaskIds: [],
    })
    expect(parsed['2026-10-18']?.weather).toBeNull()
    expect(parsed['bukan-tanggal']).toBeUndefined()
    expect(parsed['2026-10-17']).toBeUndefined()
    expect(parsed['2026-10-16']).toBeUndefined()
    expect(parseDailyDays('{rusak')).toEqual({})
    expect(parseDailyDays(null)).toEqual({})
  })

  it('menulis satu hari lalu menyimpan hanya tanggal terbaru dalam batas', () => {
    const days = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => {
        const date = `2026-10-${String(index + 1).padStart(2, '0')}`
        return [date, EMPTY_DAILY_DAY]
      }),
    )

    const pruned = withDailyDay(days, '2026-10-21', { ...EMPTY_DAILY_DAY, weather: 'cerah' })

    expect(Object.keys(pruned)).toHaveLength(DAILY_STORE_MAX_DAYS)
    expect(pruned['2026-10-21']?.weather).toBe('cerah')
    expect(pruned['2026-10-01']).toBeUndefined()
  })
})

describe('sumProgress & splitMinutes', () => {
  it('menjumlahkan bagian dan membulatkan persen; total 0 → 0%', () => {
    expect(
      sumProgress([
        { done: 1, total: 3 },
        { done: 1, total: 1 },
      ]),
    ).toEqual({
      done: 2,
      total: 4,
      percent: 50,
    })
    expect(sumProgress([])).toEqual({ done: 0, total: 0, percent: 0 })
  })

  it('memecah menit jadi jam + menit, tidak pernah negatif', () => {
    expect(splitMinutes(80)).toEqual({ hours: 1, minutes: 20 })
    expect(splitMinutes(45)).toEqual({ hours: 0, minutes: 45 })
    expect(splitMinutes(-5)).toEqual({ hours: 0, minutes: 0 })
  })
})
