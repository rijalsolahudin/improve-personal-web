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
    moods: createMoods(today),
  }
}

/** Mood deterministik ~30 hari terakhir (tanggal dari memo contoh tetap dipakai). */
function createMoods(today: string): MoodByDate {
  const moods: MoodByDate = {
    [addDays(today, -4)]: 4,
    [addDays(today, -7)]: 3,
    [addDays(today, -8)]: 2,
  }
  let seed = 777
  for (let offset = 1; offset <= 30; offset += 1) {
    seed = (seed * 9301 + 49_297) % 233_280
    const day = addDays(today, -offset)
    if (moods[day] === undefined) moods[day] = 1 + Math.floor((seed / 233_280) * 4)
  }
  return moods
}
