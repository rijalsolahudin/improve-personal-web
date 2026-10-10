import { MEMO_PAPER_NAMES, type MemoPaperName } from '@improve-personal/tokens'

import { MEMO_TEXT_MAX, MEMO_TITLE_MAX, isMood, type Memo, type MemoFeeling } from '~/utils/memo'
import { fromIsoDate, toIsoDate } from '~/utils/time'

import { createMemosMock } from './memos/mock'

/** Preferensi kertas (bukan isi jurnal) → localStorage, divalidasi saat dibaca. */
export const MEMO_PAPER_KEY = 'ip-memo-paper'

function readPaper(): MemoPaperName {
  if (!import.meta.client) return 'krem'
  try {
    const stored = localStorage.getItem(MEMO_PAPER_KEY)
    return (MEMO_PAPER_NAMES as readonly string[]).includes(stored ?? '')
      ? (stored as MemoPaperName)
      : 'krem'
  } catch {
    return 'krem'
  }
}

/** Memo hari lalu dicatat jam 20:00 (design). */
const PAST_ENTRY_HOUR = 20

export interface MemoInput {
  date: string
  title: string
  text: string
  feelings: MemoFeeling[]
  paper: MemoPaperName
}

/**
 * Jurnal (PRD F8) untuk halaman Memo, widget Home, dan panel Kalender. Fase 1: in-memory,
 * sama seperti fitur lain. Isi jurnal tidak ditulis ke localStorage (data pribadi; nanti
 * disimpan terenkripsi lewat packages/core).
 */
export function useMemos() {
  const store = useState('memos', () => createMemosMock(toIsoDate(new Date())))
  const paper = useState<MemoPaperName>('memo-paper', readPaper)

  function setPaper(next: MemoPaperName): void {
    paper.value = next
    try {
      localStorage.setItem(MEMO_PAPER_KEY, next)
    } catch {
      // Storage diblokir: pilihan kertas berlaku untuk sesi ini.
    }
  }

  /** Simpan entri; `false` kalau isi kosong. Judul & isi dipotong ke batas maksimal. */
  function add(input: MemoInput): boolean {
    const text = input.text.trim().slice(0, MEMO_TEXT_MAX)
    if (!text) return false
    const isToday = input.date === toIsoDate(new Date())
    const createdAt = isToday
      ? Date.now()
      : new Date(fromIsoDate(input.date).setHours(PAST_ENTRY_HOUR)).getTime()
    const memo: Memo = {
      id: crypto.randomUUID(),
      date: input.date,
      createdAt,
      title: input.title.trim().slice(0, MEMO_TITLE_MAX),
      text,
      feelings: [...input.feelings],
      paper: input.paper,
    }
    store.value = { ...store.value, memos: [memo, ...store.value.memos] }
    return true
  }

  function remove(id: string): void {
    store.value = { ...store.value, memos: store.value.memos.filter((memo) => memo.id !== id) }
  }

  /** Mood satu per hari; `null` menghapus. */
  function setMood(day: string, mood: number | null): void {
    const moods = Object.fromEntries(
      Object.entries(store.value.moods).filter(([entryDay]) => entryDay !== day),
    )
    if (isMood(mood)) moods[day] = mood
    store.value = { ...store.value, moods }
  }

  return {
    memos: computed(() => store.value.memos),
    moods: computed(() => store.value.moods),
    moodOn: (day: string): number | null => store.value.moods[day] ?? null,
    paper: readonly(paper),
    setPaper,
    add,
    remove,
    setMood,
  }
}
