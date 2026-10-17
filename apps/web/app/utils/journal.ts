// Isian harian halaman Journal (design `dl`: niat, kata hari ini, afirmasi, refleksi,
// daftar syukur/sedih/lebih baik). Fungsi murni; satu `JournalDay` per tanggal ISO.

export const INTENTION_MAX = 3
export const INTENTION_TEXT_MAX = 120
export const JOURNAL_WORD_MAX = 40
export const JOURNAL_NOTE_MAX = 2000
export const JOURNAL_LIST_ITEM_MAX = 200
/** Baris daftar minimal; selalu ada satu baris kosong setelah isian terakhir. */
export const JOURNAL_LIST_MIN_ROWS = 3

export const JOURNAL_LISTS = ['grat', 'sad', 'better'] as const
export type JournalListKey = (typeof JOURNAL_LISTS)[number]

export const JOURNAL_NOTES = ['affirm', 'reflect', 'feelingNote'] as const
export type JournalNoteKey = (typeof JOURNAL_NOTES)[number]

export interface Intention {
  id: string
  text: string
  done: boolean
  goalId: string | null
}

export interface JournalDay {
  word: string
  intentions: Intention[]
  affirm: string
  reflect: string
  /** Cerita singkat di kartu "Perasaan hari ini". */
  feelingNote: string
  grat: string[]
  sad: string[]
  better: string[]
}

export function emptyJournalDay(): JournalDay {
  return {
    word: '',
    intentions: [],
    affirm: '',
    reflect: '',
    feelingNote: '',
    grat: [],
    sad: [],
    better: [],
  }
}

/** `null` kalau teks kosong atau slot niat sudah penuh. */
export function addIntention(day: JournalDay, text: string, id: string): JournalDay | null {
  const clean = text.trim().slice(0, INTENTION_TEXT_MAX)
  if (!clean || day.intentions.length >= INTENTION_MAX) return null
  return { ...day, intentions: [...day.intentions, { id, text: clean, done: false, goalId: null }] }
}

export function updateIntention(
  day: JournalDay,
  id: string,
  change: (intention: Intention) => Intention,
): JournalDay {
  return {
    ...day,
    intentions: day.intentions.map((intention) =>
      intention.id === id ? change(intention) : intention,
    ),
  }
}

export function removeIntention(day: JournalDay, id: string): JournalDay {
  return { ...day, intentions: day.intentions.filter((intention) => intention.id !== id) }
}

/** Klik chip goal: tanpa goal → goal aktif pertama → … → kembali tanpa goal (design `cycleGoal`). */
export function nextGoalId(current: string | null, activeIds: readonly string[]): string | null {
  const ring = [null, ...activeIds]
  // Goal yang sudah tidak aktif (indexOf -1) diperlakukan seperti "tanpa goal".
  const index = Math.max(0, ring.indexOf(current))
  return ring[(index + 1) % ring.length] ?? null
}

/** Baris yang ditampilkan: minimal 3, plus satu kosong setelah isian terakhir. */
export function listRows(items: readonly string[]): string[] {
  const last = items.findLastIndex((item) => item.trim() !== '')
  const count = Math.max(JOURNAL_LIST_MIN_ROWS, last + 2)
  return Array.from({ length: count }, (_, index) => items[index] ?? '')
}

/** Isi satu baris; ekor kosong di atas batas minimal dibuang supaya data tidak menumpuk. */
export function setListItem(items: readonly string[], index: number, value: string): string[] {
  const next = [...items]
  while (next.length <= index) next.push('')
  next[index] = value.slice(0, JOURNAL_LIST_ITEM_MAX)
  while (next.length > JOURNAL_LIST_MIN_ROWS && !next.at(-1)?.trim()) next.pop()
  return next
}
