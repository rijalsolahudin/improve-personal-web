import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetHabitsHydrationForTest } from '~/composables/useHabits'
import type { CheckIns, Habit } from '~/utils/habits'
import { MS_PER_HOUR, fromIsoDate } from '~/utils/time'

import HabitGrid from './HabitGrid.vue'

/**
 * QA T10 - verifikasi independen grid habit (commit 561d73f).
 *
 * Yang dibuktikan di layar, bukan di kode:
 * 1. hari LAMPAU yang parsial menampilkan `count/target` (dulu hanya hari ini yang menampilkan angka);
 * 2. aria-label tiap kotak menyebut status yang benar (tercapai / parsial / belum / belum tiba /
 *    bukan jadwal);
 * 3. hari DEPAN tetap tidak bisa diklik;
 * 4. nama habit dirender sebagai teks, bukan HTML (pilar keamanan).
 */
const TODAY = '2026-10-19' // Senin
const NOW_MS = fromIsoDate(TODAY).getTime() + 9 * MS_PER_HOUR
const MONTH = '2026-10-01'
const PAST = '2026-10-15' // Kamis pekan lalu (hari lampau, terjadwal untuk habit tiap hari)
const PAST_LABEL = '15 Okt'
const FUTURE_LABEL = '20 Okt' // Selasa besok
const TODAY_LABEL = '19 Okt'

function habitOf(overrides: Partial<Habit> = {}): Habit {
  return {
    id: '018f2c4e-0000-7000-8000-000000000001',
    name: 'Minum air',
    icon: 'droplet',
    sticker: null,
    color: 0,
    days: null,
    target: 3,
    goalId: null,
    isArchived: false,
    ...overrides,
  }
}

function seed(habits: Habit[], checkIns: CheckIns = {}): void {
  useState<Habit[]>('habits').value = habits
  useState<CheckIns>('habitsCheckIns').value = checkIns
}

let mounted: VueWrapper | null = null

function gridRow(name: string): DOMWrapper<Element> {
  if (mounted === null) throw new Error('grid belum dipasang')
  const row = mounted
    .findAll('.row')
    .find(
      (candidate) => candidate.find('.name').exists() && candidate.find('.name').text() === name,
    )
  if (!row) throw new Error(`baris habit "${name}" tidak ada`)
  return row
}

/** Tombol kotak tanggal di baris habit, dicari lewat aria-label (mis. "15 Okt"). */
function cellOf(name: string, dayLabel: string): DOMWrapper<Element> {
  const cell = gridRow(name)
    .findAll('.box')
    .find((candidate) => candidate.attributes('aria-label')?.includes(dayLabel))
  if (!cell) throw new Error(`kotak tanggal "${dayLabel}" tidak ada di baris "${name}"`)
  return cell
}

function cellSpansOf(name: string): DOMWrapper<Element>[] {
  return gridRow(name).findAll('.cell')
}

async function mountGrid(): Promise<void> {
  mounted = await mountSuspended(HabitGrid, { props: { month: MONTH } })
  await flushPromises()
}

