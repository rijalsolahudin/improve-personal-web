import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetLocalDataSessionForTest } from '~/composables/useLocalData'
import { resetSchedulesHydrationForTest } from '~/composables/useSchedules'
import { resetTasksHydrationForTest } from '~/composables/useTasks'
import type { Memo } from '~/utils/memo'
import type { Schedule } from '~/utils/schedule'
import type { Task } from '~/utils/tasks'

import KalenderPage from './kalender.vue'

/**
 * QA T9 - halaman Kalender (PRD F6): recurring tampil benar di tiga view, klik tanggal mengisi panel
 * detail hari (jadwal + to-do + jurnal), dan navigasi view/tanggal tidak regresi.
 *
 * Data disemai lewat `useState` yang sama dengan yang dibaca composable - bukan dengan mem-mock
 * composable internal - supaya yang diuji adalah jalur data yang benar-benar dipakai halaman.
 */

/** Rabu, 10 September 2025, 10:00 waktu perangkat. */
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

const LAPORAN: Task = {
  id: 'task-1',
  title: 'Kirim laporan',
  priority: 'medium',
  deadline: new Date(2025, 8, 10, 14, 0).getTime(),
  done: false,
  scheduleId: null,
  quadrant: null,
  position: 0,
}

const JURNAL: Memo = {
  id: 'memo-1',
  date: '2025-09-10',
  createdAt: new Date(2025, 8, 10, 20, 0).getTime(),
  title: '',
  text: 'Hari ini fokus belajar IAM.',
  feelings: [],
  paper: 'krem',
}

const CLEARED_KEYS = [
  'now',
  'schedules',
  'schedule-attendance',
  'schedulesStatus',
  'schedulesError',
  'tasks',
  'tasksStatus',
  'tasksError',
  'goals',
  'countdowns',
  'memos',
  'memo-paper',
  'calendar-view',
  'calendar-anchor',
  'calendar-selected',
  'localData',
] as const

let mounted: VueWrapper | null = null

function seedCalendar(view: 'hari' | 'pekan' | 'bulan', anchor: string, selected: string): void {
  useState<number>('now').value = NOW
  useState<Schedule[]>('schedules').value = [KELAS]
  useState<Task[]>('tasks').value = [LAPORAN]
  useState('goals').value = []
  useState('countdowns').value = []
  useState('memos').value = { memos: [JURNAL], moods: { '2025-09-10': 4 } }
  useState<'hari' | 'pekan' | 'bulan'>('calendar-view').value = view
  useState<string>('calendar-anchor').value = anchor
  useState<string>('calendar-selected').value = selected
}

async function mountCalendar(): Promise<VueWrapper> {
  const wrapper = await mountSuspended(KalenderPage)
  await flushPromises()
  return wrapper
}

const text = (wrapper: VueWrapper, selector: string): string => wrapper.find(selector).text()
const button = (wrapper: VueWrapper, label: string) =>
  wrapper.findAll('button').find((item) => item.text() === label)
const cell = (wrapper: VueWrapper, labelPart: string) =>
  wrapper.findAll('button.cell').find((item) => item.attributes('aria-label')?.includes(labelPart))

