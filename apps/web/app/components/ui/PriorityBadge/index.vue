<script setup lang="ts">
import type { Priority } from '@improve-personal/core/planner'

const { level, size = 'md' } = defineProps<{ level: Priority; size?: 'md' | 'sm' }>()
</script>

<template>
  <span class="badge" :class="[`badge-${level}`, `size-${size}`]">
    {{ $t(`priority.${level}`) }}
  </span>
</template>

<style scoped>
.badge {
  display: inline-block;
  padding: var(--space-4) var(--space-12);
  border-radius: var(--radius-pill);
  font-weight: var(--fw-strong);
  font-size: var(--fs-13);
  white-space: nowrap;
}

.badge.size-sm {
  padding: 1px var(--space-8);
  font-size: var(--fs-11);
}

.badge-urgent {
  background: var(--prio-urgent-bg);
  color: var(--prio-urgent-fg);
}

.badge-medium {
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
}

.badge-low {
  background: var(--prio-low-bg);
  color: var(--prio-low-fg);
}

@media (max-width: 599px) {
  .badge {
    padding: 1px var(--space-8);
    font-size: var(--fs-12);
  }
}
</style>
