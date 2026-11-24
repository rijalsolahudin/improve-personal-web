import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import type { Habit } from '@improve-personal/core/planner'

import HabitIcon from './HabitIcon.vue'

/**
 * Radius tile ikut ukuran tile (design `isHabit` 1761-1892 + preview Daily):
 * 42 → 14/5 (grid Habit), 30 → 10/3 (Daily polos).
 *
 * jsdom tidak menyelesaikan `calc(var(--rk) * 14px)`, jadi yang diperiksa nilai custom prop yang
 * dipasang komponen pada elemen tile - bukan isi `<style>` file. Kalau rasio radius berubah,
 * test ini gagal sebelum user melihat tile yang salah bentuk.
 */
const HABIT: Pick<Habit, 'icon' | 'sticker' | 'color'> = {
  icon: 'star',
  sticker: null,
  color: 0,
}

async function tileStyle(size: number, isPlain = false): Promise<CSSStyleDeclaration> {
  const wrapper = await mountSuspended(HabitIcon, { props: { habit: HABIT, size, isPlain } })
  const tile = wrapper.find('.tile')
  expect(tile.exists()).toBe(true)
  return (tile.element as HTMLElement).style
}

describe('HabitIcon: radius tile mengikuti ukuran', () => {
  it('tile 42 (grid Habit) memakai sudut 14 dan sudut tajam 5', async () => {
    const style = await tileStyle(42)
    expect(style.getPropertyValue('--tile-radius')).toBe('14px')
    expect(style.getPropertyValue('--leaf-radius')).toBe('5px')
  })

  it('tile 30 polos (Daily) memakai sudut 10 dan sudut tajam 3', async () => {
    const style = await tileStyle(30, true)
    expect(style.getPropertyValue('--tile-radius')).toBe('10px')
    expect(style.getPropertyValue('--leaf-radius')).toBe('3px')
  })

  it('ukuran lain tetap proporsional, bukan nilai tetap yang dipakai ulang', async () => {
    const style = await tileStyle(60)
    expect(style.getPropertyValue('--tile-radius')).toBe('20px')
    expect(style.getPropertyValue('--leaf-radius')).toBe('7px')
  })
})

/**
 * Mode `bare` = ikon polos berwarna habit, dipakai baris habit multi di Daily (design v2 2264-2286).
 * Default TIDAK berubah: grid Habit & arsip tetap memakai tile berbingkai.
 */
describe('HabitIcon: mode bare (Daily multi)', () => {
  it('tidak merender tile/kotak, hanya ikon seukuran yang diminta', async () => {
    const wrapper = await mountSuspended(HabitIcon, {
      props: { habit: HABIT, size: 22, bare: true },
    })

    expect(wrapper.find('.tile').exists()).toBe(false)
    const bare = wrapper.find('.bare')
    expect(bare.exists()).toBe(true)
    expect(bare.attributes('style')).toContain('color: #9B4FC9')
    expect(wrapper.find('svg').attributes('width')).toBe('22')
  })

  it('sticker tetap menang atas ikon, sama seperti mode tile', async () => {
    const wrapper = await mountSuspended(HabitIcon, {
      props: { habit: { ...HABIT, sticker: 'hewan/kelinci' }, size: 22, bare: true },
    })

    expect(wrapper.find('.bare').exists()).toBe(false)
    expect(wrapper.find('.tile').exists()).toBe(false)
  })

  it('tanpa `bare`, tile berbingkai tetap dirender (default tidak berubah)', async () => {
    const wrapper = await mountSuspended(HabitIcon, { props: { habit: HABIT, size: 42 } })

    expect(wrapper.find('.bare').exists()).toBe(false)
    expect(wrapper.find('.tile').exists()).toBe(true)
  })
})
