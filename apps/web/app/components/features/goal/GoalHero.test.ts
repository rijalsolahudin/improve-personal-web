import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import type { Goal } from '~/utils/goals'

import GoalHero from './GoalHero.vue'

/**
 * Regresi #92: "Buat countdown" memakai `class="btn solid"` padahal `.btn`/`.solid` hanya hidup di
 * style scoped `ui/Button`, jadi link tampil polos. Kontrak perilakunya: CTA wajib memakai kelas
 * lokal `countdown`, bukan kelas global `btn`, dan tetap menuju countdown dengan judul+tanggal goal.
 * (happy-dom tidak menghitung CSS; gaya pill-nya dibuktikan manual di browser saat handoff.)
 */
const GOAL: Goal = {
  id: '018f2c4e-0000-7000-8000-000000000092',
  title: 'Lulus AWS SAA',
  why: 'Biar bisa pindah tim',
  category: 'karier',
  status: 'aktif',
  start: '2026-10-01',
  end: '2026-12-31',
  cover: null,
  along: [],
  chapters: [],
}

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function mountHero() {
  const wrapper = await mountSuspended(GoalHero, {
    props: { goal: GOAL, today: '2026-10-25' },
  })
  mounted.push(wrapper)
  return wrapper
}

describe('GoalHero - CTA countdown (#92)', () => {
  it('memakai kelas lokal, bukan .btn global yang tidak berlaku di komponen ini', async () => {
    const wrapper = await mountHero()

    const link = wrapper.get('a')
    expect(link.classes()).toContain('countdown')
    expect(link.classes()).not.toContain('btn')
  })

  it('berlabel "Buat countdown" dan membawa judul + target goal ke halaman countdown', async () => {
    const wrapper = await mountHero()

    const link = wrapper.get('a')
    expect(link.text()).toContain('Buat countdown')
    expect(link.attributes('href')).toContain('/app/countdown')
    expect(link.attributes('href')).toContain('title=Lulus+AWS+SAA')
    expect(link.attributes('href')).toContain('date=2026-12-31')
  })
})
