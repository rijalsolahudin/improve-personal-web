import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import type { Habit } from '~/utils/habits'

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
