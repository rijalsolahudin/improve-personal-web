import { defineComponent, h, watch } from 'vue'

import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useOverview } from '~/composables/useOverview'
import type { Goal } from '~/utils/goals'
import type { Habit } from '~/utils/habits'
import {
  bestDayStreak,
  focusBuckets,
  habitStreaks,
  windowFor,
  type OverviewRange,
} from '~/utils/overview'
import { toTask } from '~/utils/tasks/persistence'
import type { Task } from '~/utils/tasks'
import { DEFAULT_POMODORO_CONFIG, createPomodoro } from '~/utils/pomodoro'
import { addDays, toIsoDate } from '~/utils/time'

import OverviewPage from './overview.vue'

/**
 * QA T13 — Halaman Overview (F11) dengan 5 rentang.
 *
 * Dua kelompok test:
 * 1. **Hijau** = perilaku yang sudah benar dan harus dijaga (navigasi rentang, regresi widget).
 * 2. **Merah (sengaja)** = acceptance criteria yang BELUM terpenuhi di tree ini. Test ditulis
 *    sebagai spesifikasi target supaya perbaikan developer bisa diverifikasi tanpa menebak:
 *    - Harian: grafik fokus 0:00–23:00 (PRD) dan sesi dini hari ikut terhitung.
 *    - Task selesai & goal difilter per rentang (PRD "Ringkasan Angka" + "Filter rentang").
 *    - Keseluruhan = semua data (bukan 1 Jan tahun berjalan).
 *    - Rekor streak = sepanjang masa (bukan dibatasi 365/120 hari).
 *    - Agregasi tidak dihitung ulang tiap tick 1 detik.
 */

const T0 = new Date(2026, 9, 14, 15, 0, 0).getTime() // Rabu 14 Okt 2026
const TODAY = toIsoDate(new Date(T0))

let mounted: VueWrapper | null = null

function taskOf(overrides: Record<string, unknown> = {}): Task {
  return {
    id: '018f2c4e-0000-7000-8000-0000000000aa',
    title: 'Task',
    priority: 'medium',
    deadline: null,
    done: false,
    scheduleId: null,
    quadrant: null,
    position: 0,
    ...overrides,
  } as unknown as Task
}

const habit: Habit = {
  id: '018f2c4e-0000-7000-8000-0000000000cc',
  name: 'Jalan pagi',
  icon: 'walking',
  sticker: null,
  color: 0,
  days: null,
  target: 1,
  goalId: null,
  isArchived: false,
}

const goal2024: Goal = {
  id: '018f2c4e-0000-7000-8000-0000000000gg',
  title: 'Goal lama',
  why: '',
  category: 'karier',
  status: 'aktif',
  start: '2024-01-01',
  end: '2024-03-31',
  cover: null,
  along: [],
  chapters: [
    {
      id: 'c1',
      title: 'Bab 2024',
      start: '2024-01-01',
      end: '2024-03-31',
      isManualDone: false,
      isClosed: true,
      items: [],
    },
  ],
}

async function mountPage(): Promise<VueWrapper> {
  const wrapper = await mountSuspended(OverviewPage)
  await flushPromises()
  return wrapper
}

function rangeButton(wrapper: VueWrapper, label: string) {
  const button = wrapper
    .findAll('[role="group"] button')
    .find((candidate) => candidate.text().trim() === label)
  if (!button) throw new Error(`tombol rentang "${label}" tidak ada`)
  return button
}

function navButton(wrapper: VueWrapper, title: string) {
  const button = wrapper.findAll('header button').find((it) => it.attributes('title') === title)
  if (!button) throw new Error(`tombol nav "${title}" tidak ada`)
  return button
}

const headerLabel = (wrapper: VueWrapper): string => wrapper.find('header p.label').text()

async function selectRange(wrapper: VueWrapper, label: string): Promise<void> {
  await rangeButton(wrapper, label).trigger('click')
  await flushPromises()
}

