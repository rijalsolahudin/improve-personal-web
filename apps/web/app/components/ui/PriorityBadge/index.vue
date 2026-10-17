<script setup lang="ts">
import type { Priority } from '~/utils/tasks'

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
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  font-weight: var(--fw-strong);
  font-size: 13px;
  white-space: nowrap;
}

.badge.size-sm {
  padding: 1px 7px;
  font-size: 10.5px;
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
    padding: 1px 8px;
    font-size: 11px;
  }
}
</style>
