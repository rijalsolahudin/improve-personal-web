import type { MemoFeeling } from '~/utils/memo'

/**
 * Draf halaman jurnal (judul, isi, perasaan) bersama editor & kartu "Perasaan hari ini".
 * Bertahan selama sesi (pindah halaman), tidak ditulis ke storage (isi jurnal = data pribadi).
 */
export function useMemoDraft() {
  const draft = useState('memo-draft', () => ({
    title: '',
    text: '',
    feelings: [] as MemoFeeling[],
  }))

  return {
    draft,
    toggleFeeling(feeling: MemoFeeling): void {
      const list = draft.value.feelings
      draft.value.feelings = list.includes(feeling)
        ? list.filter((item) => item !== feeling)
        : [...list, feeling]
    },
    clear(): void {
      draft.value = { title: '', text: '', feelings: [] }
    },
  }
}
