import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import CalendarToolbar from '~/components/features/calendar/CalendarToolbar.vue'

/**
 * Toolbar Kalender: tombol nav, "Hari ini", pilih tampilan, dan "+ Jadwal" harus meneruskan aksi
 * ke halaman - bukan cuma bergaya benar. Test ini menjaga kontrak event-nya.
 */
describe('CalendarToolbar', () => {
  it('menampilkan rentang tanggal yang diberikan', async () => {
    const wrapper = await mountSuspended(CalendarToolbar, {
      props: { rangeLabel: 'September 2025', view: 'bulan' },
    })

    expect(wrapper.text()).toContain('September 2025')
  })

  it('memancarkan prev, today, next, dan create dari tombolnya masing-masing', async () => {
    const wrapper = await mountSuspended(CalendarToolbar, {
      props: { rangeLabel: '8 Sep – 14 Sep 2025', view: 'pekan' },
    })
    const byText = (label: string) => wrapper.findAll('button').find((b) => b.text() === label)

    await byText('‹')!.trigger('click')
    await byText('Hari ini')!.trigger('click')
    await byText('›')!.trigger('click')
    await byText('+ Jadwal')!.trigger('click')

    expect(wrapper.emitted('prev')).toHaveLength(1)
    expect(wrapper.emitted('today')).toHaveLength(1)
    expect(wrapper.emitted('next')).toHaveLength(1)
    expect(wrapper.emitted('create')).toHaveLength(1)
  })

  it('memilih tampilan lewat grup pilihan dan menandai yang aktif', async () => {
    const wrapper = await mountSuspended(CalendarToolbar, {
      props: { rangeLabel: 'September 2025', view: 'bulan' },
    })
    const option = (label: string) => wrapper.findAll('button').find((b) => b.text() === label)

    expect(option('Bulan')!.attributes('aria-pressed')).toBe('true')

    await option('Pekan')!.trigger('click')

    expect(wrapper.emitted('update:view')).toEqual([['pekan']])
  })
})
