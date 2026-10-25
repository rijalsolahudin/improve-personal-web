import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import DailyCardHead from './DailyCardHead.vue'

/**
 * Regresi QA #91 BUG-1: isi bar progres kepala kartu Daily pernah 0px karena `.track` yang flex
 * menyusutkan root ProgressBar. happy-dom tidak punya layout engine (`getBoundingClientRect`
 * selalu 0), jadi unit test menjaga bagian yang bisa diamati di DOM (bar, aria, tinggi, isi pct);
 * geometri 56x7 + isi 80% = 44.8px dibuktikan di Chrome headless saat handoff.
 */
const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function mountHead(pct = 80) {
  const wrapper = await mountSuspended(DailyCardHead, {
    props: {
      icon: 'list-checks',
      color: '--icon-todo',
      title: 'To-do hari ini',
      titleId: 'daily-todo-title',
      linkLabel: 'Lihat semua to-do',
      linkTo: '/app/to-do',
      pct,
      meta: '8/10 selesai',
    },
  })
  mounted.push(wrapper)
  return wrapper
}

describe('DailyCardHead - bar progres (QA #91)', () => {
  it('merender bar 7px dengan isi selebar pct, bukan elemen kosong', async () => {
    const wrapper = await mountHead(80)

    const bar = wrapper.find('.track .bar')
    expect(bar.exists()).toBe(true)
    expect(bar.attributes('role')).toBe('progressbar')
    expect(bar.attributes('aria-valuenow')).toBe('80')
    expect(bar.attributes('style')).toContain('height: 7px')

    const fill = bar.find('span')
    expect(fill.attributes('style')).toContain('width: 80%')
    expect(wrapper.text()).toContain('8/10 selesai')
  })
})
