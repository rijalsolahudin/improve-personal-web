import {
  JOURNAL_NOTE_MAX,
  JOURNAL_WORD_MAX,
  addIntention,
  emptyJournalDay,
  nextGoalId,
  removeIntention,
  setListItem,
  updateIntention,
  type JournalDay,
  type JournalListKey,
  type JournalNoteKey,
} from '~/utils/journal'
import { toIsoDate } from '~/utils/time'

import { createJournalMock } from './journal/mock'

/**
 * Isian harian halaman Journal untuk tanggal `day`. Fase 1: in-memory seperti memo; isi jurnal
 * tidak ditulis ke localStorage (data pribadi; nanti terenkripsi lewat packages/core).
 */
export function useJournalDay(day: MaybeRefOrGetter<string>) {
  const store = useState('journal-days', () => createJournalMock(toIsoDate(new Date())))
  const { goals } = useGoals()

  const current = computed(() => store.value[toValue(day)] ?? emptyJournalDay())

  function update(next: JournalDay): void {
    store.value = { ...store.value, [toValue(day)]: next }
  }

  return {
    day: current,
    setWord(value: string): void {
      update({ ...current.value, word: value.slice(0, JOURNAL_WORD_MAX) })
    },
    setNote(key: JournalNoteKey, value: string): void {
      update({ ...current.value, [key]: value.slice(0, JOURNAL_NOTE_MAX) })
    },
    setListItem(key: JournalListKey, index: number, value: string): void {
      update({ ...current.value, [key]: setListItem(current.value[key], index, value) })
    },
    /** `false` kalau teks kosong atau sudah 3 niat. */
    addIntention(text: string): boolean {
      const next = addIntention(current.value, text, crypto.randomUUID())
      if (next) update(next)
      return next !== null
    },
    toggleIntention(id: string): void {
      update(updateIntention(current.value, id, (item) => ({ ...item, done: !item.done })))
    },
    removeIntention(id: string): void {
      update(removeIntention(current.value, id))
    },
    cycleGoal(id: string): void {
      const active = goals.value.filter((goal) => goal.status === 'aktif').map((goal) => goal.id)
      update(
        updateIntention(current.value, id, (item) => ({
          ...item,
          goalId: nextGoalId(item.goalId, active),
        })),
      )
    },
  }
}
