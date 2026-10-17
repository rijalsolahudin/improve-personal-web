<script setup lang="ts">
import type { Priority } from '~/utils/tasks'

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
  gap: 14px;
  cursor: pointer;
}

.row-inset {
  padding: 12px 14px;
  border-radius: var(--radius-row);
  background: var(--alt);
}

.row-inset:hover {
  background: var(--hover);
}

.row-card {
  padding: 8px 12px;
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
  gap: 14px;
}

.title {
  flex: 1;
  min-width: 0;
  font-weight: var(--fw-body);
  font-size: var(--fs-body-lg);
}

.done .title {
  text-decoration: line-through;
  opacity: 0.5;
}

.meta {
  display: flex;
  align-items: center;
  gap: 14px;
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
    gap: 12px;
  }

  .row-inset {
    padding: 6px 12px;
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
    gap: 6px;
  }

  .left {
    min-width: 0;
    font-size: var(--fs-meta);
    text-align: left;
  }
}
</style>
