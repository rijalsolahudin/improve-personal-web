import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { toCountdownView, type Countdown } from '~/utils/countdown'

import CountdownListCard from './CountdownListCard.vue'

/**
 * Kartu momen: kotak hari di kanan (design `dNum`/`dLbl`) dan chip arsip.
 *
 * happy-dom tidak menghitung CSS, jadi yang diuji konten yang dibaca user: angka/tanda hari,
 * label chip, dan aksi arsip yang hanya muncul untuk momen lewat/terarsip (regresi #99).
 */
const NOW = new Date(2026, 9, 25, 10, 0, 0).getTime()

const BASE: Countdown = {
  id: '018f2c4e-0000-7000-8000-000000000099',
  title: 'Ulang tahun Mama',
  date: '2026-10-27',
  time: '',
  emoji: '🎂',
  sticker: null,
  color: '#E2445C',
  yearly: false,
  archived: false,
}

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function mountCard(overrides: Partial<Countdown> = {}) {
  const view = toCountdownView({ ...BASE, ...overrides }, NOW)
  const wrapper = await mountSuspended(CountdownListCard, { props: { view, now: NOW } })
  mounted.push(wrapper)
  return wrapper
}

describe('CountdownListCard - kotak hari', () => {
  it('hari-H menampilkan 🎉 dengan label "Hari ini"', async () => {
    const wrapper = await mountCard({ date: '2026-10-25' })

    expect(wrapper.get('.badge-n').text()).toBe('🎉')
    expect(wrapper.get('.badge-l').text()).toBe('Hari ini')
  })

  it('besok menampilkan angka 1 dengan label "Besok"', async () => {
    const wrapper = await mountCard({ date: '2026-10-26' })

    expect(wrapper.get('.badge-n').text()).toBe('1')
    expect(wrapper.get('.badge-l').text()).toBe('Besok')
  })
})

describe('CountdownListCard - arsip', () => {
  it('momen yang akan datang tidak menawarkan arsip', async () => {
    const wrapper = await mountCard()

    expect(wrapper.find('.archive-btn').exists()).toBe(false)
  })

  it('momen lewat menawarkan "Arsipkan" dan melaporkan klik ke parent', async () => {
    const wrapper = await mountCard({ date: '2026-10-20' })
    const chip = wrapper.get('.archive-btn')

    expect(chip.text()).toBe('Arsipkan')
    await chip.trigger('click')
    expect(wrapper.emitted('archive')).toHaveLength(1)
  })

  it('momen terarsip menawarkan "Kembalikan"', async () => {
    const wrapper = await mountCard({ date: '2026-10-20', archived: true })

    expect(wrapper.get('.archive-btn').text()).toBe('Kembalikan')
  })
})
