import { beforeEach, describe, expect, it } from 'vitest'

import { createHomeMock } from './home/mock'
import { useHomeDashboard } from './useHomeDashboard'

describe('useHomeDashboard', () => {
  beforeEach(() => {
    clearNuxtState(['home-dashboard', 'tasks', 'schedules', 'goals', 'habits', 'memos'])
  })

  it('To-do hari ini = task dengan deadline < 24 jam (termasuk terlambat)', () => {
    const { todayTasks } = useHomeDashboard()
    const titles = todayTasks.value.map((task) => task.title)
    expect(titles).toContain('Kirim draft laporan')
    expect(titles).toContain('Selesai modul 4 — VPC')
    expect(titles).not.toContain('Balas email vendor')
    expect(titles).not.toContain('Perpanjang SIM')
  })

  it('quick add merapikan judul, menolak judul kosong, dan update statistik', () => {
    const { addTask, stats, todayTasks } = useHomeDashboard()
    const totalBefore = stats.value.tasksTotal

    expect(addTask('   ', 'urgent')).toBe(false)
    expect(addTask('  Siapkan slide  ', 'medium')).toBe(true)

    expect(stats.value.tasksTotal).toBe(totalBefore + 1)
    expect(todayTasks.value.at(-1)).toMatchObject({ title: 'Siapkan slide', priority: 'medium' })
  })

  it('toggle task & habit mengubah hitungan selesai dan streak hari ini', () => {
    const { toggleTask, toggleHabit, stats, habits, habitsDone } = useHomeDashboard()
    const doneBefore = stats.value.tasksDone

    toggleTask('t1')
    expect(stats.value.tasksDone).toBe(doneBefore + 1)

    // h3 (Baca 10 hal) dijadwalkan tiap hari dan belum dicentang di data contoh.
    const doneBefore2 = habitsDone.value
    const before = habits.value.find((habit) => habit.id === 'h3')
    toggleHabit('h3')
    const after = habits.value.find((habit) => habit.id === 'h3')
    expect(after?.streakNow).toBe((before?.streakNow ?? 0) + 1)
    expect(habitsDone.value).toBe(doneBefore2 + 1)
  })

  it('memo kosong ditolak; memo tersimpan muncul di memo hari ini', () => {
    const { saveMemo, memosToday } = useHomeDashboard()

    expect(saveMemo({ text: '   ', mood: null, paper: 'krem' })).toBe(false)
    expect(saveMemo({ text: ' Hari yang baik ', mood: 4, paper: 'pink' })).toBe(true)

    expect(memosToday.value).toHaveLength(1)
    expect(memosToday.value[0]).toMatchObject({ text: 'Hari yang baik', paper: 'pink' })
    // Mood disimpan per hari di jurnal, bukan per memo.
    expect(useMemos().moodOn(memosToday.value[0]?.date ?? '')).toBe(4)
  })

  it('countdown diurutkan dari yang terdekat', () => {
    const { countdowns } = useHomeDashboard()
    const days = countdowns.value.map((item) => item.daysLeft)
    expect(days).toEqual([...days].sort((a, b) => a - b))
  })
})

describe('createHomeMock', () => {
  it('deterministik terhadap waktu yang di-inject', () => {
    const now = new Date(2026, 9, 9, 20, 0).getTime()
    const mock = createHomeMock(now)
    expect(createHomeMock(now)).toEqual(mock)
  })
})
