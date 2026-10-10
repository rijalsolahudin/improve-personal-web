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
    countdowns: [
      { id: 'cd1', title: 'Ulang tahun Ibu', at: daysFromNow(12), tint: '#FCE0F2', ink: '#B02A6A' },
      { id: 'cd2', title: 'Ujian AWS SAA', at: daysFromNow(41), tint: '#F7C6DA', ink: '#8E2A5A' },
      { id: 'cd3', title: 'Liburan Bali', at: daysFromNow(73), tint: '#C7E3EE', ink: '#1E5D78' },
      { id: 'cd4', title: 'Gajian', at: daysFromNow(18), tint: '#CDE8C6', ink: '#2E6A26' },
    ],
    productiveStreak: 12,
  }
}
