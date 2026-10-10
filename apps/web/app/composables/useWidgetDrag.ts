import type { Ref } from 'vue'

import {
  appendToColumn,
  columnOf,
  isHomeWidgetId,
  placeNear,
  type HomeLayout,
  type HomeWidgetId,
  type LayoutColumn,
} from '~/utils/homeLayout'

const AUTOSCROLL_EDGE = 90
const AUTOSCROLL_DIVISOR = 6
const DROP_MS = 200

interface DragOptions {
  gridEl: Ref<HTMLElement | null>
  layout: Readonly<Ref<HomeLayout>>
  isTwoColumn: Readonly<Ref<boolean>>
  /** Dipanggil tiap posisi berubah selama drag (tanpa menulis storage). */
  preview: (next: HomeLayout) => void
  /** Dipanggil sekali saat widget dilepas. */
  commit: () => void
}

interface ActiveDrag {
  id: HomeWidgetId
  ghost: HTMLElement
  offsetX: number
  offsetY: number
  pointer: { x: number; y: number }
  frame: number
  listeners: AbortController
}

/**
 * Drag & drop widget Home (pointer events, mouse + touch). Salinan visual widget ikut
 * pointer; layout dihitung ulang dari widget yang ada di bawah pointer.
 * Keyboard memakai tombol ↑ ↓ ⇄ di overlay, jadi drag murni peningkatan.
 */
export function useWidgetDrag({ gridEl, layout, isTwoColumn, preview, commit }: DragOptions) {
  const draggingId = ref<HomeWidgetId | null>(null)
  let active: ActiveDrag | null = null

  function cells(): HTMLElement[] {
    return [...(gridEl.value?.querySelectorAll<HTMLElement>('[data-widget]') ?? [])]
  }

  function bottomGap(cell: HTMLElement): number {
    const inner = cell.querySelector<HTMLElement>('[data-widget-inner]')
    return inner ? parseFloat(getComputedStyle(inner).paddingBottom) || 0 : 0
  }

  function nextLayout(id: HomeWidgetId, x: number, y: number): HomeLayout | null {
    const visible = cells().filter((cell) => cell.offsetParent !== null)
    for (const cell of visible) {
      const target = cell.dataset.widget
      if (!isHomeWidgetId(target) || target === id) continue
      const rect = cell.getBoundingClientRect()
      const contentBottom = rect.bottom - bottomGap(cell)
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= contentBottom) {
        return placeNear(layout.value, id, target, y > (rect.top + contentBottom) / 2)
      }
    }
    // Area kosong: cuma kalau pointer di bawah widget terakhir kolom tujuan.
    const grid = gridEl.value?.getBoundingClientRect()
    if (!grid) return null
    const column: LayoutColumn = isTwoColumn.value && x < grid.left + grid.width / 2 ? 'L' : 'R'
    const lowest = visible
      .filter((cell) => {
        const widget = cell.dataset.widget
        if (!isHomeWidgetId(widget) || widget === id) return false
        return !isTwoColumn.value || columnOf(layout.value, widget) === column
      })
      .reduce((max, cell) => Math.max(max, cell.getBoundingClientRect().bottom), -Infinity)
    return y >= lowest ? appendToColumn(layout.value, id, column) : null
  }

  function track(x: number, y: number): void {
    if (!active) return
    active.pointer = { x, y }
    active.ghost.style.left = `${x - active.offsetX}px`
    active.ghost.style.top = `${y - active.offsetY}px`
    const next = nextLayout(active.id, x, y)
    if (next) preview(next)
  }

  function autoscroll(): void {
    if (!active) return
    const { x, y } = active.pointer
    const edge = window.innerHeight - AUTOSCROLL_EDGE
    let speed = 0
    if (y < AUTOSCROLL_EDGE) speed = -Math.ceil((AUTOSCROLL_EDGE - y) / AUTOSCROLL_DIVISOR)
    else if (y > edge) speed = Math.ceil((y - edge) / AUTOSCROLL_DIVISOR)
    if (speed) {
      window.scrollBy(0, speed)
      track(x, y)
    }
    active.frame = requestAnimationFrame(autoscroll)
  }

  function makeGhost(inner: HTMLElement, rect: DOMRect): HTMLElement {
    const ghost = inner.cloneNode(true) as HTMLElement
    // Salinan visual saja: tanpa id ganda, tidak bisa difokus, tersembunyi dari pembaca layar.
    ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'))
    ghost.removeAttribute('data-widget-inner')
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
      visibility: 'visible',
      transform: 'scale(1.02)',
      filter: 'drop-shadow(0 10px 16px rgba(47, 42, 36, 0.16))',
    })
    return ghost
  }

  function grab(event: PointerEvent, id: HomeWidgetId): void {
    if (event.button !== 0 || active) return
    const inner = gridEl.value?.querySelector<HTMLElement>(`[data-widget-inner="${id}"]`)
    if (!inner) return
    event.preventDefault()
    const rect = inner.getBoundingClientRect()
    const ghost = makeGhost(inner, rect)
    // Di dalam grid supaya container query & token tema tetap berlaku untuk salinannya.
    gridEl.value?.append(ghost)

    const listeners = new AbortController()
    active = {
      id,
      ghost,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      pointer: { x: event.clientX, y: event.clientY },
      frame: 0,
      listeners,
    }
    active.frame = requestAnimationFrame(autoscroll)
    draggingId.value = id
    document.body.style.cursor = 'grabbing'

    const options = { signal: listeners.signal }
    window.addEventListener('pointermove', (e) => track(e.clientX, e.clientY), options)
    window.addEventListener('pointerup', drop, options)
    window.addEventListener('pointercancel', drop, options)
  }

  function finish(): void {
    if (!active) return
    active.ghost.remove()
    active = null
    draggingId.value = null
  }

  function drop(): void {
    if (!active) return
    const { id, ghost, frame, listeners } = active
    cancelAnimationFrame(frame)
    listeners.abort()
    document.body.style.cursor = ''
    commit()

    const target = gridEl.value?.querySelector<HTMLElement>(`[data-widget="${id}"]`)
    if (!target || prefersReducedMotion()) return finish()
    const rect = target.getBoundingClientRect()
    Object.assign(ghost.style, {
      transition: `left ${DROP_MS}ms ease-out, top ${DROP_MS}ms ease-out, transform ${DROP_MS}ms ease-out`,
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      transform: 'none',
    })
    setTimeout(finish, DROP_MS)
  }

  onBeforeUnmount(() => {
    if (!active) return
    cancelAnimationFrame(active.frame)
    active.listeners.abort()
    document.body.style.cursor = ''
    finish()
  })

  return { draggingId: readonly(draggingId), grab }
}
