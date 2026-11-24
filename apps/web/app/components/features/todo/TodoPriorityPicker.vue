<script setup lang="ts">
import { PRIORITIES, type Priority } from '@improve-personal/core/planner'

/** Pilihan prioritas: `pills` (tambah cepat) atau `blocks` (form task), sesuai design. */
const { variant = 'pills', label } = defineProps<{
  variant?: 'pills' | 'blocks'
  label: string
}>()
const priority = defineModel<Priority>({ required: true })
</script>

<template>
  <div class="picker" :class="variant" role="group" :aria-label="label">
    <button
      v-for="level in PRIORITIES"
      :key="level"
      type="button"
      :class="`level-${level}`"
      :aria-pressed="priority === level"
      @click="priority = level"
    >
      {{ $t(`priority.${level}`) }}
    </button>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  gap: 2px;
}

.pills {
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--paper);
}

.blocks {
  gap: var(--space-8);
}

button {
  border: none;
  font-weight: var(--fw-strong);
  white-space: nowrap;
}

.pills button {
  padding: var(--space-8) var(--space-12);
  border-radius: var(--radius-pill);
  background: transparent;
  font-size: var(--fs-13);
}

.blocks button {
  flex: 1;
  padding: var(--space-10);
  border-radius: calc(14px * var(--rk));
  font-size: var(--fs-14);
}

.level-urgent {
  --fg: var(--prio-urgent-fg);
  --bg: var(--prio-urgent-bg);
}

.level-medium {
  --fg: var(--prio-medium-fg);
  --bg: var(--prio-medium-bg);
}

.level-low {
  --fg: var(--prio-low-fg);
  --bg: var(--prio-low-bg);
}

button {
  color: var(--fg);
}

.blocks button {
  background: var(--bg);
}

button[aria-pressed='true'] {
  background: var(--fg);
  color: var(--paper);
}
</style>
