import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetHabitsHydrationForTest } from '~/composables/useHabits'
import { HABIT_NAME_MAX, HABIT_TARGET_MAX } from '~/utils/habits'

import HabitForm from './HabitForm.vue'

/**
 * QA T10 - pilar keamanan/kerapian di sisi form: input dibatasi dan divalidasi di UI, bukan hanya
 * di logika. Batas ini yang mencegah nama kepanjangan & target mustahil sampai ke penyimpanan.
 *
 * Test berjalan tanpa sesi data lokal (kondisi nyata "penyimpanan belum siap"), jadi yang diuji
 * adalah batas input & pesan validasi - jalur simpan sukses diuji di `useHabits.qa.test.ts`.
 */
let mounted: VueWrapper | null = null

function buttonWith(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === label)
  if (!button) throw new Error(`tombol "${label}" tidak ada`)
  return button
}

function targetText(wrapper: VueWrapper): string {
  return wrapper.find('.target').text()
}

beforeEach(() => {
  clearNuxtState(['habits', 'habitsCheckIns', 'habitsStatus', 'habitsError', 'localData'])
  resetHabitsHydrationForTest()
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('form habit: batas & pesan validasi (QA T10)', () => {
  it('nama dibatasi panjang maksimum yang sama dengan aturan validasi', async () => {
    mounted = await mountSuspended(HabitForm, { props: { habitId: null } })

    expect(mounted.find('input').attributes('maxlength')).toBe(String(HABIT_NAME_MAX))
  })

  it('nama kosong: input ditandai tidak valid dan pesan tampil', async () => {
    mounted = await mountSuspended(HabitForm, { props: { habitId: null } })

    await mounted.find('form').trigger('submit')
    await flushPromises()

    expect(mounted.find('input').attributes('aria-invalid')).toBe('true')
    expect(mounted.find('[role="alert"]').text()).toBe('Nama habit wajib diisi.')
    expect(mounted.emitted('saved')).toBeUndefined()
  })

  it('target tidak bisa naik melewati batas maksimum', async () => {
    mounted = await mountSuspended(HabitForm, { props: { habitId: null } })

    expect(targetText(mounted)).toBe('1x')
    // Tombol kurang dimatikan di batas bawah.
    expect(buttonWith(mounted, '−').attributes('disabled')).toBeDefined()

    for (let step = 1; step < HABIT_TARGET_MAX; step += 1) {
      await buttonWith(mounted, '+').trigger('click')
    }

    expect(targetText(mounted)).toBe(`${HABIT_TARGET_MAX}x`)
    expect(buttonWith(mounted, '+').attributes('disabled')).toBeDefined()
  })

  it('frekuensi "Hari tertentu" tanpa hari terpilih ditolak saat simpan', async () => {
    mounted = await mountSuspended(HabitForm, { props: { habitId: null } })

    await mounted.find('input').setValue('Lari pagi')
    // "Hari tertentu" mengisi default Sen/Rab/Jum, lalu semuanya dilepas -> daftar hari kosong.
    const chips = mounted.findAll('button').filter((button) => button.text() === 'Hari tertentu')
    const someDays = chips[0]
    if (!someDays) throw new Error('chip "Hari tertentu" tidak ada')
    await someDays.trigger('click')
    for (const day of ['Sen', 'Rab', 'Jum']) {
      await buttonWith(mounted, day).trigger('click')
    }

    await mounted.find('form').trigger('submit')
    await flushPromises()

    expect(mounted.find('[role="alert"]').text()).toBe('Pilih minimal satu hari.')
    expect(mounted.emitted('saved')).toBeUndefined()
  })
})
