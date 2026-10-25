import {
  JOURNAL_NOTE_MAX,
  emptyJournalDay,
  setListItem,
  type JournalDay,
  type JournalListKey,
  type JournalNoteKey,
} from '~/utils/journal'

/**
 * Isian harian halaman Journal untuk tanggal `day`. Fase 1: in-memory seperti memo; isi jurnal
 * tidak ditulis ke localStorage (data pribadi; nanti terenkripsi lewat packages/core).
 *
 * Hari yang belum pernah diisi dimulai kosong - tidak ada isian contoh, supaya user tidak perlu
 * menghapus teks orang lain sebelum menulis.
 */
export function useJournalDay(day: MaybeRefOrGetter<string>) {
  const store = useState<Record<string, JournalDay>>('journal-days', () => ({}))

  const current = computed(() => store.value[toValue(day)] ?? emptyJournalDay())

  function update(next: JournalDay): void {
    store.value = { ...store.value, [toValue(day)]: next }
  }

  return {
    day: current,
    setNote(key: JournalNoteKey, value: string): void {
      update({ ...current.value, [key]: value.slice(0, JOURNAL_NOTE_MAX) })
    },
    setListItem(key: JournalListKey, index: number, value: string): void {
      update({ ...current.value, [key]: setListItem(current.value[key], index, value) })
    },
  }
}
