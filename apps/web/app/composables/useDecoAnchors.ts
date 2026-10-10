import type { Ref } from 'vue'

import { PAGE_ANCHOR, type AnchorRect } from '~/utils/deco'

const ANCHOR_SELECTOR = '[data-anchor]'
/** Elemen UI hias tidak boleh jadi tempat menempel. */
const DECO_UI_SELECTOR = '[data-deco-layer], [data-deco-ui]'

/**
 * Ukur posisi semua anchor (`data-anchor`) relatif ke `host`. Diukur ulang (maks sekali per
 * frame) saat ukuran berubah (ResizeObserver) atau DOM/urutan berubah (MutationObserver,
 * mis. kartu Home dipindah) — bukan tiap render.
 */
export function useDecoAnchors(host: Ref<HTMLElement | null>) {
  const anchors = shallowRef<Record<string, AnchorRect>>({})
  let frame = 0
  let resizeObserver: ResizeObserver | null = null
  let mutationObserver: MutationObserver | null = null
  const observed = new WeakSet<Element>()

  function measure(): void {
    frame = 0
    const root = host.value
    if (!root) return
    const origin = root.getBoundingClientRect()
    const next: Record<string, AnchorRect> = {}
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
    })
    if (JSON.stringify(next) !== JSON.stringify(anchors.value)) anchors.value = next
  }

  function schedule(): void {
    if (!frame) frame = requestAnimationFrame(measure)
  }

  onMounted(() => {
    const root = host.value
    if (!root) return
    resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(root)
    mutationObserver = new MutationObserver((records) => {
      // Perubahan di dalam lapisan hias sendiri tidak menggeser anchor.
      if (records.every((record) => (record.target as Element).closest?.(DECO_UI_SELECTOR))) return
      schedule()
    })
    mutationObserver.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    })
    measure()
  })

  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    resizeObserver?.disconnect()
    mutationObserver?.disconnect()
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

  return { anchors, anchorAt, measure }
}
