<script setup lang="ts">
import type { HomeTask } from '~/composables/home/types'

const { task, now } = defineProps<{ task: HomeTask; now: number }>()
const emit = defineEmits<{ toggle: [] }>()

const { t } = useI18n()
const formatTimeLeft = useTimeLeft()

const isOverdue = computed(() => !task.done && task.deadline !== null && task.deadline < now)
const timeLeft = computed(() => (task.done ? t('time.done') : formatTimeLeft(task.deadline, now)))
</script>

<template>
  <li class="row" :class="{ done: task.done }" @click="emit('toggle')">
    <UiCheckbox
      :checked="task.done"
      :label="$t('home.todo.toggle', { title: task.title })"
      @toggle="emit('toggle')"
    />
    <div class="body">
      <span class="title">{{ task.title }}</span>
      <span class="meta">
        <UiPriorityBadge :level="task.priority" />
        <span class="left" :class="{ overdue: isOverdue }">{{ timeLeft }}</span>
      </span>
    </div>
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-radius: var(--radius-row);
  background: var(--alt);
  cursor: pointer;
}

.row:hover {
  background: var(--hover);
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
  font-weight: 700;
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
  font-weight: 700;
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
    font-weight: 800;
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
