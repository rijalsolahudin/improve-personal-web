import { DECO_MAX_SIZE, DECO_MIN_SIZE, type DecoBox } from '~/utils/deco'

export type DecoDragMode = 'move' | 'rotate' | 'resize'

const ROTATE_SNAP = 15
const MIN_RADIUS = 10

interface DragStart {
  id: string
  mode: DecoDragMode
  box: DecoBox
  /** Titik tengah sticker di layar. */
  cx: number
  cy: number
  sx: number
  sy: number
  angle: number
  radius: number
  hasMoved: boolean
  listeners: AbortController
}

/**
 * Geser / putar / ubah ukuran sticker dengan pointer (Home Desktop.dc.html `decoStart`).
 * Selama drag cuma `draft` yang berubah; `onCommit` dipanggil sekali saat dilepas.
 */
export function useDecoDrag(onCommit: (id: string, box: DecoBox) => void) {
  const draft = shallowRef<{ id: string; box: DecoBox } | null>(null)
  let active: DragStart | null = null

  function next(start: DragStart, event: PointerEvent): DecoBox {
    const { box } = start
    if (start.mode === 'move') {
      return {
        ...box,
        left: box.left + event.clientX - start.sx,
        top: box.top + event.clientY - start.sy,
      }
    }
    if (start.mode === 'rotate') {
      const angle = Math.atan2(event.clientY - start.cy, event.clientX - start.cx)
      let rot = box.rot + ((angle - start.angle) * 180) / Math.PI
      if (event.shiftKey) rot = Math.round(rot / ROTATE_SNAP) * ROTATE_SNAP
      return { ...box, rot }
    }
    const radius = Math.hypot(event.clientX - start.cx, event.clientY - start.cy)
    const size = Math.min(
      DECO_MAX_SIZE,
      Math.max(DECO_MIN_SIZE, (box.size * radius) / start.radius),
    )
    const grow = (size - box.size) / 2
    return { size, rot: box.rot, left: box.left - grow, top: box.top - grow }
  }

  function end(): void {
    if (!active) return
    const { id, hasMoved, listeners } = active
    listeners.abort()
    active = null
    const box = draft.value?.box
    draft.value = null
    if (hasMoved && box) onCommit(id, box)
  }

  function start(event: PointerEvent, id: string, mode: DecoDragMode, box: DecoBox): void {
    if (event.button !== 0 || active) return
    event.preventDefault()
    event.stopPropagation()
    const item = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-deco-item]')
    if (!item) return
    const rect = item.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const listeners = new AbortController()
    active = {
      id,
      mode,
      box,
      cx,
      cy,
      sx: event.clientX,
      sy: event.clientY,
      angle: Math.atan2(event.clientY - cy, event.clientX - cx),
      radius: Math.max(MIN_RADIUS, Math.hypot(event.clientX - cx, event.clientY - cy)),
      hasMoved: false,
      listeners,
    }
    draft.value = { id, box }
    const options = { signal: listeners.signal }
    window.addEventListener(
      'pointermove',
      (e) => {
        if (!active) return
        active.hasMoved = true
        draft.value = { id, box: next(active, e) }
      },
      options,
    )
    window.addEventListener('pointerup', end, options)
    window.addEventListener('pointercancel', end, options)
  }

  onBeforeUnmount(() => {
    active?.listeners.abort()
    active = null
  })

  return { draft, start }
}
