import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetHabitsHydrationForTest } from '~/composables/useHabits'
import {
  countOn,
  type CheckIns,
  type Habit,
  MS_PER_HOUR,
  fromIsoDate,
} from '@improve-personal/core/planner'

import DailyHabitCard from './DailyHabitCard.vue'

/**
 * Baris habit Daily sesuai design v2 (`Desktop v2.dc.html` 2264-2286):
 * - habit multi: ikon polos + pip yang bisa diketuk (set ke N, pip terakhir N-1),
 * - habit single: checkbox di kiri baris,
 * - klik nama / area kosong tidak mengubah hitungan (dulu satu tombol membungkus sebaris).
 *
 * State yang diperiksa adalah `habitsCheckIns` - sumber yang dipakai halaman untuk menurunkan ulang
 * props kartu ini, jadi angka yang dilihat user ikut berubah.
 */
const TODAY = '2026-10-19' // Senin
const NOW = fromIsoDate(TODAY).getTime() + 9 * MS_PER_HOUR

function habit(id: string, patch: Partial<Habit> = {}): Habit {
  return {
    id,
    name: 'Minum air',
    icon: 'droplet',
    sticker: null,
    color: 0,
    days: null,
    target: 1,
    goalId: null,
    isArchived: false,
    ...patch,
  }
}

const MULTI = habit('multi', { target: 5 })
const SINGLE = habit('single', { name: 'Baca buku', icon: 'book-open' })

function seed(habits: readonly Habit[], checkIns: CheckIns): void {
  useState<Habit[]>('habits').value = [...habits]
  useState<CheckIns>('habitsCheckIns').value = checkIns
}

function rowsFor(items: readonly { habit: Habit; count: number }[], streak = 0) {
  return items.map((item) => ({
    ...item,
    isDone: item.count >= item.habit.target,
    streak,
  }))
}

const PROGRESS = { done: 0, total: 1, percent: 0 }

/** `trigger('click')` di-await akan menunggu tick; di sini klik harus sinkron supaya state optimistis terbaca. */
function click(element: Element | undefined): void {
  if (!(element instanceof HTMLElement)) throw new Error('elemen tombol tidak ditemukan')
  element.click()
}

beforeEach(() => {
  clearNuxtState(['habits', 'habitsCheckIns', 'habitsStatus', 'habitsError', 'now'])
  resetHabitsHydrationForTest()
  useState<number>('now').value = NOW
})

afterEach(async () => {
  // Penulisan tanpa sesi gagal lalu me-rollback state; tunggu supaya tidak menyeberang ke test lain.
  await flushPromises()
})