beforeEach(() => {
  clearNuxtState([
    'now',
    'tasks',
    'habits',
    'habitsCheckIns',
    'pomodoro-history',
    'schedules',
    'countdowns',
    'goals',
    'memos',
  ])
  useState('now').value = T0
  useState('tasks').value = []
  useState('habits').value = []
  useState('habitsCheckIns').value = {}
  useState('pomodoro-history').value = []
  useState('schedules').value = []
  useState('countdowns').value = []
  useState('goals').value = []
  useState('memos').value = { memos: [], moods: {} }
  useState('pomodoro-config').value = DEFAULT_POMODORO_CONFIG
  useState('pomodoro').value = createPomodoro(DEFAULT_POMODORO_CONFIG)
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('AC1 - 5 rentang & prev/next', () => {
  it('kelima rentang bisa dipilih dan label rentang ikut berubah', async () => {
    mounted = await mountPage()
    const seen: string[] = []
    for (const label of ['Keseluruhan', 'Harian', 'Pekanan', 'Bulanan', 'Tahunan']) {
      await selectRange(mounted, label)
      seen.push(headerLabel(mounted))
    }
    expect(seen).toEqual([
      'Keseluruhan · sejak Jan 2026',
      'Rabu, 14 Oktober 2026',
      '12 Okt – 18 Okt 2026',
      'Oktober 2026',
      'Tahun 2026',
    ])
  })

  it('harian: prev mundur satu hari, next kembali ke hari ini lalu nonaktif', async () => {
    mounted = await mountPage()
    await selectRange(mounted, 'Harian')

    await navButton(mounted, 'Sebelumnya').trigger('click')
    await flushPromises()
    expect(headerLabel(mounted)).toBe('Selasa, 13 Oktober 2026')

    await navButton(mounted, 'Berikutnya').trigger('click')
    await flushPromises()
    expect(headerLabel(mounted)).toBe('Rabu, 14 Oktober 2026')
    expect(navButton(mounted, 'Berikutnya').attributes('disabled')).toBeDefined()
  })

  it('pekanan: prev mundur satu pekan (Senin–Minggu) dan next kembali ke pekan ini', async () => {
    mounted = await mountPage()
    await selectRange(mounted, 'Pekanan')

    await navButton(mounted, 'Sebelumnya').trigger('click')
    await flushPromises()
    expect(headerLabel(mounted)).toBe('5 Okt – 11 Okt 2026')

    await navButton(mounted, 'Berikutnya').trigger('click')
    await flushPromises()
    expect(headerLabel(mounted)).toBe('12 Okt – 18 Okt 2026')
    expect(navButton(mounted, 'Berikutnya').attributes('disabled')).toBeDefined()
  })

  it('bulanan & tahunan: prev/next menggeser satu bulan / satu tahun', async () => {
    mounted = await mountPage()

    await selectRange(mounted, 'Bulanan')
    await navButton(mounted, 'Sebelumnya').trigger('click')
    await flushPromises()
    expect(headerLabel(mounted)).toBe('September 2026')
    await navButton(mounted, 'Berikutnya').trigger('click')
    await flushPromises()
    expect(headerLabel(mounted)).toBe('Oktober 2026')

    await selectRange(mounted, 'Tahunan')
    await navButton(mounted, 'Sebelumnya').trigger('click')
    await flushPromises()
    expect(headerLabel(mounted)).toBe('Tahun 2025')
    await navButton(mounted, 'Berikutnya').trigger('click')
    await flushPromises()
    expect(headerLabel(mounted)).toBe('Tahun 2026')
  })
})

describe('AC2 - metrik & streak benar per rentang', () => {
  it('harian: grafik fokus mencakup 0:00–23:00 sehingga sesi dini hari ikut terhitung', () => {
    const at0530 = new Date(2026, 9, 14, 5, 30).getTime()
    const session = {
      id: 's-early',
      startedAt: at0530 - 25 * 60_000,
      endedAt: at0530,
      target: 'Fokus',
      status: 'selesai' as const,
    }
    const { unit, buckets } = focusBuckets('harian', 0, T0, [session])
    expect(unit).toBe('jam')
    // PRD F11 "Grafik Fokus — Harian: per jam (0:00–23:00)".
    expect(buckets).toHaveLength(24)
    expect(buckets.reduce((acc, bucket) => acc + bucket.minutes, 0)).toBe(25)
  })

  it('ringkasan angka memuat "% task selesai tepat waktu" (PRD F11)', async () => {
    mounted = await mountPage()
    const labels = mounted.findAll('.stat .stat-label').map((it) => it.text().toLowerCase())
    const hasOnTime = labels.some((label) => label.includes('tepat waktu'))
    expect(hasOnTime, `kartu statistik: ${labels.join(' | ')}`).toBe(true)
  })

  it('habit completion rate Keseluruhan memakai data lebih dari 120 hari terakhir', async () => {
    useState<Habit[]>('habits').value = [habit]
    // Target tercapai 200 hari lalu; 120 hari terakhir kosong.
    useState('habitsCheckIns').value = {
      [habit.id]: Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [addDays(TODAY, -(200 + i)), 1]),
      ),
    }
    mounted = await mountPage()
    await selectRange(mounted, 'Keseluruhan')

    const rate = mounted.findAll('.stat')[2]?.find('.stat-value').text()
    expect(rate, `completion rate Keseluruhan = ${rate}`).not.toBe('0%')
  })

  it('task selesai mengikuti rentang: selesai 2024 tidak dihitung sebagai selesai "Harian" hari ini', async () => {
    useState<Task[]>('tasks').value = [
      taskOf({
        id: 'old',
        title: 'Selesai 2024',
        done: true,
        completedAt: new Date(2024, 4, 10, 9).getTime(),
        deadline: new Date(2024, 4, 9, 9).getTime(),
      }),
    ]
    mounted = await mountPage()
    await selectRange(mounted, 'Harian')

    const done = mounted.findAll('.stat')[3]
    expect(done?.text()).toContain('Task selesai')
    expect(done?.find('.stat-value').text()).toBe('0')
  })

  it('penyimpanan task: `completedAt` tidak boleh dibuang saat record dibaca UI', () => {
    const completedAt = new Date(2024, 4, 10, 9).getTime()
    const read = toTask(
      {
        id: '018f2c4e-0000-7000-8000-0000000000bb',
        title: 'Selesai 2024',
        note: null,
        deadlineAt: null,
        priority: 'medium',
        isDone: true,
        completedAt,
        scheduleId: null,
        scheduleOccurrenceAt: null,
        createdAt: completedAt,
        updatedAt: completedAt,
        deletedAt: null,
        deviceId: 'device',
        updatedBy: 'device',
      } as unknown as Parameters<typeof toTask>[0],
      null,
    ) as Task & { completedAt?: number | null }
    expect(read.completedAt).toBe(completedAt)
  })

  it('progress goal difilter rentang: goal yang chapternya 2024 tidak tampil di Harian', async () => {
    useState<Goal[]>('goals').value = [goal2024]
    mounted = await mountPage()
    await selectRange(mounted, 'Harian')

    expect(mounted.findAll('.goal-row')).toHaveLength(0)
  })

  it('grafik fokus: 7 slot pekanan, 28–31 slot bulanan, 12 slot tahunan', () => {
    expect(focusBuckets('pekanan', 0, T0, []).buckets).toHaveLength(7)
    expect(focusBuckets('bulanan', 0, T0, []).buckets).toHaveLength(31) // Oktober
    expect(focusBuckets('tahunan', 0, T0, []).buckets).toHaveLength(12)
  })

  it('streak: rentang selain Keseluruhan menampilkan streak aktif, Keseluruhan menampilkan rekor', async () => {
    // Aktif: hari ini + kemarin. Rekor: 4 hari berturut 10–13 hari lalu.
    const days = [
      ...Array.from({ length: 4 }, (_, i) => addDays(TODAY, -(10 + i))),
      addDays(TODAY, -1),
      TODAY,
    ]
    useState('pomodoro-history').value = days.map((day, index) => {
      const endedAt = new Date(`${day}T10:00:00`).getTime()
      return {
        id: `s${index}`,
        startedAt: endedAt - 25 * 60_000,
        endedAt,
        target: 'Fokus',
        status: 'selesai' as const,
      }
    })
    mounted = await mountPage()

    await selectRange(mounted, 'Harian')
    expect(mounted.findAll('.big-streak')[0]?.find('.big-n').text()).toBe('2')

    await selectRange(mounted, 'Keseluruhan')
    expect(mounted.findAll('.big-streak')[0]?.find('.big-n').text()).toBe('4')
  })

  it('rekor hari produktif = sepanjang masa (tidak dipotong 365 hari)', () => {
    const days = new Set(Array.from({ length: 5 }, (_, i) => addDays(TODAY, -(400 + i))))
    expect(bestDayStreak(days, TODAY)).toBe(5)
  })

  it('rekor streak habit = sepanjang masa (tidak dipotong 120 hari)', () => {
    const checkIns = {
      [habit.id]: Object.fromEntries(
        Array.from({ length: 5 }, (_, i) => [addDays(TODAY, -(200 + i)), 1]),
      ),
    }
    const [row] = habitStreaks([habit], checkIns, TODAY)
    expect(row?.best).toBe(5)
  })

  it('Keseluruhan mencakup data sebelum tahun berjalan (window mulai dari data terlama)', () => {
    const win = windowFor('keseluruhan', 0, T0)
    const start = toIsoDate(new Date(win.start))
    expect(win.start, `window Keseluruhan mulai ${start}`).toBeLessThanOrEqual(
      new Date(2024, 4, 10).getTime(),
    )
  })

  it('tren mood Keseluruhan memuat mood dari tahun lalu', async () => {
    useState('memos').value = { memos: [], moods: { '2024-05-10': 4, '2026-10-13': 2 } }
    mounted = await mountPage()
    await selectRange(mounted, 'Keseluruhan')
    expect(mounted.find('.mood-axis').text()).toContain('1 Mei')
  })
})

