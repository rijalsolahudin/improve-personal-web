// Mode hias (Home Desktop.dc.html · "Mode hias"): sticker ditempel ke anchor (halaman,
// header, atau kartu) dengan posisi relatif, jadi ikut pindah kalau kartunya pindah.
// Hiasan disimpan per halaman + per ukuran layar (desktop/tablet/HP).

export const DECO_BUCKETS = ['desktop', 'tablet', 'hp'] as const
export type DecoBucket = (typeof DECO_BUCKETS)[number]

/** Anchor fallback: area konten halaman. */
export const PAGE_ANCHOR = 'page'
export const DECO_MIN_SIZE = 24
export const DECO_MAX_SIZE = 420
export const DECO_DEFAULT_SIZE = 96
/** Batas jumlah supaya storage & render tetap ringan. */
export const DECO_MAX_ITEMS = 300

export interface DecoItem {
  readonly id: string
  /** Id sticker katalog (`pack/slug`), boleh berawalan `icon:`. */
  readonly sid: string
  readonly page: string
  readonly bucket: DecoBucket
  readonly anchor: string
  /** Titik tengah sticker, % dari lebar/tinggi anchor. */
  readonly px: number
  readonly py: number
  /** Lebar sticker relatif ke lebar anchor. */
  readonly w: number
  readonly rot: number
  readonly z: number
}

export interface AnchorRect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly kind: string
}

/** Geometri sticker dalam koordinat lapisan hias (px). */
export interface DecoBox {
  readonly left: number
  readonly top: number
  readonly size: number
  readonly rot: number
}

export function bucketForWidth(width: number): DecoBucket {
  if (width < 600) return 'hp'
  return width <= 1024 ? 'tablet' : 'desktop'
}

const TOKEN = /^[\w-]{1,40}$/
const STICKER_ID = /^(icon:)?[a-z-]{1,20}\/[a-z0-9-]{1,30}$/

export function isStickerId(value: unknown): value is string {
  return typeof value === 'string' && STICKER_ID.test(value)
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

function finite(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : null
}

function parseItem(raw: unknown): DecoItem | null {
  if (typeof raw !== 'object' || raw === null) return null
  const d = raw as Record<string, unknown>
  const px = finite(d.px, -100, 200)
  const py = finite(d.py, -100, 200)
  const w = finite(d.w, 0.001, 10)
  const rot = finite(d.rot, -720, 720)
  const z = finite(d.z, 0, 100_000)
  if (
    typeof d.id !== 'string' ||
    !TOKEN.test(d.id) ||
    !isStickerId(d.sid) ||
    typeof d.page !== 'string' ||
    !TOKEN.test(d.page) ||
    !(DECO_BUCKETS as readonly unknown[]).includes(d.bucket) ||
    typeof d.anchor !== 'string' ||
    !TOKEN.test(d.anchor) ||
    px === null ||
    py === null ||
    w === null ||
    rot === null ||
    z === null
  ) {
    return null
  }
  return {
    id: d.id,
    sid: d.sid,
    page: d.page,
    bucket: d.bucket as DecoBucket,
    anchor: d.anchor,
    px,
    py,
    w,
    rot,
    z: Math.round(z),
  }
}

/** Validasi hiasan dari storage (data tak tepercaya): item rusak & id ganda dibuang. */
export function parseDecoItems(raw: unknown): DecoItem[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const items: DecoItem[] = []
  for (const entry of raw.slice(0, DECO_MAX_ITEMS)) {
    const item = parseItem(entry)
    if (item && !seen.has(item.id)) {
      seen.add(item.id)
      items.push(item)
    }
  }
  return items
}

export function boxOnAnchor(item: DecoItem, anchor: AnchorRect): DecoBox {
  const size = clamp(item.w * anchor.w, DECO_MIN_SIZE, DECO_MAX_SIZE)
  return {
    size,
    left: anchor.x + (item.px / 100) * anchor.w - size / 2,
    top: anchor.y + (item.py / 100) * anchor.h - size / 2,
    rot: item.rot,
  }
}

/** Kebalikan `boxOnAnchor`: simpan posisi box sebagai koordinat relatif anchor. */
export function placementOnAnchor(
  box: DecoBox,
  anchor: AnchorRect,
): Pick<DecoItem, 'px' | 'py' | 'w' | 'rot'> {
  const size = clamp(box.size, DECO_MIN_SIZE, DECO_MAX_SIZE)
  const round = (value: number, digits: number): number => Number(value.toFixed(digits))
  return {
    px: round(((box.left + size / 2 - anchor.x) / anchor.w) * 100, 2),
    py: round(((box.top + size / 2 - anchor.y) / anchor.h) * 100, 2),
    w: round(size / anchor.w, 4),
    rot: Math.round(box.rot),
  }
}

/**
 * Hiasan disalin dari ukuran layar lain: geser horizontal supaya sticker tetap di dalam
 * lebar lapisan (tata letak beda lebar).
 */
export function tidyIntoWidth(
  item: DecoItem,
  anchor: AnchorRect,
  layerWidth: number,
  margin = 8,
): DecoItem {
  const box = boxOnAnchor(item, anchor)
  const half = box.size / 2
  const center = clamp(box.left + half, half + margin, layerWidth - half - margin)
  return { ...item, px: Number((((center - anchor.x) / anchor.w) * 100).toFixed(2)) }
}

export const ICON_PREFIX = 'icon:'
export const RECENT_STICKER_LIMIT = 18

export const isIconSid = (sid: string): boolean => sid.startsWith(ICON_PREFIX)
export const baseSid = (sid: string): string =>
  isIconSid(sid) ? sid.slice(ICON_PREFIX.length) : sid

/** Sticker terakhir dipakai: paling baru di depan, tanpa duplikat, dibatasi. */
export function pushRecent(recent: readonly string[], sid: string): string[] {
  const id = baseSid(sid)
  return [id, ...recent.filter((item) => item !== id)].slice(0, RECENT_STICKER_LIMIT)
}

export function topZ(items: readonly DecoItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.z), 0)
}
