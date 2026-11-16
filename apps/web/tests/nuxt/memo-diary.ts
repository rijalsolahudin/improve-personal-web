import { flushPromises, type VueWrapper } from '@vue/test-utils'

import type { MemoDraftValues } from '~/composables/useMemoDraft'

/**
 * Kertas jurnal sekarang editor rich text (contenteditable ProseMirror), bukan `<textarea>`. Test
 * halaman menulis lewat draf yang sama dengan yang diikat editor (`v-model="draft.text"`);
 * mensimulasikan ketikan ProseMirror di happy-dom tidak menguji apa pun milik app ini.
 */
const draft = () => useState<MemoDraftValues>('memo-draft')

export async function typeDiary(text: string): Promise<void> {
  draft().value.text = text
  await flushPromises()
}

/** Isi tulisan yang sedang terbuka di editor (markdown jurnal). */
export const diaryValue = (): string => draft().value.text

export const hasDiary = (wrapper: VueWrapper): boolean =>
  wrapper.find('section.sheet .page').exists()
