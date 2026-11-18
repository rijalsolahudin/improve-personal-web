// Klik di kertas jurnal yang tidak mengenai tulisan: lanjut menulis di baris itu, atau taruh kotak
// teks bebas di titik itu. Hanya membaca geometri DOM editor; tidak mengubah apa pun.

/** Tinggi satu baris kertas bergaris (sama dengan `line-height` kertas). */
export const MEMO_LINE_PX = 34
/** Jarak garis pertama dari tepi atas kertas (`padding-top` + `background-position`). */
export const MEMO_PAPER_TOP_PX = 6
/** Klik di bawah tulisan dalam porsi kiri ini = lanjut menulis di baris itu, bukan kotak bebas. */
const FILL_ZONE = 0.3
/** Jarak minimal dari ujung tulisan sebelum klik di samping tulisan dianggap titik kosong. */
const FREE_GAP_PX = 48

export type PaperClick =
  /** Klik di bawah tulisan, sisi kiri: tambah `lines` baris kosong lalu tulis di baris terakhirnya. */
  | { kind: 'fill'; lines: number }
  /** Klik di titik kosong: taruh kotak teks bebas di sana. */
  | { kind: 'place' }

/** Ujung kanan teks pada baris visual di ketinggian `y`; tepi kiri elemen kalau barisnya kosong. */
function textEnd(element: Element, y: number): number {
  const range = document.createRange()
  range.selectNodeContents(element)
  const rights = [...range.getClientRects()]
    .filter((rect) => rect.width > 0 && y >= rect.top && y < rect.bottom)
    .map((rect) => rect.right)
  return rights.length ? Math.max(...rights) : element.getBoundingClientRect().left
}

/**
 * `root` = elemen ProseMirror. `null` = klik biasa (biarkan editor memindah kursor).
 */
export function classifyPaperClick(root: Element, x: number, y: number): PaperClick | null {
  const lines = [...root.querySelectorAll(':scope > p, li')]
  const last = lines.at(-1)
  if (last === undefined) return null

  const bottom = last.getBoundingClientRect().bottom
  if (y >= bottom) {
    const box = root.getBoundingClientRect()
    if (x - box.left >= box.width * FILL_ZONE) return { kind: 'place' }
    return { kind: 'fill', lines: Math.floor((y - bottom) / MEMO_LINE_PX) + 1 }
  }

  const line = lines.find((element) => {
    const rect = element.getBoundingClientRect()
    return y >= rect.top && y < rect.bottom
  })
  if (line === undefined) return null
  return x - textEnd(line, y) > FREE_GAP_PX ? { kind: 'place' } : null
}