beforeEach(() => {
  clearNuxtState(['habits', 'habitsCheckIns', 'habitsStatus', 'habitsError', 'localData', 'now'])
  resetHabitsHydrationForTest()
  useState<number>('now').value = NOW_MS
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('grid habit: angka parsial & aria-label (QA T10)', () => {
  it('hari lampau parsial target 3 menampilkan `count/target` dan aria-label yang sesuai', async () => {
    const habit = habitOf()
    seed([habit], { [habit.id]: { [PAST]: 2 } })
    await mountGrid()

    const cell = cellOf(habit.name, PAST_LABEL)
    expect(cell.text()).toBe('2')
    expect(cell.classes()).toContain('partial')
    // Regresi: dulu aria-label hari lampau selalu "belum" walau angkanya ada.
    expect(cell.attributes('aria-label')).toBe(`Minum air, Kamis, ${PAST_LABEL}: 2/3`)
    expect(cell.attributes('aria-pressed')).toBe('false')
    expect(cell.attributes('disabled')).toBeUndefined()
  })

  it('hari lampau yang mencapai target menampilkan centang, bukan angka', async () => {
    const habit = habitOf()
    seed([habit], { [habit.id]: { [PAST]: 3 } })
    await mountGrid()

    const cell = cellOf(habit.name, PAST_LABEL)
    expect(cell.text()).toBe('✓')
    expect(cell.classes()).toContain('met')
    expect(cell.attributes('aria-pressed')).toBe('true')
    expect(cell.attributes('aria-label')).toBe(`Minum air, Kamis, ${PAST_LABEL}: tercapai`)
  })

  it('hari lampau yang belum diisi tetap menyebut 0/3, bukan angka palsu', async () => {
    const habit = habitOf()
    seed([habit])
    await mountGrid()

    const cell = cellOf(habit.name, PAST_LABEL)
    expect(cell.text()).toBe('')
    expect(cell.classes()).not.toContain('partial')
    expect(cell.attributes('aria-label')).toBe(`Minum air, Kamis, ${PAST_LABEL}: 0/3`)
  })

  it('hari ini parsial juga menampilkan angka, target 1 tetap "belum" tanpa angka', async () => {
    const multi = habitOf()
    const single = habitOf({
      id: '018f2c4e-0000-7000-8000-000000000002',
      name: 'Baca buku',
      target: 1,
    })
    seed([multi, single], { [multi.id]: { [TODAY]: 1 } })
    await mountGrid()

    expect(cellOf(multi.name, TODAY_LABEL).text()).toBe('1')
    expect(cellOf(multi.name, TODAY_LABEL).attributes('aria-label')).toBe(
      `Minum air, Senin, ${TODAY_LABEL}: 1/3`,
    )
    expect(cellOf(single.name, TODAY_LABEL).text()).toBe('')
    expect(cellOf(single.name, TODAY_LABEL).attributes('aria-label')).toBe(
      `Baca buku, Senin, ${TODAY_LABEL}: belum`,
    )
  })

  it('hari depan tetap disabled dan diberi label "belum tiba"', async () => {
    const habit = habitOf()
    seed([habit])
    await mountGrid()

    const cell = cellOf(habit.name, FUTURE_LABEL)
    expect(cell.attributes('disabled')).toBeDefined()
    expect(cell.classes()).toContain('future')
    expect(cell.attributes('aria-label')).toBe(`Minum air, Selasa, ${FUTURE_LABEL}: belum tiba`)
  })

  it('hari bukan jadwal dirender sebagai titik libur, tanpa tombol', async () => {
    // Jadwal hanya Senin: Kamis 15 & Selasa 20 bukan jadwal.
    const habit = habitOf({ days: [1] })
    seed([habit])
    await mountGrid()

    const labels = gridRow(habit.name)
      .findAll('.box')
      .map((cell) => cell.attributes('aria-label') ?? '')
    expect(
      labels.every((label) => !label.includes(PAST_LABEL) && !label.includes(FUTURE_LABEL)),
    ).toBe(true)

    const spans = cellSpansOf(habit.name)
    expect(spans).toHaveLength(31)
    expect(gridRow(habit.name).findAll('.off').length).toBe(27) // 31 hari - 4 Senin
  })

  it('habit terarsip tidak punya baris di grid', async () => {
    seed([
      habitOf(),
      habitOf({ id: '018f2c4e-0000-7000-8000-000000000003', name: 'Baca buku', isArchived: true }),
    ])
    await mountGrid()

    const names = mounted!.findAll('.row .name').map((node) => node.text())
    expect(names).toEqual(['Minum air'])
  })

  it('bar "Bulan ini" setinggi 5px sesuai design (bukan 8px bawaan ProgressBar)', async () => {
    const habit = habitOf({ target: 1 })
    seed([habit], { [habit.id]: { [PAST]: 1 } })
    await mountGrid()

    const bar = gridRow(habit.name).find('[role="progressbar"]')
    expect(bar.exists()).toBe(true)
    expect(bar.attributes('style')).toContain('height: 5px')
  })

  it('nama habit berisi HTML dirender sebagai teks biasa, bukan elemen', async () => {
    const habit = habitOf({ name: '<b>jangan</b><img src=x onerror=alert(1)>' })
    seed([habit])
    await mountGrid()

    const row = gridRow(habit.name)
    expect(row.find('.name').text()).toBe('<b>jangan</b><img src=x onerror=alert(1)>')
    expect(row.find('b').exists()).toBe(false)
    expect(row.find('img').exists()).toBe(false)
  })
})
