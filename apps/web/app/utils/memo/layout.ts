// Tata letak halaman jurnal: tulisan utama, kolom kanan (mode split), dan kotak teks bebas yang
// ditaruh di titik mana pun di kertas. Fungsi murni.
//
// Tata letak disimpan DI DALAM teks jurnal (`diaryMd`) sebagai blok berpagar, bukan record baru:
//
//   tulisan utama…
//   ::: kolom
//   isi kolom kanan…
//   :::
//   ::: bebas 0.62 3 0.3
//   isi kotak bebas…
//   :::
//
// Alasannya: draf, autosave, penggabungan konflik, enkripsi, sync, dan export sudah bekerja di
// atas satu teks itu; tata letak ikut semuanya tanpa skema baru. Teks lama (tanpa pagar) terbaca
// apa adanya sebagai tulisan utama. Baris isi yang diawali `:::` di-escape oleh `serializeRich`,
// jadi tulisan user tidak pernah terbaca sebagai pagar.

/** Kotak teks bebas: posisi relatif ke kertas (`x`/`width` pecahan lebar, `line` indeks baris). */
export interface MemoFreeBlock {
  x: number
  line: number
  width: number
  text: string
}

export interface MemoLayout {
  main: string
  /** Isi kolom kanan; `null` = halaman tidak di-split. */
  column: string | null
  blocks: MemoFreeBlock[]
}

/** Pagar kotak bebas per halaman; menjaga render dan editor tetap ringan. */
export const MEMO_FREE_BLOCK_MAX = 12
/** Lebar minimal kotak bebas supaya tetap bisa diketik di layar sempit. */
export const MEMO_FREE_MIN_WIDTH = 0.2
/** Lebar bawaan kotak bebas baru (dipotong sampai tepi kanan kertas). */
export const MEMO_FREE_DEFAULT_WIDTH = 0.4
/** Indeks baris tertinggi (sama dengan batas baris sticker jurnal di core). */
export const MEMO_FREE_MAX_LINE = 400

const FENCE_CLOSE = ':::'
const FENCE_COLUMN = '::: kolom'
const FENCE_FREE = /^::: bebas (\S+) (\S+) (\S+)$/

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))

/** Rapikan posisi supaya selalu di dalam kertas (dipakai saat parse dan saat drag). */
export function clampFreeBlock(block: MemoFreeBlock): MemoFreeBlock {
  const x = clamp(block.x, 0, 1 - MEMO_FREE_MIN_WIDTH)
  return {
    x: round(x),
    line: Math.round(clamp(block.line, 0, MEMO_FREE_MAX_LINE)),
    width: round(clamp(block.width, MEMO_FREE_MIN_WIDTH, 1 - x)),
    text: block.text,
  }
}

/** Tiga desimal cukup untuk posisi di kertas dan menjaga teks tersimpan tetap pendek. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function parseLayout(text: string): MemoLayout {
  const main: string[] = []
  let column: string[] | null = null
  const blocks: MemoFreeBlock[] = []
  // Blok yang sedang dibaca; pagar tanpa penutup = sisa teks milik blok itu (tidak ada yang hilang).
  let open: { lines: string[]; free: Omit<MemoFreeBlock, 'text'> | null } | null = null

  const closeOpen = (): void => {
    if (open === null) return
    if (open.free === null) column = [...(column ?? []), ...open.lines]
    else if (blocks.length < MEMO_FREE_BLOCK_MAX) {
      blocks.push(clampFreeBlock({ ...open.free, text: open.lines.join('\n') }))
    }
    open = null
  }

  for (const line of text.split('\n')) {
    if (open !== null) {
      if (line === FENCE_CLOSE) closeOpen()
      else open.lines.push(line)
      continue
    }
    if (line === FENCE_COLUMN) {
      open = { lines: [], free: null }
      continue
    }
    const free = FENCE_FREE.exec(line)
    if (free) {
      open = {
        lines: [],
        free: { x: Number(free[1]), line: Number(free[2]), width: Number(free[3]) },
      }
      continue
    }
    main.push(line)
  }
  closeOpen()

  return {
    main: main.join('\n'),
    column: column === null ? null : (column as string[]).join('\n'),
    blocks,
  }
}

/** `true` kalau halaman tidak punya tulisan sama sekali (pagar kosong tidak dihitung). */
export function isLayoutEmpty(layout: MemoLayout): boolean {
  return layoutParts(layout).every((part) => part.trim() === '')
}

export function serializeLayout(layout: MemoLayout): string {
  const hasShape = layout.column !== null || layout.blocks.length > 0
  // Tanpa kolom/kotak, tulisan utama disimpan apa adanya (baris kosong yang sedang diketik tetap ada).
  if (!hasShape) return layout.main
  // Split/kotak tanpa tulisan apa pun bukan isi jurnal: disimpan sebagai teks kosong.
  if (isLayoutEmpty(layout)) return ''
  const out = [layout.main]
  if (layout.column !== null) out.push(FENCE_COLUMN, layout.column, FENCE_CLOSE)
  for (const block of layout.blocks.slice(0, MEMO_FREE_BLOCK_MAX)) {
    const { x, line, width } = clampFreeBlock(block)
    out.push(`::: bebas ${x} ${line} ${width}`, block.text, FENCE_CLOSE)
  }
  return out.join('\n')
}

/** Semua isi tulisan (utama, kolom, kotak) - dasar teks polos untuk cari, pratinjau, hitung kata. */
export function layoutParts(layout: MemoLayout): string[] {
  return [
    layout.main,
    ...(layout.column === null ? [] : [layout.column]),
    ...layout.blocks.map((block) => block.text),
  ]
}
