import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import DailyHeader from './DailyHeader.vue'

/**
 * Regresi design v2: header Daily hanya memuat satu ringkasan progres (ProgressRing +
 * "{done}/{total} · {percent}%"). Deretan chip angka Fokus/Habit/Jadwal sudah dihapus; shortcut itu
 * kini tidak ada di header (lihat trade-off di laporan task).
 */
const NOW = new Date(2026, 9, 19, 9, 0).getTime()

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function mountHeader(done: number, total: number, percent: number) {
  const wrapper = await mountSuspended(DailyHeader, {
    props: { weather: null, now: NOW, progress: { done, total, percent } },
  })
  mounted.push(wrapper)
  return wrapper
}

describe('DailyHeader - satu ringkasan progres', () => {
  it('menampilkan ProgressRing + "{done}/{total} · {percent}%"', async () => {
    const wrapper = await mountHeader(3, 4, 75)

    expect(wrapper.text()).toContain('3/4 · 75%')
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('tidak lagi merender chip angka Fokus/Habit/Jadwal', async () => {
    const wrapper = await mountHeader(3, 4, 75)

    expect(wrapper.findAll('.summary .chip')).toHaveLength(0)
    // Angka chip lama: "{n} mnt" dan "{n} acara".
    expect(wrapper.text()).not.toMatch(/\d+ mnt/)
    expect(wrapper.text()).not.toMatch(/\d+ acara/)
  })

  it('tetap merender tanggal dan sapaan', async () => {
    const wrapper = await mountHeader(0, 0, 0)

    expect(wrapper.get('.date').text()).not.toBe('')
    expect(wrapper.get('.greeting').text()).not.toBe('')
  })
})
