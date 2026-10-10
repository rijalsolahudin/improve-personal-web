/** Jarak minimal (px) sebelum tekan-geser dianggap drag, bukan klik. */
const DRAG_THRESHOLD = 4
const ZONE_SELECTOR = '[data-drop-zone]'
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
 */
export function useZoneDrag(onDrop: (itemId: string, zone: string) => void) {
  const draggingId = ref<string | null>(null)
  const overZone = ref<string | null>(null)
  let active: ActiveDrag | null = null

  function zoneAt(x: number, y: number): string | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const zone = el.closest<HTMLElement>(ZONE_SELECTOR)?.dataset.dropZone
      if (zone) return zone
    }
    return null
  }

  function makeGhost(source: HTMLElement): HTMLElement {
    const rect = source.getBoundingClientRect()
    const ghost = source.cloneNode(true) as HTMLElement
    ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'))
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
    overZone.value = zoneAt(x, y)
  }

  function finish(event: PointerEvent | null): void {
    if (!active) return
    const { itemId, ghost, listeners } = active
    listeners.abort()
    ghost?.remove()
    active = null
    document.body.style.cursor = ''
    const zone = ghost && event ? zoneAt(event.clientX, event.clientY) : null
    draggingId.value = null
    overZone.value = null
    if (zone) onDrop(itemId, zone)
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
