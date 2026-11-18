// Memo / jurnal (PRD F8), mengikuti Home Desktop.dc.html `memoVals`. Fungsi murni.
// Mention jadwal disimpan sebagai token `@[<scheduleId>]` di teks; tampil sebagai chip.

import type { MemoPaperName } from '@improve-personal/tokens'

import { richToPlain } from './memo/richtext'

export const MEMO_TEXT_MAX = 5000
export const MEMO_TITLE_MAX = 120
export const MOOD_COUNT = 5
/** Perasaan cepat (design `mTags`). */
export const MEMO_FEELINGS = [
  'bersyukur',
  'tenang',
  'semangat',
  'bangga',
  'capek',
  'cemas',
  'kesal',
  'sedih',
] as const
export type MemoFeeling = (typeof MEMO_FEELINGS)[number]

export interface Memo {
  id: string
  /** Tanggal halaman jurnal (ISO), bisa beda dengan waktu tulis. */
  date: string
  createdAt: number
  title: string
  text: string
  feelings: MemoFeeling[]
  paper: MemoPaperName
}

/** Mood satu per hari: indeks 0 (berat) … 4 (bahagia). */
export type MoodByDate = Record<string, number>

// ---- Mention jadwal ------------------------------------------------------------------

const MENTION_TOKEN = /([@#])\[([\w-]{1,64})\]/g
/** `@kata` yang sedang diketik di akhir teks (pemicu autocomplete jadwal). */
const TRAILING_QUERY = /@([^\s@[]*)$/
/** `#kata` yang sedang diketik di akhir teks (pemicu autocomplete goal/chapter). */
const TRAILING_GOAL_QUERY = /#([^\s#[\]]*)$/

/** Teks polos untuk pencarian & pratinjau: penanda format dibuang, mention jadi `@judul` / `#judul`. */
export function plainText(
  text: string,
  titleOf: (id: string) => string | null,
  deleted: string,
  goalTitleOf: (id: string) => string | null = () => null,
  deletedGoal = deleted,
): string {
  return richToPlain(text).replace(MENTION_TOKEN, (_, sigil: string, id: string) =>
    sigil === '#' ? `#${goalTitleOf(id) ?? deletedGoal}` : `@${titleOf(id) ?? deleted}`,
  )
}

export function mentionQuery(text: string): string | null {
  return TRAILING_QUERY.exec(text)?.[1] ?? null
}

/** `#kata` yang sedang diketik di akhir teks; `null` kalau tidak sedang mengetik mention goal. */
export function goalMentionQuery(text: string): string | null {
  return TRAILING_GOAL_QUERY.exec(text)?.[1] ?? null
}

/** Ganti `@kata` terakhir dengan token mention + spasi. */
export function insertMention(text: string, scheduleId: string): string {
  return text.replace(TRAILING_QUERY, `@[${scheduleId}] `)
}

/** Ganti `#kata` terakhir dengan token mention goal + spasi. */
export function insertGoalMention(text: string, goalId: string): string {
  return text.replace(TRAILING_GOAL_QUERY, `#[${goalId}] `)
}

// ---- Daftar & pencarian --------------------------------------------------------------

export function matchesQuery(memo: Memo, query: string, plain: (text: string) => string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return `${memo.title} ${plain(memo.text)} ${memo.feelings.join(' ')}`.toLowerCase().includes(q)
}

/** Tanggal di strip jurnal: hari ini + tanggal ber-memo/mood, terbaru dulu. */
export function journalDates(memos: readonly Memo[], moods: MoodByDate, today: string): string[] {
  return [...new Set([today, ...memos.map((memo) => memo.date), ...Object.keys(moods)])]
    .filter((day) => day <= today)
    .sort()
    .reverse()
}

export function memosOn(memos: readonly Memo[], day: string): Memo[] {
  return memos.filter((memo) => memo.date === day).sort((a, b) => b.createdAt - a.createdAt)
}

/** Halaman jurnal satu tanggal (PRD F8: satu halaman per hari). */
export function memoOn(memos: readonly Memo[], day: string): Memo | null {
  return memos.find((memo) => memo.date === day) ?? null
}

/**
 * Sambung teks `lead` + `tail` jadi dua paragraf, dengan `tail` (catatan penulis lain) yang
 * DIPRIORITASKAN saat melewati `MEMO_TEXT_MAX`.
 *
 * Alasannya bukan selera: `tail` biasanya ditulis fitur lain (kartu review goal -> `memos.append`)
 * setelah draf user dibuat. Kalau pemotongan dari depan (perilaku lama), justru catatan eksternal
 * yang dibuang diam-diam - QA #54 R1. Di sini `lead` yang dipotong lebih dulu; `tail` hanya
 * dipotong kalau dia sendiri sudah melebihi batas.
 */
export function joinMemoText(lead: string, tail: string, max = MEMO_TEXT_MAX): string {
  const left = lead.trimEnd()
  const right = tail.trim()
  if (!right) return left.slice(0, max)
  if (!left) return right.slice(0, max)

  const separator = '\n\n'
  const budget = max - right.length - separator.length
  if (budget <= 0) return right.slice(0, max)

  return `${left.slice(0, budget).trimEnd()}${separator}${right}`.slice(0, max)
}

/**
 * Rapikan isi sebelum disimpan: spasi di akhir dan spasi/tab di awal dibuang, tetapi baris kosong
 * di awal dipertahankan - kertas jurnal bisa ditulis mulai baris mana pun.
 */
export function tidyMemoText(text: string): string {
  return text.replace(/^[^\S\n]+/, '').trimEnd()
}

/** Jumlah kata tulisan; penanda format (`**`, `==`, ...) tidak dihitung. */
export function wordCount(text: string): number {
  const plain = richToPlain(text).trim()
  return plain ? plain.split(/\s+/).length : 0
}

export function isMood(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < MOOD_COUNT
}
