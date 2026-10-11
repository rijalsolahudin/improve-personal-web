import { MS_PER_DAY } from '~/utils/time'

import type { HomeSnapshot } from './types'

/**
 * DATA DUMMY untuk fase 1 (belum ada DB lokal / packages/core).
 * Isi mengikuti contoh di Home Desktop.dc.html & Home Mobile.dc.html. Semua waktu relatif
 * terhadap `now` supaya deterministik di test. Akan diganti repository dari packages/core.
 */

export function createHomeMock(now: number): HomeSnapshot {
  const daysFromNow = (days: number): number => now + days * MS_PER_DAY

  return {
    goal: {
      id: 'g-aws',
      title: 'Lulus AWS SAA',
      category: 'karier',
      progress: 31,
      endsAt: daysFromNow(176),
      nextItem: '20 soal domain Keamanan',
      chapters: [
        { id: 'c1', title: 'Kuasai materi', progress: 100 },
        { id: 'c2', title: 'Latihan soal', progress: 48 },
        { id: 'c3', title: 'Tryout', progress: 0 },
      ],
    },
    productiveStreak: 12,
  }
}
