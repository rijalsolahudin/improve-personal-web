/** Jarak minimal (px) sebelum tekan-geser dianggap drag, bukan klik. */
const DRAG_THRESHOLD = 4
const ZONE_SELECTOR = '[data-drop-zone]'
const ITEM_SELECTOR = '[data-drop-item]'
const HANDLE_SELECTOR = '[data-drag-handle]'

interface ActiveDrag {
  itemId: string
  source: HTMLElement
  startX: number
  startY: number
  offsetX: number
  offsetY: number
  ghost: HTMLElement | null
  listeners: AbortController
}

/**
 * Drag & drop pointer (mouse + touch) ke zona `data-drop-zone="<id>"`.
 * Mouse: seluruh kartu bisa diseret. Touch/pen: hanya dari `data-drag-handle`, supaya
 * halaman tetap bisa di-scroll dengan jari. Salinan kartu ikut pointer selama drag.
 *
 * `onDrop` menerima indeks sisip di dalam zona, dihitung dari `[data-drop-item]` (posisi
 * tengah kartu). Item yang sedang diseret tidak ikut dihitung, jadi `index` bisa langsung
 * dipakai untuk reorder.
 */
export function useZoneDrag(onDrop: (itemId: string, zone: string, index: number) => void) {
  const draggingId = ref<string | null>(null)
  const overZone = ref<string | null>(null)
  let active: ActiveDrag | null = null

  function zoneElementAt(x: number, y: number): HTMLElement | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const zone = el.closest<HTMLElement>(ZONE_SELECTOR)
      if (zone) return zone
    }
    return null
  }

  /** Indeks sisip berdasarkan posisi tengah kartu di dalam zona. */
  function dropIndexAt(zone: HTMLElement, y: number, itemId: string): number {
    const items = [...zone.querySelectorAll<HTMLElement>(ITEM_SELECTOR)].filter(
      (item) => item.dataset.dropItem !== itemId,
    )
    const before = items.findIndex((item) => {
      const rect = item.getBoundingClientRect()
      return y < rect.top + rect.height / 2
    })
    return before < 0 ? items.length : before
  }

  function makeGhost(source: HTMLElement): HTMLElement {
    const rect = source.getBoundingClientRect()
    const ghost = source.cloneNode(true) as HTMLElement
    ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'))
    // Ghost ikut di dalam zona; jangan sampai dihitung sebagai kartu tujuan drop.
    ghost.removeAttribute('data-drop-item')
    ghost.setAttribute('aria-hidden', 'true')
    ghost.inert = true
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      margin: '0',
      zIndex: '1000',
      pointerEvents: 'none',
      transform: 'rotate(-2deg) scale(1.03)',
      filter: 'drop-shadow(0 10px 16px rgba(47, 42, 36, 0.18))',
    })
    // Di parent kartu supaya scoped style & token tema tetap berlaku.
    source.parentElement?.append(ghost)
    return ghost
  }

  function move(event: PointerEvent): void {
    if (!active) return
    const { clientX: x, clientY: y } = event
    if (!active.ghost) {
      if (Math.hypot(x - active.startX, y - active.startY) < DRAG_THRESHOLD) return
      active.ghost = makeGhost(active.source)
      draggingId.value = active.itemId
      document.body.style.cursor = 'grabbing'
    }
    active.ghost.style.left = `${x - active.offsetX}px`
    active.ghost.style.top = `${y - active.offsetY}px`
    overZone.value = zoneElementAt(x, y)?.dataset.dropZone ?? null
  }

  function finish(event: PointerEvent | null): void {
    if (!active) return
    const { itemId, ghost, listeners } = active
    listeners.abort()
    ghost?.remove()
    active = null
    document.body.style.cursor = ''
    const zoneElement = ghost && event ? zoneElementAt(event.clientX, event.clientY) : null
    const zone = zoneElement?.dataset.dropZone ?? null
    const index = zoneElement && event ? dropIndexAt(zoneElement, event.clientY, itemId) : 0
    draggingId.value = null
    overZone.value = null
    if (zone) onDrop(itemId, zone, index)
  }

  function start(event: PointerEvent, itemId: string): void {
    if (event.button !== 0 || active) return
    const target = event.target as Element
    // Tombol di dalam kartu (centang, keluarkan) tetap berfungsi sebagai tombol.
    if (target.closest('button')) return
    if (event.pointerType !== 'mouse' && !target.closest(HANDLE_SELECTOR)) return
    const source = event.currentTarget as HTMLElement
    const rect = source.getBoundingClientRect()
    const listeners = new AbortController()
    active = {
      itemId,
      source,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      ghost: null,
      listeners,
    }
    event.preventDefault()
    const options = { signal: listeners.signal }
    window.addEventListener('pointermove', move, options)
    window.addEventListener('pointerup', finish, options)
    window.addEventListener('pointercancel', () => finish(null), options)
  }

  onBeforeUnmount(() => finish(null))

  return { draggingId: readonly(draggingId), overZone: readonly(overZone), start }
}