beforeEach(() => {
  clearNuxtState([...CLEARED_KEYS])
  resetTasksHydrationForTest()
  resetSchedulesHydrationForTest()
  resetLocalDataSessionForTest()
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('T9 view bulan', () => {
  it('recurring muncul di sel tanggal yang benar, tidak di tanggal lain', async () => {
    seedCalendar('bulan', '2025-09-01', '2025-09-10')
    mounted = await mountCalendar()

    expect(text(mounted, '.range')).toBe('September 2025')
    expect(mounted.findAll('button.cell')).toHaveLength(35)

    // Senin 1 & Kamis 4 September punya kelas; Selasa 2 tidak.
    expect(cell(mounted, '1 September 2025')?.text()).toContain('Kelas AWS')
    expect(cell(mounted, '4 September 2025')?.text()).toContain('Kelas AWS')
    expect(cell(mounted, '2 September 2025')?.text()).not.toContain('Kelas AWS')
    expect(cell(mounted, '3 September 2025')?.text()).not.toContain('Kelas AWS')

    // Sel "luar bulan" ikut grid: Kamis 2 Oktober juga kena pola.
    expect(cell(mounted, '2 Oktober 2025')?.text()).toContain('Kelas AWS')
  })

  it('to-do ber-deadline tampil di tanggal deadline, bukan tanggal lain', async () => {
    seedCalendar('bulan', '2025-09-01', '2025-09-10')
    mounted = await mountCalendar()

    expect(cell(mounted, '10 September 2025')?.text()).toContain('Kirim laporan')
    expect(cell(mounted, '9 September 2025')?.text()).not.toContain('Kirim laporan')
  })
})

describe('T9 view pekan & hari', () => {
  it('view pekan: 7 kolom, recurring di kolom Senin & Kamis', async () => {
    seedCalendar('pekan', '2025-09-10', '2025-09-10')
    mounted = await mountCalendar()

    expect(text(mounted, '.range')).toBe('8 Sep – 14 Sep 2025')
    expect(mounted.findAll('.heads .head')).toHaveLength(7)

    const columns = mounted.findAll('.col')
    expect(columns).toHaveLength(7)
    expect(columns[0]?.text()).toContain('Kelas AWS')
    expect(columns[1]?.text()).not.toContain('Kelas AWS')
    expect(columns[3]?.text()).toContain('Kelas AWS')
    expect(columns[4]?.text()).not.toContain('Kelas AWS')
  })

  it('view hari: satu kolom timeline berisi recurring hari itu', async () => {
    seedCalendar('hari', '2025-09-11', '2025-09-11')
    mounted = await mountCalendar()

    expect(text(mounted, '.range')).toBe('Kamis, 11 September 2025')
    expect(mounted.findAll('.heads .head')).toHaveLength(1)
    const columns = mounted.findAll('.col')
    expect(columns).toHaveLength(1)
    expect(columns[0]?.text()).toContain('Kelas AWS')
  })
})

describe('T9 klik tanggal -> panel detail hari', () => {
  it('panel menampilkan jadwal + to-do + jurnal hari yang diklik', async () => {
    seedCalendar('bulan', '2025-09-01', '2025-09-10')
    mounted = await mountCalendar()

    // Hari ini (10 Sep): ada to-do & jurnal, tidak ada jadwal.
    await cell(mounted, '10 September 2025')?.trigger('click')
    await flushPromises()

    let panel = text(mounted, 'aside.panel')
    expect(panel).toContain('10 September')
    expect(panel).toContain('Hari ini')
    expect(panel).toContain('0 jadwal · 1 deadline')
    expect(panel).toContain('Kirim laporan')
    expect(panel).toContain('Journal')
    expect(panel).toContain('Hari ini fokus belajar IAM.')

    // Kamis 11 Sep: ada jadwal recurring, tidak ada to-do & jurnal.
    await cell(mounted, '11 September 2025')?.trigger('click')
    await flushPromises()

    panel = text(mounted, 'aside.panel')
    expect(panel).toContain('11 September')
    expect(panel).toContain('1 jadwal · 0 deadline')
    expect(panel).toContain('Kelas AWS')
    expect(panel).toContain('09:00–10:30')
    expect(panel).toContain('Mingguan, Sen & Kam')
    expect(panel).toContain('Nggak ada deadline di tanggal ini.')
    expect(panel).toContain('Belum ada memo di tanggal ini.')
  })

  it('tanggal yang dipilih tetap dipakai saat pindah view (panel & papan tidak menyimpang)', async () => {
    seedCalendar('bulan', '2025-09-01', '2025-09-10')
    mounted = await mountCalendar()

    await cell(mounted, '11 September 2025')?.trigger('click')
    await flushPromises()

    await button(mounted, 'Hari')?.trigger('click')
    await flushPromises()

    expect(text(mounted, '.range')).toBe('Kamis, 11 September 2025')
    expect(text(mounted, 'aside.panel')).toContain('11 September')

    await button(mounted, 'Pekan')?.trigger('click')
    await flushPromises()

    expect(text(mounted, '.range')).toBe('8 Sep – 14 Sep 2025')
    expect(text(mounted, 'aside.panel')).toContain('11 September')
  })
})

describe('T9 navigasi view & tanggal', () => {
  it('bulan: next/prev melewati pergantian tahun', async () => {
    seedCalendar('bulan', '2025-12-01', '2025-12-01')
    mounted = await mountCalendar()

    expect(text(mounted, '.range')).toBe('Desember 2025')
    await button(mounted, '›')?.trigger('click')
    await flushPromises()
    expect(text(mounted, '.range')).toBe('Januari 2026')

    await button(mounted, '‹')?.trigger('click')
    await flushPromises()
    expect(text(mounted, '.range')).toBe('Desember 2025')
  })

  it('pekan: next/prev 7 hari dan tombol "Hari ini" kembali ke pekan berjalan', async () => {
    seedCalendar('pekan', '2025-09-10', '2025-09-10')
    mounted = await mountCalendar()

    await button(mounted, '›')?.trigger('click')
    await flushPromises()
    expect(text(mounted, '.range')).toBe('15 Sep – 21 Sep 2025')

    await button(mounted, '‹')?.trigger('click')
    await flushPromises()
    expect(text(mounted, '.range')).toBe('8 Sep – 14 Sep 2025')

    await button(mounted, '›')?.trigger('click')
    await flushPromises()
    await button(mounted, 'Hari ini')?.trigger('click')
    await flushPromises()
    expect(text(mounted, '.range')).toBe('8 Sep – 14 Sep 2025')
  })

  it('hari: next memindahkan tanggal yang ditampilkan', async () => {
    seedCalendar('hari', '2025-09-10', '2025-09-10')
    mounted = await mountCalendar()

    expect(text(mounted, '.range')).toBe('Rabu, 10 September 2025')
    await button(mounted, '›')?.trigger('click')
    await flushPromises()
    expect(text(mounted, '.range')).toBe('Kamis, 11 September 2025')
    expect(mounted.findAll('.col')[0]?.text()).toContain('Kelas AWS')
  })
})
