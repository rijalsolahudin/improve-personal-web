<script setup lang="ts">
import { isOverdue, type Task } from '~/utils/tasks'

/** Kartu task di kuadran: pegangan drag, centang, sisa waktu, titik prioritas, keluarkan. */
const {
  task,
  now,
  isDragging = false,
} = defineProps<{
  task: Task
  now: number
  isDragging?: boolean
}>()
defineEmits<{ toggle: []; remove: [] }>()

const { t } = useI18n()
const formatTimeLeft = useTimeLeft()
const timeLeft = computed(() => (task.done ? t('time.done') : formatTimeLeft(task.deadline, now)))
</script>

<template>
  <li class="card" :class="{ done: task.done, dragging: isDragging }" :data-drop-item="task.id">
    <span class="grip" data-drag-handle aria-hidden="true">⋮⋮</span>
    <Checkbox
      :checked="task.done"
      :label="$t('common.toggleDone', { title: task.title })"
      @toggle="$emit('toggle')"
    />
    <span class="text">
      <span class="title">{{ task.title }}</span>
      <span class="left" :class="{ overdue: isOverdue(task, now) }">{{ timeLeft }}</span>
    </span>
    <span
      class="prio"
      :style="{ background: `var(--prio-${task.priority}-fg)` }"
      :title="$t(`priority.${task.priority}`)"
    />
    <IconButton
      tone="muted"
      :size="26"
      :radius="9"
      class="remove"
      :title="$t('eisenhower.removeTask', { title: task.title })"
      @click="$emit('remove')"
    >
      ×
    </IconButton>
  </li>
</template>

<style scoped>
.card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 10px 6px;
  border: var(--border) solid var(--outline);
  border-radius: calc(16px * var(--rk)) calc(16px * var(--rk)) calc(16px * var(--rk))
    calc(6px * var(--rk));
  background: var(--paper);
  box-shadow: calc(3px * var(--sx)) calc(3px * var(--sy)) calc(3px * var(--sbl))
    var(--shadow-color, rgb(47 42 36 / 0.12));
  cursor: grab;
  user-select: none;
}

.card.dragging {
  opacity: 0.35;
}

.grip {
  padding: 4px 2px;
  color: var(--mute-3);
  font-weight: var(--fw-strong);
  cursor: grab;
  touch-action: none;
}

.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.title {
  font-weight: var(--fw-strong);
  font-size: 14px;
}

.done .title {
  text-decoration: line-through;
  opacity: 0.55;
}

.left {
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute);
}

.left.overdue {
  color: #c2381a;
}

.prio {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
}
</style>
