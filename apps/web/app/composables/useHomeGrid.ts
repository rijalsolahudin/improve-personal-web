import type { Ref } from 'vue'

import type { HomeLayout } from '~/utils/homeLayout'

/** Design: dua kolom mulai lebar grid 860px. */
export const HOME_TWO_COLUMN_MIN = 860
/** Tinggi baris grid masonry; tiap widget span = ceil(tinggi / ROW). */
export const HOME_GRID_ROW = 4
const FLIP_MS = 240

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Grid masonry Home: ukur lebar grid (1/2 kolom) + tinggi tiap widget lewat satu
 * ResizeObserver, dan animasikan perpindahan widget (FLIP) tiap layout berubah.
 */
export function useHomeGrid(gridEl: Ref<HTMLElement | null>, layout: Readonly<Ref<HomeLayout>>) {
  const gridWidth = ref(0)
  const heights = shallowRef<Record<string, number>>({})
  const isTwoColumn = computed(() => gridWidth.value >= HOME_TWO_COLUMN_MIN)

  function rowSpan(id: string): number {
    return Math.max(1, Math.ceil((heights.value[id] ?? 0) / HOME_GRID_ROW))
  }

  let observer: ResizeObserver | null = null

  onMounted(() => {
    const grid = gridEl.value
    if (!grid) return
    observer = new ResizeObserver((entries) => {
      let next: Record<string, number> | null = null
      for (const entry of entries) {
        const el = entry.target as HTMLElement
        if (el === grid) {
          gridWidth.value = el.offsetWidth
          continue
        }
        const id = el.dataset.widgetInner
        if (!id || heights.value[id] === el.offsetHeight) continue
        next ??= { ...heights.value }
        next[id] = el.offsetHeight
      }
      if (next) heights.value = next
    })
    observer.observe(grid)
    grid.querySelectorAll<HTMLElement>('[data-widget-inner]').forEach((el) => observer?.observe(el))
  })

  onBeforeUnmount(() => observer?.disconnect())

  function cellRects(): Map<HTMLElement, DOMRect> {
    const rects = new Map<HTMLElement, DOMRect>()
    gridEl.value
      ?.querySelectorAll<HTMLElement>('[data-widget]')
      .forEach((el) => rects.set(el, el.getBoundingClientRect()))
    return rects
  }

  // `flush: 'pre'` = DOM masih posisi lama → catat, lalu setelah render geser balik & animasikan.
  watch(
    layout,
    () => {
      if (!gridEl.value || prefersReducedMotion()) return
      const before = cellRects()
      nextTick(() => {
        for (const [el, old] of before) {
          const now = el.getBoundingClientRect()
          const dx = old.left - now.left
          const dy = old.top - now.top
          if (!dx && !dy) continue
          el.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
            { duration: FLIP_MS, easing: 'cubic-bezier(.2,.8,.2,1)' },
          )
        }
      })
    },
    { flush: 'pre' },
  )

  return { isTwoColumn, rowSpan }
}
