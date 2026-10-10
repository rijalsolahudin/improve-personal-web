import {
  DECO_MAX_ITEMS,
  isStickerId,
  parseDecoItems,
  pushRecent,
  RECENT_STICKER_LIMIT,
  topZ,
  type DecoBucket,
  type DecoItem,
} from '~/utils/deco'

/** Preferensi tampilan (bukan data sensitif) → localStorage, selalu divalidasi saat dibaca. */
export const DECO_STORAGE_KEY = 'ip-deco'
export const DECO_HIDDEN_STORAGE_KEY = 'ip-deco-hidden'
export const STICKER_RECENT_STORAGE_KEY = 'ip-stk-recent'

function readJson(key: string): unknown {
  if (!import.meta.client) return null
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage penuh/diblokir: perubahan tetap berlaku untuk sesi ini.
  }
}

function readRecent(): string[] {
  const raw = readJson(STICKER_RECENT_STORAGE_KEY)
  if (!Array.isArray(raw)) return []
  return raw.filter((id): id is string => isStickerId(id)).slice(0, RECENT_STICKER_LIMIT)
}

export interface DecoScope {
  page: string
  bucket: DecoBucket
}

export function useDeco() {
  const items = useState<DecoItem[]>('deco-items', () => parseDecoItems(readJson(DECO_STORAGE_KEY)))
  const isHidden = useState<boolean>('deco-hidden', () => readJson(DECO_HIDDEN_STORAGE_KEY) === 1)
  const isEditing = useState<boolean>('deco-editing', () => false)
  const selectedId = useState<string | null>('deco-selected', () => null)
  const recent = useState<string[]>('sticker-recent', readRecent)

  function save(next: DecoItem[]): void {
    items.value = next
    write(DECO_STORAGE_KEY, JSON.stringify(next))
  }

  const inScope = (item: DecoItem, scope: DecoScope): boolean =>
    item.page === scope.page && item.bucket === scope.bucket

  function itemsIn(scope: DecoScope): DecoItem[] {
    return items.value.filter((item) => inScope(item, scope))
  }

  /** Tambah sticker; mengembalikan item baru, atau null kalau batas jumlah tercapai. */
  function add(item: Omit<DecoItem, 'id' | 'z'>): DecoItem | null {
    if (items.value.length >= DECO_MAX_ITEMS) return null
    const created: DecoItem = { ...item, id: crypto.randomUUID(), z: topZ(itemsIn(item)) + 1 }
    save([...items.value, created])
    selectedId.value = created.id
    return created
  }

  function patch(id: string, changes: Partial<Omit<DecoItem, 'id'>>): void {
    save(items.value.map((item) => (item.id === id ? { ...item, ...changes } : item)))
  }

  function remove(id: string): void {
    save(items.value.filter((item) => item.id !== id))
    if (selectedId.value === id) selectedId.value = null
  }

  function bringToFront(id: string): void {
    const item = items.value.find((entry) => entry.id === id)
    if (item) patch(id, { z: topZ(itemsIn(item)) + 1 })
  }

  function resetScope(scope: DecoScope): void {
    save(items.value.filter((item) => !inScope(item, scope)))
    selectedId.value = null
  }

  /** Salin hiasan halaman ini dari ukuran layar lain; `adjust` merapikan posisi tiap salinan. */
  function copyScope(from: DecoScope, to: DecoScope, adjust: (item: DecoItem) => DecoItem): void {
    const room = DECO_MAX_ITEMS - items.value.length
    const copies = itemsIn(from)
      .slice(0, Math.max(0, room))
      .map((item) => adjust({ ...item, id: crypto.randomUUID(), bucket: to.bucket }))
    save([...items.value, ...copies])
  }

  function rememberSticker(sid: string): void {
    recent.value = pushRecent(recent.value, sid)
    write(STICKER_RECENT_STORAGE_KEY, JSON.stringify(recent.value))
  }

  function setEditing(next: boolean): void {
    isEditing.value = next
    selectedId.value = null
  }

  function toggleHidden(): void {
    isHidden.value = !isHidden.value
    write(DECO_HIDDEN_STORAGE_KEY, isHidden.value ? '1' : '0')
  }

  function select(id: string | null): void {
    selectedId.value = id
  }

  return {
    items: readonly(items),
    isHidden: readonly(isHidden),
    isEditing: readonly(isEditing),
    selectedId: readonly(selectedId),
    recent: readonly(recent),
    itemsIn,
    add,
    patch,
    remove,
    bringToFront,
    resetScope,
    copyScope,
    rememberSticker,
    setEditing,
    toggleHidden,
    select,
  }
}
