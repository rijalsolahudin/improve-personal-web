// Isian harian halaman Journal (design `dl`: afirmasi, refleksi, cerita perasaan,
// daftar syukur/sedih/lebih baik). Fungsi murni; satu `JournalDay` per tanggal ISO.

export const JOURNAL_NOTE_MAX = 2000
export const JOURNAL_LIST_ITEM_MAX = 200
/** Baris daftar minimal; selalu ada satu baris kosong setelah isian terakhir. */
export const JOURNAL_LIST_MIN_ROWS = 3

export const JOURNAL_LISTS = ['grat', 'sad', 'better'] as const
export type JournalListKey = (typeof JOURNAL_LISTS)[number]

export const JOURNAL_NOTES = ['affirm', 'reflect', 'feelingNote'] as const
export type JournalNoteKey = (typeof JOURNAL_NOTES)[number]

export interface JournalDay {
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
    affirm: '',
    reflect: '',
    feelingNote: '',
    grat: [],
    sad: [],
    better: [],
  }
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
