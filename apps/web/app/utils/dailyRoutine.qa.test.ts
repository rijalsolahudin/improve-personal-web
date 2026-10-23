import { describe, expect, it } from 'vitest'

import { TODAY_TASK_LIMIT, dailyPriorities, todayTasks } from './dailyRoutine'
import { MS_PER_HOUR, addDays, fromIsoDate } from './time'
import type { Task } from './tasks'

/**
 * QA T14 (Ergonio #28) - acceptance criteria widget Prioritas & To-do hari ini (PRD F12).
 *
 * Yang diuji di sini hanya aturan murni yang menentukan isi widget; wiring store/komponen ada di
 * `useDailyRoutine.qa.test.ts` dan `dailyWidgets.qa.test.ts`.
 */
const TODAY = '2026-10-19' // Senin
const START = fromIsoDate(TODAY).getTime()
const NOW = START + 14 * MS_PER_HOUR

/** Deadline pada hari `offset` (relatif TODAY) jam `hour`. */
function at(offset: number, hour: number): number {
  return fromIsoDate(addDays(TODAY, offset)).getTime() + hour * MS_PER_HOUR
}

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

describe('Prioritas hari ini (AC1)', () => {
  it('tanpa batas 3: semua kuadran Penting & Mendesak dulu, lalu semua urgent, tiap grup urut deadline', () => {
    const tasks = [
      ...Array.from({ length: 12 }, (_, index) =>
        task(`urgent-${index}`, {
          priority: 'urgent',
          // Sengaja acak: urutan harus datang dari deadline, bukan urutan array.
          deadline: at(0, 18 - index),
        }),
      ),
      task('do-lambat', { quadrant: 'do', deadline: at(-1, 9) }),
      task('do-nanti', { quadrant: 'do', deadline: at(0, 20) }),
      task('do-tanpa-deadline', { quadrant: 'do', priority: 'low' }),
    ]

    const list = dailyPriorities(tasks, [])

    // 12 urgent + 3 kuadran = 15, bukan dipotong 3.
    expect(list).toHaveLength(15)
    expect(list.map(({ origin }) => origin)).toEqual([
      ...Array.from({ length: 3 }, () => 'quadrant'),
      ...Array.from({ length: 12 }, () => 'urgent'),
    ])
    // Grup kuadran urut deadline; tanpa deadline di akhir grup.
    expect(list.slice(0, 3).map(({ task: item }) => item.id)).toEqual([
      'do-lambat',
      'do-nanti',
      'do-tanpa-deadline',
    ])
    // Grup urgent urut deadline terdekat.
    const urgentDeadlines = list
      .filter(({ origin }) => origin === 'urgent')
      .map(({ task: item }) => item.deadline ?? Number.POSITIVE_INFINITY)
    expect(urgentDeadlines).toEqual([...urgentDeadlines].sort((a, b) => a - b))
  })

  it('task urgent di kuadran Penting & Mendesak hanya muncul sekali (grup kuadran)', () => {
    const tasks = [
      task('do-urgent', { quadrant: 'do', priority: 'urgent' }),
      task('urgent-biasa', { priority: 'urgent' }),
    ]

    const list = dailyPriorities(tasks, [])

    expect(list.map(({ task: item, origin }) => [item.id, origin])).toEqual([
      ['do-urgent', 'quadrant'],
      ['urgent-biasa', 'urgent'],
    ])
    expect(new Set(list.map(({ task: item }) => item.id)).size).toBe(list.length)
  })

  it('task selesai hanya tampil kalau dicentang hari ini; yang selesai di halaman lain tidak ikut', () => {
    const tasks = [
      task('selesai-dari-daily', { quadrant: 'do', done: true }),
      task('selesai-dari-f2', { quadrant: 'do', done: true }),
      task('belum', { quadrant: 'do' }),
    ]

    const list = dailyPriorities(tasks, ['selesai-dari-daily'])

    // Urutan stabil: keduanya tanpa deadline, jadi mengikuti urutan sumber (`selesai-dari-daily` dulu).
    expect(list.map(({ task: item }) => item.id)).toEqual(['selesai-dari-daily', 'belum'])
  })
})

describe('To-do hari ini (AC3)', () => {
  const tasks = [
    task('terlambat-kemarin', { deadline: at(-1, 10) }),
    task('terlambat-pagi', { deadline: at(0, 9) }),
    task('nanti-sore', { deadline: at(0, 17) }),
    task('selesai-hari-ini', { deadline: at(0, 8), done: true }),
    task('selesai-kemarin', { deadline: at(-1, 8), done: true }),
    task('besok', { deadline: at(1, 9) }),
    task('tanpa-deadline'),
  ]

  it('memuat deadline hari ini + yang terlambat, menandai terlambat, tanpa besok & tanpa deadline', () => {
    const list = todayTasks(tasks, [], [], TODAY, NOW)

    expect(list.map(({ task: item, isOverdue }) => [item.id, isOverdue])).toEqual([
      ['terlambat-kemarin', true],
      ['terlambat-pagi', true],
      ['nanti-sore', false],
      ['selesai-hari-ini', false],
    ])
  })

  it('batas hari inklusif: deadline 00:00 dan 23:59 tetap masuk', () => {
    const list = todayTasks(
      [
        task('awal-hari', { deadline: START }),
        task('akhir-hari', { deadline: START + 24 * MS_PER_HOUR - 60_000 }),
      ],
      [],
      [],
      TODAY,
      NOW,
    )

    expect(list.map(({ task: item }) => item.id)).toEqual(['awal-hari', 'akhir-hari'])
  })

  it('B1 (reproduksi): 12 task jatuh tempo hari ini semuanya harus masuk & dihitung progresnya', () => {
    // PRD F12: "Progress bar selesai / total (5 dari 10 task)" - total = seluruh to-do hari ini.
    // Kode memotong daftar di TODAY_TASK_LIMIT tanpa penanda "Lihat N lagi", jadi progres hanya
    // menghitung 10 task pertama. Test ini sengaja gagal selama perilaku itu ada.
    const banyak = Array.from({ length: 12 }, (_, index) =>
      task(`due-${index}`, { deadline: at(0, 9 + index) }),
    )

    const list = todayTasks(banyak, [], [], TODAY, NOW)

    expect(TODAY_TASK_LIMIT).toBeGreaterThan(0)
    expect(list).toHaveLength(12)
  })
})
