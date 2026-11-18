import type { Ref } from 'vue'

import { joinMemoText } from '~/utils/memo'
import {
  MEMO_FREE_BLOCK_MAX,
  MEMO_FREE_DEFAULT_WIDTH,
  clampFreeBlock,
  parseLayout,
  serializeLayout,
  type MemoFreeBlock,
  type MemoLayout,
} from '~/utils/memo/layout'

/** Bagian kertas yang bisa diketik: tulisan utama, kolom kanan, atau kotak bebas ke-n. */
export type MemoPart = 'main' | 'column' | `free:${number}`

export const freePart = (index: number): MemoPart => `free:${index}`

function freeIndex(part: MemoPart): number | null {
  return part.startsWith('free:') ? Number(part.slice(5)) : null
}

/**
 * Tata letak halaman jurnal di atas SATU teks (`text`, biasanya `draft.text`): bagian mana yang
 * sedang diketik, split 2 kolom, dan kotak teks bebas. Semua perubahan ditulis balik sebagai teks
 * berpagar (`utils/memo/layout.ts`), jadi draf/autosave tetap bekerja tanpa tahu soal tata letak.
 *
 * `max` = batas panjang teks tersimpan. Ketikan yang membuat teks berpagar melewati batas ditolak
 * utuh: memotong teks di belakang (seperti `slice` saat simpan) bisa memutus pagar.
 */
export function useMemoLayout(text: Ref<string>, max: number) {
  /**
   * Halaman tanpa tulisan disimpan sebagai teks kosong (split/kotak kosong bukan isi jurnal), jadi
   * bentuknya - split aktif, kotak yang baru ditaruh - dipegang di sini sampai ketikan pertama.
   * Dibuang begitu teks berubah dari luar (mis. pindah tanggal).
   */
  const emptyShape = ref<MemoLayout | null>(null)
  let written: string | null = null

  const layout = computed<MemoLayout>(() => {
    const shape = emptyShape.value
    return text.value === '' && shape !== null ? shape : parseLayout(text.value)
  })
  const active = ref<MemoPart>('main')

  /**
   * Identitas stabil per kotak bebas (tidak ikut disimpan) untuk `:key` render. Indeks tidak cukup:
   * membuang kotak di depan menggeser indeks, sehingga editor kotak yang sedang diketik dilepas dan
   * editor lain "mewarisi" posisinya dalam keadaan kosong dan tidak fokus.
   */
  let nextKey = 0
  const freshKeys = (length: number): number[] => Array.from({ length }, () => nextKey++)
  const keys = ref<number[]>(freshKeys(layout.value.blocks.length))
  const blockKeys = computed(() => layout.value.blocks.map((_, at) => keys.value[at] ?? -1 - at))

  watch(text, (value) => {
    if (value === written) return
    // Teks berubah dari luar (pindah tanggal, muat ulang): bentuk & identitas kotak dimulai ulang.
    emptyShape.value = null
    keys.value = freshKeys(layout.value.blocks.length)
  })

  function write(next: MemoLayout): boolean {
    const serialized = serializeLayout(next)
    if (serialized.length > max) return false
    emptyShape.value = serialized === '' ? next : null
    written = serialized
    text.value = serialized
    return true
  }

  function partText(part: MemoPart): string {
    const index = freeIndex(part)
    if (index !== null) return layout.value.blocks[index]?.text ?? ''
    return part === 'column' ? (layout.value.column ?? '') : layout.value.main
  }

  function setPart(part: MemoPart, value: string): boolean {
    const current = layout.value
    const index = freeIndex(part)
    if (index === null) {
      return write(part === 'column' ? { ...current, column: value } : { ...current, main: value })
    }
    if (current.blocks[index] === undefined) return false
    return write({
      ...current,
      blocks: current.blocks.map((block, at) => (at === index ? { ...block, text: value } : block)),
    })
  }

  /** Sisa panjang yang boleh dipakai satu bagian (dipakai editor untuk menolak ketikan berlebih). */
  function budget(part: MemoPart): number {
    return max - serializeLayout(layout.value).length + partText(part).length
  }

  const isSplit = computed(() => layout.value.column !== null)

  /** Matikan split: isi kolom kanan disambung ke akhir tulisan utama, tidak dibuang. */
  function toggleSplit(): void {
    const current = layout.value
    if (current.column === null) {
      write({ ...current, column: '' })
      return
    }
    write({ ...current, main: joinMemoText(current.main, current.column, max), column: null })
    if (active.value === 'column') active.value = 'main'
  }

  const canAddFree = computed(() => layout.value.blocks.length < MEMO_FREE_BLOCK_MAX)

  /** Kotak bebas baru di titik yang diklik, langsung jadi bagian aktif; `null` kalau penuh. */
  function addFree(position: Pick<MemoFreeBlock, 'x' | 'line'>): MemoPart | null {
    if (!canAddFree.value) return null
    const current = layout.value
    const block = clampFreeBlock({ ...position, width: MEMO_FREE_DEFAULT_WIDTH, text: '' })
    if (!write({ ...current, blocks: [...current.blocks, block] })) return null
    keys.value = [...keys.value.slice(0, current.blocks.length), nextKey++]
    const part = freePart(current.blocks.length)
    active.value = part
    return part
  }

  function moveFree(index: number, position: Pick<MemoFreeBlock, 'x' | 'line'>): void {
    const current = layout.value
    write({
      ...current,
      blocks: current.blocks.map((block, at) =>
        at === index ? clampFreeBlock({ ...block, ...position }) : block,
      ),
    })
  }

  /**
   * Kotak kosong dibuang supaya kertas tidak penuh kotak tak terlihat - kecuali kotak yang sedang
   * diketik. Dipanggil setelah fokus berpindah (bukan saat blur) supaya indeks bagian yang baru
   * mendapat fokus sudah pasti; bagian aktif ikut digeser ke indeks barunya.
   */
  function pruneEmpty(): void {
    const current = layout.value
    const activeIndex = freeIndex(active.value)
    const kept = current.blocks
      .map((block, at) => ({ block, at }))
      .filter(({ block, at }) => block.text.trim() !== '' || at === activeIndex)
    if (kept.length === current.blocks.length) return
    write({ ...current, blocks: kept.map(({ block }) => block) })
    keys.value = kept.map(({ at }) => keys.value[at] ?? nextKey++)
    if (activeIndex !== null)
      active.value = freePart(kept.findIndex(({ at }) => at === activeIndex))
  }

  return {
    layout,
    blockKeys,
    active: readonly(active),
    /** Bagian yang sedang diketik (dipanggil saat editor bagian itu mendapat fokus). */
    setActive: (part: MemoPart): void => {
      active.value = part
    },
    activeText: computed(() => partText(active.value)),
    partText,
    setPart,
    budget,
    isSplit,
    toggleSplit,
    canAddFree,
    addFree,
    moveFree,
    pruneEmpty,
  }
}

export type MemoLayoutModel = ReturnType<typeof useMemoLayout>
