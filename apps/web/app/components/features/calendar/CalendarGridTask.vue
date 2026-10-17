<script setup lang="ts">
import type { GridTask } from '~/composables/useTimeGrid'
import { formatMinutes } from '~/utils/schedule'

/** To-do ber-deadline (tanpa jadwal tertaut) di jam deadline-nya; klik = centang (design). */
const { item, isCompact = false } = defineProps<{ item: GridTask; isCompact?: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

const style = computed(() => ({
  top: `${item.top}px`,
  height: `${item.height}px`,
  left: `calc(${item.left}% + 2px)`,
  width: `calc(${item.width}% - 4px)`,
}))
</script>

<template>
  <button
    type="button"
    role="checkbox"
    class="marker"
    :class="{ done: item.task.done, compact: isCompact }"
    :style="style"
    :aria-checked="item.task.done"
    :aria-label="$t('common.toggleDone', { title: item.task.title })"
    @click="emit('toggle')"
  >
    <span class="box" aria-hidden="true">{{ item.task.done ? '✓' : '' }}</span>
    <span class="title">{{ item.task.title }}</span>
    <template v-if="!isCompact">
      <span
        class="prio"
        :style="{ background: `var(--prio-${item.task.priority}-fg)` }"
        :title="$t(`priority.${item.task.priority}`)"
      />
      <span class="time">{{ formatMinutes(item.start) }}</span>
    </template>
  </button>
</template>

<style scoped>
.marker {
  position: absolute;
  z-index: 2;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: calc(1.5px * var(--bk)) dashed var(--dash-2);
  border-radius: calc(10px * var(--rk));
  background: var(--paper);
  color: var(--ink);
  text-align: left;
}

.marker.compact {
  padding: 3px 5px;
}

.marker:hover {
  background: var(--hover);
}

.box {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border-thin) solid var(--outline);
  border-radius: calc(6px * var(--rk)) calc(6px * var(--rk)) calc(6px * var(--rk))
    calc(2px * var(--rk));
  background: var(--paper);
  color: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 9px;
}

.done .box {
  background: var(--icon-todo);
}

.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
  font-weight: var(--fw-medium);
  font-size: 12.5px;
  line-height: 1.2;
}

.marker:not(.compact) .title {
  white-space: nowrap;
  text-overflow: ellipsis;
}

.done .title {
  text-decoration: line-through;
  color: var(--mute-3);
}

.prio {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: calc(3px * var(--rk));
}

.time {
  flex-shrink: 0;
  font-weight: var(--fw-body);
  font-size: 10.5px;
  color: var(--mute-3);
  font-variant-numeric: tabular-nums;
}
</style>
