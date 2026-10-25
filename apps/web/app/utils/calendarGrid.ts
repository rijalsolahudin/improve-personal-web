// Layout timeline Kalender & "Jadwal hari ini" (Desktop.dc.html `buildGrid`). Fungsi murni.
// Grid 05:00–24:00 dalam slot 15 menit; tinggi slot membesar supaya isi item (to-do tertaut,
// judul) muat, dan tinggi itu dipakai bersama semua kolom supaya jam tetap sejajar.

export const GRID_START_HOUR = 5
export const GRID_END_HOUR = 24
export const SLOT_MINUTES = 15
export const SLOTS_PER_HOUR = 60 / SLOT_MINUTES
export const SLOT_COUNT = (GRID_END_HOUR - GRID_START_HOUR) * SLOTS_PER_HOUR
/** Tinggi dasar slot 15 menit (52px per jam). */
export const BASE_SLOT_PX = 13

/** Kepala kartu jadwal (glyph + judul + jam) sebelum daftar to-do tertaut. */
export const EVENT_HEAD_PX = 46
/**
 * Kepala kartu di tampilan pekan (ringkas, tanpa glyph): judul + jam. Dipakai untuk menghitung
 * berapa baris to-do tertaut yang muat - kartu ringkas juga menampilkan daftarnya, bukan cuma jumlah.
 */
export const COMPACT_HEAD_PX = 38
/** Satu baris to-do tertaut; harus sejalan dengan tinggi `.dense` di TodoLine. */
export const LINKED_ROW_PX = 28
/** Padding daftar to-do + ruang di bawahnya sampai tepi kartu (CalendarEventTodos/GridEvent). */
export const LINKED_FRAME_PX = 20

const GRID_START_MIN = GRID_START_HOUR * 60
const GRID_END_MIN = GRID_END_HOUR * 60

export interface GridEntry {
  key: string
  /** Menit sejak 00:00. */
  start: number
  /** Durasi menit. */
  dur: number
  /** Tinggi minimum (px) supaya isinya muat. */
  need: number
}

/** Kebutuhan tinggi item (design `needOf`): penanda to-do, atau jadwal + to-do tertaut. */
export function entryNeed(
  kind: 'event' | 'task',
  dur: number,
  linkedCount: number,
  isCompact: boolean,
): number {
  if (kind === 'task') return isCompact ? 40 : 26
  if (isCompact) {
    // Kartu ringkas tetap butuh ruang ekstra untuk to-do tertautnya (sama seperti kartu hari).
    return linkedCount ? COMPACT_HEAD_PX + linkedCount * LINKED_ROW_PX + LINKED_FRAME_PX : 52
  }
  if (linkedCount) return EVENT_HEAD_PX + linkedCount * LINKED_ROW_PX + LINKED_FRAME_PX
  return dur >= 45 ? 40 : 22
}

/** Hanya item yang (sebagian) jatuh di dalam jam grid. */
export function isVisible(entry: Pick<GridEntry, 'start' | 'dur'>): boolean {
  return entry.start + entry.dur > GRID_START_MIN
}

/**
 * Item yang bertumpuk dibagi ke kolom per kelompok tumpang-tindih: `col` = kolom item,
 * `cols` = jumlah kolom di kelompoknya (lebar = 1/cols).
 */
export function placeColumns<T extends GridEntry>(
  entries: readonly T[],
): (T & { col: number; cols: number })[] {
  const sorted = [...entries].sort((a, b) => a.start - b.start || b.dur - a.dur)
  const placed: (T & { col: number; cols: number })[] = []
  let cluster: (T & { col: number; cols: number })[] = []
  let clusterEnd = -1
  let colEnds: number[] = []

  const closeCluster = (): void => {
    for (const item of cluster) item.cols = colEnds.length
    placed.push(...cluster)
    cluster = []
    colEnds = []
  }

  for (const entry of sorted) {
    if (cluster.length && entry.start >= clusterEnd) closeCluster()
    let col = colEnds.findIndex((end) => end <= entry.start)
    if (col < 0) col = colEnds.push(0) - 1
    colEnds[col] = entry.start + entry.dur
    clusterEnd = Math.max(clusterEnd, entry.start + entry.dur)
    cluster.push({ ...entry, col, cols: 1 })
  }
  closeCluster()
  return placed
}

