import { describe, expect, it } from 'vitest'

import {
  MEMO_TEXT_MAX,
  goalMentionQuery,
  insertGoalMention,
  insertMention,
  joinMemoText,
  journalDates,
  matchesQuery,
  memoOn,
  memosOn,
  mentionQuery,
  plainText,
  splitMentions,
  wordCount,
  type Memo,
} from './memo'

const memo = (overrides: Partial<Memo> = {}): Memo => ({
  id: 'm',
  date: '2026-10-09',
  createdAt: 1,
  title: '',
  text: '',
  feelings: [],
  paper: 'krem',
  ...overrides,
})
const titleOf = (id: string): string | null => ({ aws: 'Kelas AWS' })[id] ?? null

describe('mention jadwal', () => {
  it('pecah teks jadi teks + mention', () => {
    expect(splitMentions('Habis @[aws], lanjut @[old]!')).toEqual([
      { kind: 'text', text: 'Habis ' },
      { kind: 'mention', scheduleId: 'aws' },
      { kind: 'text', text: ', lanjut ' },
      { kind: 'mention', scheduleId: 'old' },
      { kind: 'text', text: '!' },
    ])
    expect(splitMentions('tanpa mention')).toEqual([{ kind: 'text', text: 'tanpa mention' }])
  })

  it('jadwal terhapus tidak error, jadi label pengganti', () => {
    expect(plainText('ke @[aws] lalu @[old]', titleOf, 'jadwal dihapus')).toBe(
      'ke @Kelas AWS lalu @jadwal dihapus',
    )
  })

  it('mention goal (#) jadi segmen sendiri & aman saat goal dihapus', () => {
    expect(splitMentions('Progress #[goal-1] bagus')).toEqual([
      { kind: 'text', text: 'Progress ' },
      { kind: 'goal-mention', goalId: 'goal-1' },
      { kind: 'text', text: ' bagus' },
    ])
    const goalTitleOf = (id: string): string | null => (id === 'goal-1' ? 'Lari 10K' : null)
    expect(
      plainText('lihat #[goal-1] dan #[gone]', titleOf, 'jadwal', goalTitleOf, 'goal dihapus'),
    ).toBe('lihat #Lari 10K dan #goal dihapus')
  })

  it('autocomplete goal: deteksi #kata di akhir & sisipkan token', () => {
    expect(goalMentionQuery('Progress #la')).toBe('la')
    expect(goalMentionQuery('tag #bukan mention di tengah #la')).toBe('la')
    expect(insertGoalMention('Progress #la', 'goal-1')).toBe('Progress #[goal-1] ')
  })

  it('autocomplete: deteksi @kata di akhir & sisipkan token', () => {
    expect(mentionQuery('Tadi ikut @ke')).toBe('ke')
    expect(mentionQuery('Tadi ikut @')).toBe('')
    expect(mentionQuery('email a@b.c selesai')).toBeNull()
    expect(insertMention('Tadi ikut @ke', 'aws')).toBe('Tadi ikut @[aws] ')
  })
})

describe('gabung teks & batas panjang', () => {
  it('menyambung dua bagian jadi paragraf tanpa baris kosong berlebih', () => {
    expect(joinMemoText('Isi lama.  ', '  Tambahan.  ')).toBe('Isi lama.\n\nTambahan.')
    expect(joinMemoText('', 'Hanya tambahan')).toBe('Hanya tambahan')
    expect(joinMemoText('Hanya isi', '   ')).toBe('Hanya isi')
  })

  it('saat batas tercapai, teks pertama dipotong lebih dulu - catatan penulis luar utuh', () => {
    const external = 'Catatan review goal'
    const joined = joinMemoText('A'.repeat(MEMO_TEXT_MAX), external)

    expect(joined).toHaveLength(MEMO_TEXT_MAX)
    expect(joined.endsWith(external)).toBe(true)
  })

  it('catatan luar yang sendiri melebihi batas dipotong ke batas', () => {
    const joined = joinMemoText('Isi user', 'B'.repeat(MEMO_TEXT_MAX + 50))
    expect(joined).toHaveLength(MEMO_TEXT_MAX)
    expect(joined).not.toContain('Isi user')
  })
})

describe('daftar & cari', () => {
  it('cari di judul, teks polos (judul jadwal), dan perasaan', () => {
    const entry = memo({ title: 'Minggu', text: 'ikut @[aws]', feelings: ['capek'] })
    const plain = (text: string): string => plainText(text, titleOf, 'x')
    expect(matchesQuery(entry, 'kelas', plain)).toBe(true)
    expect(matchesQuery(entry, 'CAPEK', plain)).toBe(true)
    expect(matchesQuery(entry, 'renang', plain)).toBe(false)
    expect(matchesQuery(entry, '  ', plain)).toBe(true)
  })

  it('tanggal jurnal unik, terbaru dulu, tanpa tanggal depan', () => {
    const dates = journalDates(
      [memo({ date: '2026-10-05' }), memo({ date: '2026-10-05' }), memo({ date: '2026-10-20' })],
      { '2026-10-01': 2 },
      '2026-10-09',
    )
    expect(dates).toEqual(['2026-10-09', '2026-10-05', '2026-10-01'])
  })

  it('memo per tanggal terbaru dulu & hitung kata', () => {
    const list = [
      memo({ id: 'a', createdAt: 1 }),
      memo({ id: 'b', createdAt: 2 }),
      memo({ id: 'c', date: 'x' }),
    ]
    expect(memosOn(list, '2026-10-09').map((item) => item.id)).toEqual(['b', 'a'])
    expect(wordCount('  dua  kata ')).toBe(2)
    expect(wordCount('')).toBe(0)
  })

  it('halaman jurnal satu tanggal: yang pertama ketemu, null kalau belum ada', () => {
    const list = [memo({ id: 'a', date: '2026-10-05' }), memo({ id: 'b', date: '2026-10-09' })]
    expect(memoOn(list, '2026-10-09')?.id).toBe('b')
    expect(memoOn(list, '2026-10-06')).toBeNull()
  })
})
