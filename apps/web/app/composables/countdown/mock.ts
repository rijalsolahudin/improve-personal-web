import type { Countdown } from '~/utils/countdown'
import { MS_PER_DAY, toIsoDate } from '~/utils/time'

/**
 * DATA DUMMY fase 1 (belum ada DB lokal / packages/core). Waktu relatif ke `now`
 * supaya deterministik di test. Akan diganti repository dari packages/core.
 */
export function createCountdownsMock(now: number): Countdown[] {
  const daysFromNow = (days: number): string => toIsoDate(new Date(now + days * MS_PER_DAY))

  return [
    {
      id: 'cd1',
      title: 'Ulang tahun Ibu',
      date: daysFromNow(12),
      time: '',
      emoji: '🎂',
      sticker: null,
      color: '#F03FBF',
      yearly: true,
      archived: false,
    },
    {
      id: 'cd2',
      title: 'Ujian AWS SAA',
      date: daysFromNow(41),
      time: '09:00',
      emoji: '🎓',
      sticker: null,
      color: '#9B4FC9',
      yearly: false,
      archived: false,
    },
    {
      id: 'cd3',
      title: 'Liburan Bali',
      date: daysFromNow(73),
      time: '',
      emoji: '✈️',
      sticker: null,
      color: '#10A8D8',
      yearly: false,
      archived: false,
    },
    {
      id: 'cd4',
      title: 'Gajian',
      date: daysFromNow(18),
      time: '',
      emoji: '💼',
      sticker: null,
      color: '#1DA20F',
      yearly: true,
      archived: false,
    },
  ]
}
