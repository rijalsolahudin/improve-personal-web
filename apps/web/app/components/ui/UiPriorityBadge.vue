<script setup lang="ts">
import type { Priority } from '~/utils/tasks'

const { level } = defineProps<{ level: Priority }>()
</script>

<template>
  <span class="badge" :class="`badge-${level}`">{{ $t(`priority.${level}`) }}</span>
</template>

<style scoped>
.badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  font-weight: 800;
  font-size: 13px;
  white-space: nowrap;
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
