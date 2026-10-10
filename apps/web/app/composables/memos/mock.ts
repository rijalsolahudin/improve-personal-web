import type { Memo, MoodByDate } from '~/utils/memo'
import { addDays, fromIsoDate } from '~/utils/time'

/**
 * Jurnal contoh fase 1 (isi Home Desktop.dc.html), tanggal relatif ke `today`.
 * `@[old]` sengaja menunjuk jadwal yang sudah dihapus (edge case PRD F8).
 */
export function createMemosMock(today: string): { memos: Memo[]; moods: MoodByDate } {
  const at = (offset: number, hour: number, minute: number): number =>
    new Date(fromIsoDate(addDays(today, offset)).setHours(hour, minute)).getTime()
  return {
    memos: [
      {
        id: 'm1',
        date: addDays(today, -4),
        createdAt: at(-4, 21, 10),
        title: 'Minggu santai',
        text: 'Pagi ikut @[run], lumayan capek tapi seneng. Sorenya beresin catatan buat minggu depan.',
        feelings: ['capek', 'bersyukur'],
        paper: 'krem',
      },
      {
        id: 'm2',
        date: addDays(today, -7),
        createdAt: at(-7, 20, 50),
        title: 'Review mingguan',
        text: 'Habis @[rev]. Target minggu depan: selesaiin modul 4 sebelum @[aws] hari Selasa.',
        feelings: ['semangat'],
        paper: 'krem',
      },
      {
        id: 'm3',
        date: addDays(today, -8),
        createdAt: at(-8, 22, 5),
        title: '',
        text: 'Kelas tadi bahas IAM. Masih bingung soal policy, perlu ulang lagi di @[aws] berikutnya. Oh iya @[old] ternyata dibatalin.',
        feelings: [],
        paper: 'krem',
      },
    ],
    moods: { [addDays(today, -4)]: 4, [addDays(today, -7)]: 3, [addDays(today, -8)]: 2 },
  }
}
