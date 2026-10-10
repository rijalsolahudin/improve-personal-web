import type { Goal, GoalItem, GoalItemKind } from '~/utils/goals'
import { addDays } from '~/utils/time'

/**
 * Data contoh fase 1 (isi Home Desktop.dc.html), tanggal relatif ke `today` supaya
 * status chapter tetap masuk akal kapan pun dibuka. Diganti repository lokal (packages/core).
 */
export function createGoalsMock(today: string): Goal[] {
  let seq = 0
  const item = (
    kind: GoalItemKind,
    title: string,
    meta: string,
    progress: boolean | number,
  ): GoalItem => ({
    id: `gi${(seq += 1)}`,
    kind,
    title,
    meta,
    done: progress === true,
    rate: typeof progress === 'number' ? progress : 0,
  })
  const d = (offset: number): string => addDays(today, offset)
  const chapter = (id: string, title: string, start: number, end: number, items: GoalItem[]) => ({
    id,
    title,
    start: d(start),
    end: d(end),
    isManualDone: false,
    isClosed: false,
    items,
  })

  return [
    {
      id: 'aws',
      title: 'Lulus AWS SAA',
      why: 'Biar bisa pindah ke role cloud engineer tahun depan.',
      category: 'karier',
      status: 'aktif',
      start: d(-38),
      end: d(173),
      cover: 'aktivitas/belajar',
      along: [item('habit', 'Tidur ≤ 23:00', 'Tiap hari', 78)],
      chapters: [
        {
          ...chapter('aws-1', 'Kuasai materi', -38, -9, [
            item('habit', 'Belajar 1 jam/hari', 'Tiap hari', 90),
            item('jadwal', 'Kelas online', 'Sel & Kam 19:00', 100),
            item('task', 'Selesai modul 1–6', 'Deadline 28 Sep', true),
          ]),
          isManualDone: true,
        },
        chapter('aws-2', 'Latihan soal', -8, 52, [
          item('task', 'Set soal A', 'Selesai 3 Okt', true),
          item('task', '20 soal domain Keamanan', 'Deadline 9 Okt', false),
          item('task', 'Set soal B', 'Deadline 20 Okt', false),
          item('habit', 'Review flashcard', 'Sen–Jum', 40),
        ]),
        chapter('aws-3', 'Tryout', 53, 173, [
          item('task', 'Tryout 1', 'Deadline 15 Des', false),
          item('task', 'Tryout 2', 'Deadline 20 Jan', false),
          item('task', 'Tryout 3', 'Deadline 20 Feb', false),
        ]),
      ],
    },
    {
      id: 'run',
      title: 'Lari 10K',
      why: 'Pengen badan lebih fit dan ikut race akhir tahun.',
      category: 'kesehatan',
      status: 'aktif',
      start: d(-69),
      end: d(66),
      cover: 'aktivitas/olahraga',
      along: [item('task', 'Daftar race Desember', 'Deadline 1 Nov', false)],
      chapters: [
        chapter('run-1', 'Bangun base 5K', -69, -24, [
          item('habit', 'Lari 3x seminggu', 'Sen, Rab, Sab', 70),
        ]),
        chapter('run-2', 'Tempo run', -23, 37, [
          item('habit', 'Tempo 5K tiap Sabtu', 'Sab', 50),
          item('jadwal', 'Lari bareng komunitas', 'Min 06:00', 66),
        ]),
        chapter('run-3', 'Race prep', 38, 66, []),
      ],
    },
    {
      id: 'fund',
      title: 'Dana darurat 6 bulan',
      why: 'Biar tenang kalau ada kejadian nggak terduga.',
      category: 'keuangan',
      status: 'aktif',
      start: d(-130),
      end: d(234),
      cover: null,
      along: [
        item('habit', 'Catat pengeluaran', 'Tiap hari', 82),
        item('task', 'Atur auto-debit tabungan', 'Selesai 5 Jun', true),
        item('task', 'Tutup kartu kredit kedua', 'Deadline 31 Okt', false),
      ],
      chapters: [],
    },
    {
      id: 'read',
      title: 'Baca 12 buku',
      why: 'Biasain baca lagi tiap hari.',
      category: 'diri',
      status: 'selesai',
      start: d(-281),
      end: d(-9),
      cover: null,
      along: [item('habit', 'Baca 10 halaman', 'Tiap hari', 100)],
      chapters: [],
    },
    {
      id: 'fam',
      title: 'Telepon ortu tiap minggu',
      why: 'Biar tetap dekat walau beda kota.',
      category: 'relasi',
      status: 'ditunda',
      start: d(-100),
      end: d(83),
      cover: null,
      along: [item('habit', 'Telepon Minggu malam', 'Min', 30)],
      chapters: [],
    },
  ]
}