function slotRange(entry: Pick<GridEntry, 'start' | 'dur'>): [number, number] {
  const from = Math.max(0, Math.floor((entry.start - GRID_START_MIN) / SLOT_MINUTES))
  const to = Math.min(
    SLOT_COUNT,
    Math.ceil((entry.start + entry.dur - GRID_START_MIN) / SLOT_MINUTES),
  )
  return [from, to]
}

/** Tinggi tiap slot: dasar 13px, dilebarkan rata di rentang item yang butuh lebih. */
export function slotHeights(columns: readonly (readonly GridEntry[])[]): number[] {
  const merged = new Array<number>(SLOT_COUNT).fill(BASE_SLOT_PX)
  for (const entries of columns) {
    const heights = new Array<number>(SLOT_COUNT).fill(BASE_SLOT_PX)
    for (const entry of entries) {
      const [from, to] = slotRange(entry)
      if (to <= from) continue
      // +2 = jarak antaritem (design).
      const need = entry.need + 2
      let have = 0
      for (let slot = from; slot < to; slot += 1) have += heights[slot] ?? BASE_SLOT_PX
      if (have >= need) continue
      const extra = (need - have) / (to - from)
      for (let slot = from; slot < to; slot += 1)
        heights[slot] = (heights[slot] ?? BASE_SLOT_PX) + extra
    }
    heights.forEach((height, slot) => {
      merged[slot] = Math.max(merged[slot] ?? BASE_SLOT_PX, height)
    })
  }
  return merged
}

export interface GridScale {
  /** Tinggi total grid (px). */
  height: number
  /** Posisi vertikal (px) menit `minute`. */
  yAt: (minute: number) => number
  /** Awal (px) dan tinggi (px) slot ke-`index`. */
  slot: (index: number) => { top: number; height: number }
}

export function gridScale(heights: readonly number[]): GridScale {
  const offsets = [0]
  heights.forEach((height, index) => offsets.push((offsets[index] ?? 0) + height))
  const yAt = (minute: number): number => {
    const raw = (minute - GRID_START_MIN) / SLOT_MINUTES
    const index = Math.max(0, Math.min(SLOT_COUNT - 1, Math.floor(raw)))
    return (offsets[index] ?? 0) + (raw - index) * (heights[index] ?? BASE_SLOT_PX)
  }
  return {
    height: offsets[SLOT_COUNT] ?? 0,
    yAt,
    slot: (index) => ({ top: offsets[index] ?? 0, height: heights[index] ?? BASE_SLOT_PX }),
  }
}

export type ResizeEdge = 'top' | 'bottom'
/**
 * Tarik tepi atas/bawah jadwal (design `startDrag`): geser per 15 menit, tidak keluar grid,
 * durasi minimal 15 menit. Tepi atas menggeser mulai tapi akhir tetap.
 */
export function resizeEntry(
  edge: ResizeEdge,
  start: number,
  dur: number,
  deltaSlots: number,
): { start: number; dur: number } {
  const delta = Math.round(deltaSlots) * SLOT_MINUTES
  if (edge === 'top') {
    const next = Math.min(Math.max(GRID_START_MIN, start + delta), start + dur - SLOT_MINUTES)
    return { start: next, dur: dur - (next - start) }
  }
  return { start, dur: Math.min(Math.max(SLOT_MINUTES, dur + delta), GRID_END_MIN - start) }
}

/** Tinggi pill "▶ Fokus": 18px di kartu normal, 14px di kartu pendek (< 24 menit). */
export const FOCUS_PILL_PX = 18
export const FOCUS_PILL_TINY_PX = 14

export interface FocusPillStyle {
  top: string
  right: string
  minHeight: string
}

/**
 * Geometri pill "▶ Fokus" mengikuti centang kartu (design `ckS`/`ckTop`, Desktop.dc.html:875,3529):
 * di kartu pendek pill ikut 14px dan berada di tengah kartu. Dikembalikan sebagai style inline
 * supaya ukurannya tidak bisa kalah oleh urutan rule CSS `.event .focus`.
 */
export function focusPillStyle(isTiny: boolean): FocusPillStyle {
  if (isTiny) {
    return {
      top: `calc(50% - ${FOCUS_PILL_TINY_PX / 2}px)`,
      right: `${FOCUS_PILL_TINY_PX + 10}px`,
      minHeight: `${FOCUS_PILL_TINY_PX}px`,
    }
  }
  return { top: '8px', right: `${FOCUS_PILL_PX + 10}px`, minHeight: `${FOCUS_PILL_PX}px` }
}