describe('AC3 - agregasi satu kali per ganti rentang', () => {
  const probeCounts: { bars: number; scheduled: number } = { bars: 0, scheduled: 0 }
  const Probe = defineComponent({
    setup() {
      const overview = useOverview()
      watch(overview.bars, () => (probeCounts.bars += 1), { flush: 'sync' })
      watch(overview.scheduled, () => (probeCounts.scheduled += 1), { flush: 'sync' })
      return () => h('div')
    },
  })

  it('tick jam 1 detik tidak menghitung ulang agregasi', async () => {
    useState('schedules').value = [
      {
        id: 'sc-1',
        title: 'Kelas',
        color: 0,
        start: '2026-09-01',
        time: '09:00',
        dur: 60,
        allDay: false,
        rec: { type: 'weekly', days: [1], interval: 1 },
        ends: { type: 'never' },
        exceptions: [],
        goalId: null,
      },
    ]
    const wrapper = await mountSuspended(Probe)
    await flushPromises()
    probeCounts.bars = 0
    probeCounts.scheduled = 0

    // Ticker app memperbarui `now` tiap 1 detik (plugins/ticker.client.ts:9).
    for (let tick = 1; tick <= 3; tick += 1) {
      useState('now').value = T0 + tick * 1000
      await flushPromises()
    }

    wrapper.unmount()
    expect(
      probeCounts,
      `recompute untuk 3 tick: fokus=${probeCounts.bars}, jadwal=${probeCounts.scheduled}`,
    ).toEqual({ bars: 0, scheduled: 0 })
  })

  it('ganti rentang menghitung ulang agregasi (sanity)', async () => {
    const wrapper = await mountSuspended(Probe)
    await flushPromises()
    probeCounts.bars = 0

    useState<OverviewRange>('overview-range').value = 'harian'
    await flushPromises()

    wrapper.unmount()
    expect(probeCounts.bars).toBeGreaterThan(0)
  })
})

describe('AC4 - regresi halaman Overview', () => {
  it('lima kartu statistik + streak habit + heatmap tetap tampil', async () => {
    useState<Habit[]>('habits').value = [habit]
    mounted = await mountPage()

    expect(mounted.findAll('.stat')).toHaveLength(5)
    expect(mounted.findAll('.habit-streak')).toHaveLength(1)
    expect(mounted.find('.heatmap').exists()).toBe(true)
  })
})
