// Memo / jurnal (PRD F8), mengikuti Home Desktop.dc.html `memoVals`. Fungsi murni.
// Mention jadwal disimpan sebagai token `@[<scheduleId>]` di teks; tampil sebagai chip.

import type { MemoPaperName } from '@improve-personal/tokens'

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

const MENTION_TOKEN = /@\[([\w-]{1,64})\]/g
/** `@kata` yang sedang diketik di akhir teks (pemicu autocomplete). */
const TRAILING_QUERY = /@([^\s@[]*)$/

export type MemoSegment = { kind: 'text'; text: string } | { kind: 'mention'; scheduleId: string }

export function splitMentions(text: string): MemoSegment[] {
  const segments: MemoSegment[] = []
  let last = 0
  for (const match of text.matchAll(MENTION_TOKEN)) {
    const index = match.index ?? 0
    if (index > last) segments.push({ kind: 'text', text: text.slice(last, index) })
    segments.push({ kind: 'mention', scheduleId: match[1] ?? '' })
    last = index + match[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) })
  return segments
}

/** Teks polos untuk pencarian & pratinjau: token mention diganti `@judul`. */
export function plainText(
  text: string,
  titleOf: (id: string) => string | null,
  deleted: string,
): string {
  return text.replace(MENTION_TOKEN, (_, id: string) => `@${titleOf(id) ?? deleted}`)
}

export function mentionQuery(text: string): string | null {
  return TRAILING_QUERY.exec(text)?.[1] ?? null
}

/** Ganti `@kata` terakhir dengan token mention + spasi. */
export function insertMention(text: string, scheduleId: string): string {
  return text.replace(TRAILING_QUERY, `@[${scheduleId}] `)
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

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

export function isMood(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < MOOD_COUNT
}
