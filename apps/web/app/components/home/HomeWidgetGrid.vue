<script setup lang="ts">
import type { CSSProperties } from 'vue'

import {
  HOME_WIDGET_IDS,
  columnOf,
  moveWithinColumn,
  setHidden,
  swapColumn,
  toggleWide,
  type HomeWidgetId,
} from '~/utils/homeLayout'

defineSlots<Record<HomeWidgetId | 'countdown', () => unknown>>()

const { layout, isEditing, update, commit } = useHomeLayout()
const gridEl = useTemplateRef<HTMLElement>('grid')
const { isTwoColumn, rowSpan } = useHomeGrid(gridEl, layout)
const { draggingId, grab } = useWidgetDrag({
  gridEl,
  layout,
  isTwoColumn,
  preview: (next) => update(next, { persist: false }),
  commit,
})

/**
 * Dua kolom: urutan baris berselang L/R + `grid-auto-flow: dense` = masonry.
 * Satu kolom: semua L lalu semua R (Home Desktop.dc.html). Nilai dikali 2 supaya
 * countdown (khusus mobile, di luar layout) bisa diselipkan tepat setelah Goal.
 */
function orderOf(id: HomeWidgetId): number {
  const column = columnOf(layout.value, id)
  const index = layout.value[column].indexOf(id)
  if (isTwoColumn.value) return (index * 2 + (column === 'R' ? 1 : 0)) * 2
  return (column === 'R' ? 100 + index : index) * 2
}

function gridColumn(id: HomeWidgetId): string {
  if (!isTwoColumn.value || layout.value.wide.includes(id)) return '1 / -1'
  return columnOf(layout.value, id) === 'L' ? '1' : '2'
}

const cellStyles = computed(() => {
  const styles = {} as Record<HomeWidgetId | 'countdown', CSSProperties>
  for (const id of HOME_WIDGET_IDS) {
    styles[id] = {
      gridColumn: gridColumn(id),
      gridRow: `span ${rowSpan(id)}`,
      order: orderOf(id),
      ...(layout.value.hidden.includes(id) && { display: 'none' }),
    }
  }
  styles.countdown = {
    gridColumn: '1 / -1',
    gridRow: `span ${rowSpan('countdown')}`,
    order: orderOf('goal') + 1,
  }
  return styles
})

const gridStyle: CSSProperties = { gridAutoRows: `${HOME_GRID_ROW}px` }
</script>

<template>
  <div ref="grid" class="grid" :class="{ two: isTwoColumn }" :style="gridStyle">
    <HomeLayoutCell
      v-for="id in HOME_WIDGET_IDS"
      :id="id"
      :key="id"
      :style="cellStyles[id]"
      :is-editing="isEditing"
      :is-two-column="isTwoColumn"
      :is-wide="layout.wide.includes(id)"
      :is-dragging="draggingId === id"
      @move="(delta) => update(moveWithinColumn(layout, id, delta))"
      @swap="update(swapColumn(layout, id))"
      @toggle-wide="update(toggleWide(layout, id))"
      @hide="update(setHidden(layout, id, true))"
      @grab="(event) => grab(event, id)"
    >
      <slot :name="id" />
    </HomeLayoutCell>
    <div class="countdown" :style="cellStyles.countdown">
      <div class="countdown-inner" data-widget-inner="countdown">
        <div data-anchor="countdown" data-anchor-kind="content">
          <slot name="countdown" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-auto-flow: dense;
  align-items: start;
}

.grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: var(--gap-desktop);
}

/* Countdown cuma ada di desain mobile. */
.countdown {
  display: none;
  min-width: 0;
}

.countdown-inner {
  display: flow-root;
  padding-bottom: var(--gap-mobile);
}

@media (max-width: 599px) {
  .countdown {
    display: block;
  }
}
</style>