describe('DailyHabitCard · habit multi (pip)', () => {
  it('klik pip ke-N menyetel hitungan ke N, bukan menambah satu', async () => {
    seed([MULTI], { multi: { [TODAY]: 1 } })
    const wrapper = await mountSuspended(DailyHabitCard, {
      props: { habits: rowsFor([{ habit: MULTI, count: 1 }]), progress: PROGRESS },
    })

    const pips = wrapper.findAll('button.pip')
    expect(pips).toHaveLength(5)

    click(pips[3]?.element)
    expect(countOn(useState<CheckIns>('habitsCheckIns').value, MULTI.id, TODAY)).toBe(4)

    // Pip kedua dari hitungan 4: lompat ke 2.
    click(pips[1]?.element)
    expect(countOn(useState<CheckIns>('habitsCheckIns').value, MULTI.id, TODAY)).toBe(2)
  })

  it('klik pip terakhir yang terisi mengurangi satu', async () => {
    seed([MULTI], { multi: { [TODAY]: 3 } })
    const wrapper = await mountSuspended(DailyHabitCard, {
      props: { habits: rowsFor([{ habit: MULTI, count: 3 }]), progress: PROGRESS },
    })

    click(wrapper.findAll('button.pip')[2]?.element)

    expect(countOn(useState<CheckIns>('habitsCheckIns').value, MULTI.id, TODAY)).toBe(2)
  })

  it('klik nama / area kosong baris tidak mengubah hitungan', async () => {
    seed([MULTI], { multi: { [TODAY]: 1 } })
    const wrapper = await mountSuspended(DailyHabitCard, {
      props: { habits: rowsFor([{ habit: MULTI, count: 1 }]), progress: PROGRESS },
    })

    // Tidak ada lagi tombol pembungkus sebaris: nama & ikon polos bukan target klik.
    expect(wrapper.find('button.check-in').exists()).toBe(false)

    await wrapper.find('.name').trigger('click')
    await wrapper.find('.text').trigger('click')
    await wrapper.find('.bare').trigger('click')

    expect(countOn(useState<CheckIns>('habitsCheckIns').value, MULTI.id, TODAY)).toBe(1)
  })

  it('ikon multi tampil polos (tanpa tile) dan tiap pip punya label + aria-pressed', async () => {
    seed([MULTI], { multi: { [TODAY]: 2 } })
    const wrapper = await mountSuspended(DailyHabitCard, {
      props: { habits: rowsFor([{ habit: MULTI, count: 2 }]), progress: PROGRESS },
    })

    expect(wrapper.find('.tile').exists()).toBe(false)
    expect(wrapper.find('.bare').exists()).toBe(true)

    const pips = wrapper.findAll('button.pip')
    expect(pips[0]?.attributes('aria-label')).toBe('Ubah ke 1 dari 5: Minum air')
    expect(pips[0]?.attributes('aria-pressed')).toBe('true')
    expect(pips[4]?.attributes('aria-pressed')).toBe('false')
  })
})

describe('DailyHabitCard · habit single (checkbox kiri)', () => {
  it('checkbox ada di kiri baris, sebelum nama, dan mengirim `toggle`', async () => {
    seed([SINGLE], {})
    const wrapper = await mountSuspended(DailyHabitCard, {
      props: { habits: rowsFor([{ habit: SINGLE, count: 0 }]), progress: PROGRESS },
    })

    const checkIn = wrapper.find('button.check-in')
    expect(checkIn.exists()).toBe(true)
    const first = checkIn.element.firstElementChild
    expect(first?.classList.contains('box')).toBe(true)
    expect(first?.nextElementSibling?.classList.contains('text')).toBe(true)

    await checkIn.trigger('click')
    expect(wrapper.emitted('toggle')).toEqual([[SINGLE.id]])
    // Klik checkbox tidak menulis langsung: halaman yang memutuskan (kontrak `@toggle`).
    expect(useState<CheckIns>('habitsCheckIns').value).toEqual({})
  })

  it('klik nama habit single tetap mencentang (desain: baris single bisa diklik)', async () => {
    seed([SINGLE], {})
    const wrapper = await mountSuspended(DailyHabitCard, {
      props: { habits: rowsFor([{ habit: SINGLE, count: 0 }]), progress: PROGRESS },
    })

    await wrapper.find('.name').trigger('click')

    expect(wrapper.emitted('toggle')).toEqual([[SINGLE.id]])
  })

  it('streak ditulis sebagai teks, tanpa emoji 🔥', async () => {
    seed([habit('streak', { name: 'Jalan kaki' })], {})
    const wrapper = await mountSuspended(DailyHabitCard, {
      props: {
        habits: rowsFor([{ habit: habit('streak', { name: 'Jalan kaki' }), count: 0 }], 4),
        progress: PROGRESS,
      },
    })

    expect(wrapper.text()).toContain('4 hari')
    expect(wrapper.text()).not.toContain('🔥')
  })

  it('streak 0 tampil sebagai angka polos (design), bukan "0 hari"', async () => {
    seed([habit('nol', { name: 'Jalan kaki' })], {})
    const wrapper = await mountSuspended(DailyHabitCard, {
      props: {
        habits: rowsFor([{ habit: habit('nol', { name: 'Jalan kaki' }), count: 0 }], 0),
        progress: PROGRESS,
      },
    })

    expect(wrapper.find('.streak').text()).toBe('0')
  })
})
