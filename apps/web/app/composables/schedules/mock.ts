import type { Recurrence, Schedule } from '~/utils/schedule'
import { addDays } from '~/utils/time'

/**
 * Jadwal contoh fase 1 (isi Home Desktop.dc.html), tanggal relatif ke `today`.
 * Diganti repository lokal (packages/core).
 */
export function createSchedulesMock(today: string): Schedule[] {
  const schedule = (
    id: string,
    title: string,
    color: number,
    startOffset: number,
    time: string,
    dur: number,
    rec: Recurrence,
    extra: Partial<Schedule> = {},
  ): Schedule => ({
    id,
    title,
    color,
    start: addDays(today, startOffset),
    time,
    dur,
    allDay: false,
    rec,
    until: null,
    exceptions: [],
    goalId: null,
    ...extra,
  })

  return [
    schedule(
      'aws',
      'Kelas online AWS',
      0,
      -38,
      '19:00',
      90,
      {
        type: 'weekly',
        days: [2, 4],
        interval: 1,
      },
      { goalId: 'aws' },
    ),
    schedule('gym', 'Gym', 1, -38, '17:00', 60, { type: 'weekly', days: [1, 3, 5], interval: 1 }),
    schedule(
      'run',
      'Lari bareng komunitas',
      2,
      -33,
      '06:00',
      90,
      {
        type: 'weekly',
        days: [0],
        interval: 1,
      },
      { goalId: 'run' },
    ),
    schedule('stand', 'Standup tim', 3, -38, '09:00', 30, {
      type: 'weekly',
      days: [1, 2, 3, 4, 5],
      interval: 1,
    }),
    schedule('rev', 'Review mingguan', 4, -7, '20:00', 45, {
      type: 'weekly',
      days: [5],
      interval: 2,
    }),
    schedule('kos', 'Bayar kos', 5, -38, '00:00', 1440, { type: 'monthly' }, { allDay: true }),
    schedule('doc', 'Dokter gigi', 6, 5, '10:00', 60, { type: 'once' }),
  ]
}
