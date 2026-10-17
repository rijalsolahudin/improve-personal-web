<script setup lang="ts">
import type { PriorityTask } from '~/utils/dailyRoutine'
import { QUADRANT_STYLE, isOverdue } from '~/utils/tasks'

/** Satu baris Prioritas Daily (PRD F12): nomor, judul, penanda asal, prioritas, sisa waktu. */
const { item, index, now } = defineProps<{ item: PriorityTask; index: number; now: number }>()
const emit = defineEmits<{ toggle: []; focus: [title: string]; edit: [] }>()

const { t } = useI18n()
const formatTimeLeft = useTimeLeft()

const task = computed(() => item.task)
const timeLeft = computed(() =>
  task.value.done ? t('time.done') : formatTimeLeft(task.value.deadline, now),
)
</script>

<template>
  <li class="row hover-reveal" :class="{ done: task.done }">
    <span class="num" aria-hidden="true">{{ index + 1 }}</span>
    <div class="text">
      <span class="task-title">{{ task.title }}</span>
      <span class="meta">
        <!-- Asal "Urgent" sudah terwakili badge prioritasnya, jadi chip asal cuma untuk kuadran. -->
        <span
          v-if="item.origin === 'quadrant'"
          class="origin"
          :style="{ background: QUADRANT_STYLE.do.bg, color: QUADRANT_STYLE.do.text }"
        >
          {{ $t('daily.prio.origin.quadrant') }}
        </span>
        <PriorityBadge :level="task.priority" size="sm" />
        <span class="left" :class="{ overdue: isOverdue(task, now) }">{{ timeLeft }}</span>
      </span>
    </div>
    <button
      v-if="!task.done"
      type="button"
      class="focus reveal"
      :aria-label="$t('daily.focusLabel', { title: task.title })"
      @click="emit('focus', task.title)"
    >
      {{ $t('daily.focus') }}
    </button>
    <button
      type="button"
      class="edit reveal"
      :aria-label="$t('daily.editLabel', { title: task.title })"
      @click="emit('edit')"
    >
      <Icon name="pencil" :size="16" />
    </button>
    <Checkbox
      :checked="task.done"
      :label="$t('common.toggleDone', { title: task.title })"
      @toggle="emit('toggle')"
    />
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px 12px 16px;
  border: var(--border) solid var(--outline);
  border-radius: calc(20px * var(--rk)) calc(20px * var(--rk)) calc(20px * var(--rk))
    calc(7px * var(--rk));
  background: var(--paper);
  box-shadow: var(--shadow-drop-sm);
}

.num {
  width: 20px;
  flex-shrink: 0;
  text-align: center;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 30px;
  line-height: 1;
  color: var(--accent);
}

.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.task-title {
  font-weight: var(--fw-strong);
  font-size: 15.5px;
  line-height: 1.25;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}

.origin {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  font-weight: var(--fw-strong);
  font-size: 10.5px;
  white-space: nowrap;
}

.left {
  font-weight: var(--fw-strong);
  font-size: 11.5px;
  color: var(--mute-3);
  font-variant-numeric: tabular-nums;
}

.left.overdue {
  color: var(--danger);
}

.done .num,
.done .text {
  opacity: 0.55;
}

.done .task-title {
  text-decoration: line-through;
}

.focus,
.edit {
  height: 32px;
  flex-shrink: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--chip);
  color: var(--deep);
}

.focus {
  padding: 0 12px;
  font-weight: var(--fw-strong);
  font-size: 12.5px;
  white-space: nowrap;
}

.edit {
  width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.focus:hover,
.edit:hover {
  background: var(--hover);
}
</style>
