import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import type { RoutineItem } from '~/composables/useDailyRoutine'
import { ROUTINE_BLOCK_META } from '~/utils/dailyRoutine'

import DailyNowStrip from './DailyNowStrip.vue'

/**
 * Regresi Ergonio #89: strip "Sekarang" pernah menampilkan "Blok ini beres semua. Mantap!" saat blok
 * belum punya item sama sekali - keadaan yang wajar bagi user baru (tanpa jadwal & tanpa langkah).
 * "Kosong" dan "selesai semua" sama-sama punya `nextItem: null`, jadi yang membedakan hanya `total`.
 */
const EMPTY_COPY = 'Belum ada jadwal atau langkah untuk blok ini.'
const ALL_DONE_COPY = 'Blok ini beres semua. Mantap!'

const BLOCK_META = ROUTINE_BLOCK_META.pagi

function step(id: string, isDone: boolean): RoutineItem {
  return { kind: 'step', id, title: id, isDone }
}

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function mountStrip(items: readonly RoutineItem[]) {
  const wrapper = await mountSuspended(DailyNowStrip, {
    props: {
      current: {
        block: 'pagi',
        ...BLOCK_META,
        done: items.filter((item) => item.isDone).length,
        total: items.length,
        nextItem: items.find((item) => !item.isDone) ?? null,
      },
      next: null,
    },
  })
  mounted.push(wrapper)
  return wrapper
}

/** Copy keadaan blok ada di `.now-text`; `.next-empty` punya copy sendiri untuk jadwal berikutnya. */
function blockCopy(wrapper: VueWrapper): string {
  return wrapper.find('.now-text .hand').text()
}

describe('DailyNowStrip - keadaan blok (Ergonio #89)', () => {
  it('blok tanpa item: copy netral, bukan klaim selesai', async () => {
    const wrapper = await mountStrip([])

    expect(blockCopy(wrapper)).toBe(EMPTY_COPY)
    expect(wrapper.text()).not.toContain(ALL_DONE_COPY)
  })

  it('blok dengan semua item selesai: tetap "beres semua"', async () => {
    const wrapper = await mountStrip([step('sarapan', true), step('jalan', true)])

    expect(blockCopy(wrapper)).toBe(ALL_DONE_COPY)
    expect(wrapper.text()).not.toContain(EMPTY_COPY)
  })

  it('blok dengan item tersisa: tombol langkah berikutnya tetap tampil', async () => {
    const wrapper = await mountStrip([step('sarapan', true), step('jalan', false)])

    const nextStep = wrapper.find('.now-text .step')
    expect(nextStep.exists()).toBe(true)
    expect(nextStep.text()).toContain('jalan')
    expect(wrapper.text()).not.toContain(EMPTY_COPY)
    expect(wrapper.text()).not.toContain(ALL_DONE_COPY)

    await nextStep.trigger('click')
    expect(wrapper.emitted('toggle-item')?.[0]).toEqual([step('jalan', false)])
  })
})
