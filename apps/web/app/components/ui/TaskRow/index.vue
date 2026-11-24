<script setup lang="ts">
import type { Priority } from '@improve-personal/core/planner'

const {
  title,
  priority = 'medium',
  meta = undefined,
  done = false,
  overdue = false,
  variant = 'inset',
  label = undefined,
} = defineProps<{
  title: string
  priority?: Priority
  /** Sisa waktu, mis. "Sisa 3 jam". */
  meta?: string
  done?: boolean
  overdue?: boolean
  /** inset = baris di dalam kartu paper; card = baris berdiri sendiri. */
  variant?: 'inset' | 'card'
  label?: string
}>()

defineEmits<{ toggle: [] }>()

const { t } = useI18n()
const checkLabel = computed(() => label ?? t('common.toggleDone', { title }))
</script>

<template>
  <li
    class="row"
    :class="[`row-${variant}`, { done }]"
    @click="variant === 'inset' && $emit('toggle')"
  >
    <Checkbox :checked="done" :label="checkLabel" @toggle="$emit('toggle')" />
    <div class="body">
      <span class="title">{{ title }}</span>
      <span class="meta">
        <PriorityBadge :level="priority" />
        <span v-if="meta" class="left" :class="{ overdue: overdue && !done }">{{ meta }}</span>
      </span>
    </div>
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: var(--space-14);
  cursor: pointer;
}

.row-inset {
  padding: var(--space-12) var(--space-14);
  border-radius: var(--radius-row);
  background: var(--alt);
}

.row-inset:hover {
  background: var(--hover);
}

.row-card {
  padding: var(--space-8) var(--space-12);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-row);
  background: var(--paper);
  cursor: default;
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-14);
}

.title {
  flex: 1;
  min-width: 0;
  font-weight: var(--fw-body);
  font-size: var(--fs-body-lg);
}

.done .title {
  text-decoration: line-through;
  /* `--mute-3` >= 5,38:1 di `--paper` maupun `--alt` (QA #62); jangan dimudarkan lewat opacity. */
  color: var(--mute-3);
}

.meta {
  display: flex;
  align-items: center;
  gap: var(--space-14);
}

.left {
  min-width: 110px;
  font-weight: var(--fw-body);
  font-size: var(--fs-body-sm);
  color: var(--mute);
  text-align: right;
}

.overdue {
  color: var(--danger);
}

@media (max-width: 599px) {
  .row {
    min-height: 52px;
    gap: var(--space-12);
  }

  .row-inset {
    padding: var(--space-6) var(--space-12);
    border-radius: var(--radius-btn-sq);
  }

  .body {
    flex-direction: column;
    align-items: stretch;
    gap: 1px;
  }

  .title {
    overflow: hidden;
    font-weight: var(--fw-strong);
    font-size: var(--fs-body);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .meta {
    gap: var(--space-6);
  }

  .left {
    min-width: 0;
    font-size: var(--fs-meta);
    text-align: left;
  }
}
</style>
