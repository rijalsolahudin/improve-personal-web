import type { Ref } from 'vue'

import { PAGE_ANCHOR, type AnchorRect } from '~/utils/deco'

const ANCHOR_SELECTOR = '[data-anchor]'
/** Elemen UI hias (termasuk sticker yang ditempel di dalam kartu sticky) tidak boleh jadi tempat menempel. */
const DECO_UI_SELECTOR = '[data-deco-layer], [data-deco-ui], [data-deco-item]'

/** Kontainer `position: sticky` sebuah anchor + posisi padding box-nya relatif ke `host`. */
export interface StickyFrame {
  readonly el: HTMLElement
  readonly x: number
  readonly y: number
}

function sameFrames(a: Record<string, StickyFrame>, b: Record<string, StickyFrame>): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => {
    const other = b[key]
    return other?.el === a[key]!.el && other.x === a[key]!.x && other.y === a[key]!.y
  })
}

/**
 * Ukur posisi semua anchor (`data-anchor`) relatif ke `host`. Diukur ulang (maks sekali per
 * frame) saat ukuran berubah (ResizeObserver), DOM/urutan berubah (MutationObserver, mis.
 * kartu Home dipindah), atau ada scroll — kartu `position: sticky` bergeser terhadap `host`
 * saat halaman di-scroll. Kartu biasa tidak bergeser terhadap `host`, jadi hasil ukurnya sama
 * dan tidak memicu render.
 *
 * Koreksi lewat JS selalu telat satu frame dari scroll (scroll jalan di compositor), jadi
 * sticker di kartu sticky goyang. Karena itu `frames` memberi tahu kontainer sticky tiap anchor:
 * sticker-nya dirender di dalam kontainer itu dan ikut bergerak native tanpa koreksi.
 */
export function useDecoAnchors(host: Ref<HTMLElement | null>) {
  const anchors = shallowRef<Record<string, AnchorRect>>({})
  const frames = shallowRef<Record<string, StickyFrame>>({})
  let frame = 0
  let resizeObserver: ResizeObserver | null = null
  let mutationObserver: MutationObserver | null = null
  const observed = new WeakSet<Element>()
  // Hasil getComputedStyle di-cache: scroll tidak mengubah siapa yang sticky, resize/DOM bisa.
  let stickyCache = new WeakMap<Element, HTMLElement | null>()

  /**
   * Kontainer sticky terdekat (termasuk anchor sendiri) di dalam `root`. Kontainer yang memotong
   * isinya (overflow ≠ visible) dilewati supaya sticker yang menjorok keluar kartu tidak terpotong.
   */
  function stickyOf(el: HTMLElement, root: HTMLElement): HTMLElement | null {
    const cached = stickyCache.get(el)
    if (cached !== undefined) return cached
    let found: HTMLElement | null = null
    for (let node: HTMLElement | null = el; node && node !== root; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.position !== 'sticky') continue
      if (style.overflowX === 'visible' && style.overflowY === 'visible') found = node
      break
    }
    stickyCache.set(el, found)
    return found
  }

  function measure(): void {
    frame = 0
    const root = host.value
    if (!root) return
    const origin = root.getBoundingClientRect()
    const next: Record<string, AnchorRect> = {}
    const nextFrames: Record<string, StickyFrame> = {}
    root.querySelectorAll<HTMLElement>(ANCHOR_SELECTOR).forEach((el) => {
      if (el.closest(DECO_UI_SELECTOR)) return
      if (!observed.has(el)) {
        observed.add(el)
        resizeObserver?.observe(el)
      }
      const id = el.dataset.anchor
      const rect = el.getBoundingClientRect()
      if (!id || !rect.width || !rect.height) return
      next[id] = {
        x: Math.round(rect.left - origin.left),
        y: Math.round(rect.top - origin.top),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        kind: el.dataset.anchorKind ?? 'content',
      }
      const sticky = stickyOf(el, root)
      if (sticky) {
        const box = sticky.getBoundingClientRect()
        nextFrames[id] = {
          el: sticky,
          x: Math.round(box.left - origin.left + sticky.clientLeft),
          y: Math.round(box.top - origin.top + sticky.clientTop),
        }
      }
    })
    if (JSON.stringify(next) !== JSON.stringify(anchors.value)) anchors.value = next
    if (!sameFrames(nextFrames, frames.value)) frames.value = nextFrames
  }

  function schedule(): void {
    if (!frame) frame = requestAnimationFrame(measure)
  }

  function relayout(): void {
    stickyCache = new WeakMap()
    schedule()
  }

  onMounted(() => {
    const root = host.value
    if (!root) return
    resizeObserver = new ResizeObserver(relayout)
    resizeObserver.observe(root)
    mutationObserver = new MutationObserver((records) => {
      // Perubahan di dalam lapisan hias / sticker sendiri tidak menggeser anchor.
      if (records.every((record) => (record.target as Element).closest?.(DECO_UI_SELECTOR))) return
      relayout()
    })
    mutationObserver.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    })
    // Capture: ikut menangkap scroll kolom yang punya scroll sendiri (mis. panel sticky).
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    measure()
  })

  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    resizeObserver?.disconnect()
    mutationObserver?.disconnect()
    window.removeEventListener('scroll', schedule, { capture: true })
  })

  /** Anchor teratas di titik layar (cx, cy); fallback ke area halaman. */
  function anchorAt(cx: number, cy: number): string | null {
    for (const el of document.elementsFromPoint(cx, cy)) {
      if (el.closest(DECO_UI_SELECTOR)) continue
      const id = el.closest<HTMLElement>(ANCHOR_SELECTOR)?.dataset.anchor
      if (id && anchors.value[id]) return id
    }
    return anchors.value[PAGE_ANCHOR] ? PAGE_ANCHOR : null
  }

  return { anchors, frames, anchorAt, measure }
}
