import { emptyJournalDay, type JournalDay } from '~/utils/journal'

/** DATA DUMMY fase 1 (design `DEF_DAY`): isian hari ini. Diganti repository dari packages/core. */
export function createJournalMock(today: string): Record<string, JournalDay> {
  return {
    [today]: {
      ...emptyJournalDay(),
      word: 'Pelan-pelan',
      intentions: [
        { id: 'i1', text: 'Fokus satu hal dulu, baru pindah', done: false, goalId: 'aws' },
        { id: 'i2', text: 'Makan siang tanpa HP', done: false, goalId: null },
      ],
    },
  }
}
