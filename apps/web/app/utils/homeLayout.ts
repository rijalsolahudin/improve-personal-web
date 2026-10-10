// Tata letak widget Home (Home Desktop.dc.html · "Atur tata letak").
// Dua kolom (L/R) berisi id widget; `wide` = lebar penuh, `hidden` = disembunyikan.
// Semua fungsi murni: mengembalikan layout baru, tidak memutasi input.

export const HOME_WIDGET_IDS = ['jadwal', 'stats', 'todo', 'pomo', 'habit', 'goal', 'memo'] as const
export type HomeWidgetId = (typeof HOME_WIDGET_IDS)[number]
export type LayoutColumn = 'L' | 'R'

export interface HomeLayout {
  readonly L: readonly HomeWidgetId[]
  readonly R: readonly HomeWidgetId[]
  readonly wide: readonly HomeWidgetId[]
  readonly hidden: readonly HomeWidgetId[]
}

export function defaultHomeLayout(): HomeLayout {
  return {
    L: ['jadwal', 'stats', 'todo'],
    R: ['pomo', 'habit', 'goal', 'memo'],
    wide: [],
    hidden: [],
  }
}

export function isHomeWidgetId(value: unknown): value is HomeWidgetId {
  return typeof value === 'string' && (HOME_WIDGET_IDS as readonly string[]).includes(value)
}

function widgetList(value: unknown, seen: Set<HomeWidgetId>): HomeWidgetId[] {
  if (!Array.isArray(value)) return []
  const out: HomeWidgetId[] = []
  for (const item of value) {
    if (isHomeWidgetId(item) && !seen.has(item)) {
      seen.add(item)
      out.push(item)
    }
  }
  return out
}

/**
 * Validasi layout dari storage (data tak tepercaya). Id asing & duplikat dibuang,
 * widget yang hilang dikembalikan ke kolom default-nya, bentuk rusak → default.
 */
export function parseHomeLayout(raw: unknown): HomeLayout {
  if (typeof raw !== 'object' || raw === null) return defaultHomeLayout()
  const data = raw as Record<string, unknown>
  const placed = new Set<HomeWidgetId>()
  const L = widgetList(data.L, placed)
  const R = widgetList(data.R, placed)
  const fallback = defaultHomeLayout()
  return {
    L: [...L, ...fallback.L.filter((id) => !placed.has(id))],
    R: [...R, ...fallback.R.filter((id) => !placed.has(id))],
    wide: widgetList(data.wide, new Set()),
    hidden: widgetList(data.hidden, new Set()),
  }
}

export function columnOf(layout: HomeLayout, id: HomeWidgetId): LayoutColumn {
  return layout.L.includes(id) ? 'L' : 'R'
}

function without(layout: HomeLayout, id: HomeWidgetId): HomeLayout {
  return {
    ...layout,
    L: layout.L.filter((item) => item !== id),
    R: layout.R.filter((item) => item !== id),
  }
}

/** Geser naik (-1) / turun (+1) di kolomnya sendiri. Di ujung → tidak berubah. */
export function moveWithinColumn(layout: HomeLayout, id: HomeWidgetId, delta: -1 | 1): HomeLayout {
  const column = columnOf(layout, id)
  const list = [...layout[column]]
  const from = list.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= list.length) return layout
  list.splice(from, 1)
  list.splice(to, 0, id)
  return { ...layout, [column]: list }
}

/** Pindah ke kolom seberang di posisi yang sama (atau paling bawah). Lebar penuh dilepas. */
export function swapColumn(layout: HomeLayout, id: HomeWidgetId): HomeLayout {
  const from = columnOf(layout, id)
  const to: LayoutColumn = from === 'L' ? 'R' : 'L'
  const index = layout[from].indexOf(id)
  const next = without(layout, id)
  const target = [...next[to]]
  target.splice(Math.min(index, target.length), 0, id)
  return { ...next, [to]: target, wide: layout.wide.filter((item) => item !== id) }
}

function toggled(list: readonly HomeWidgetId[], id: HomeWidgetId, on: boolean): HomeWidgetId[] {
  const rest = list.filter((item) => item !== id)
  return on ? [...rest, id] : rest
}

export function toggleWide(layout: HomeLayout, id: HomeWidgetId): HomeLayout {
  return { ...layout, wide: toggled(layout.wide, id, !layout.wide.includes(id)) }
}

export function setHidden(layout: HomeLayout, id: HomeWidgetId, hidden: boolean): HomeLayout {
  return { ...layout, hidden: toggled(layout.hidden, id, hidden) }
}

/** Drag: taruh `id` sebelum/sesudah widget `target`. */
export function placeNear(
  layout: HomeLayout,
  id: HomeWidgetId,
  target: HomeWidgetId,
  after: boolean,
): HomeLayout {
  if (id === target) return layout
  const next = without(layout, id)
  const column = columnOf(next, target)
  const list = [...next[column]]
  list.splice(list.indexOf(target) + (after ? 1 : 0), 0, id)
  return { ...next, [column]: list }
}

/** Drag ke area kosong di bawah kolom: taruh paling bawah, lebar penuh dilepas. */
export function appendToColumn(
  layout: HomeLayout,
  id: HomeWidgetId,
  column: LayoutColumn,
): HomeLayout {
  const next = without(layout, id)
  return {
    ...next,
    [column]: [...next[column], id],
    wide: layout.wide.filter((item) => item !== id),
  }
}

export function isSameLayout(a: HomeLayout, b: HomeLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
