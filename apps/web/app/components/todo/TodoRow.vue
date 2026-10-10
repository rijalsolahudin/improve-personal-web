<script setup lang="ts">
import { SCHEDULE_COLORS } from '~/utils/schedule'
import { QUADRANT_STYLE, isOverdue, type Task } from '~/utils/tasks'
import { formatHourMinute } from '~/utils/time'

const { task, now } = defineProps<{ task: Task; now: number }>()
defineEmits<{ toggle: []; edit: [] }>()

const { t } = useI18n()
const formatTimeLeft = useTimeLeft()
const { dayMonth } = useDateFormat()
const { findSchedule } = useSchedules()

const schedule = computed(() => (task.scheduleId ? findSchedule(task.scheduleId) : undefined))
const scheduleColor = computed(() =>
  schedule.value ? (SCHEDULE_COLORS[schedule.value.color] ?? SCHEDULE_COLORS[0])[0] : '',
)
const quadrant = computed(() => (task.quadrant ? QUADRANT_STYLE[task.quadrant] : null))
const timeLeft = computed(() => (task.done ? t('time.done') : formatTimeLeft(task.deadline, now)))
const deadlineLabel = computed(() =>
  task.deadline === null ? '' : `${dayMonth(task.deadline)}, ${formatHourMinute(task.deadline)}`,
)
</script>

<template>
  <li class="row" :class="{ done: task.done }">
    <UiCheckbox
      :checked="task.done"
      :label="$t('home.todo.toggle', { title: task.title })"
      @toggle="$emit('toggle')"
    />
    <button type="button" class="main" :title="$t('todo.editHint')" @click="$emit('edit')">
      <span class="title">{{ task.title }}</span>
      <span v-if="task.note" class="note">{{ task.note }}</span>
      <span class="chips">
        <UiPriorityBadge :level="task.priority" />
        <span v-if="schedule" class="chip">
          <span class="dot" :style="{ background: scheduleColor }" aria-hidden="true" />
          {{ schedule.title }}
        </span>
        <span
          v-if="task.quadrant && quadrant"
          class="chip"
          :style="{ background: quadrant.bg, color: quadrant.text }"
        >
          ⊞ {{ $t(`eisenhower.quadrant.${task.quadrant}`) }}
        </span>
      </span>
    </button>
    <span class="when">
      <span class="left" :class="{ overdue: isOverdue(task, now) }">{{ timeLeft }}</span>
      <span class="deadline">{{ deadlineLabel }}</span>
    </span>
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 4px;
}

.row + .row {
  border-top: 2px dashed var(--line-2);
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
}

.title {
  font-weight: 800;
  font-size: 16px;
}

.done .title {
  text-decoration: line-through;
  opacity: 0.5;
}

.note {
  overflow: hidden;
  font-weight: 600;
  font-size: 13px;
  color: var(--mute);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--alt);
  color: var(--ink-2);
  font-weight: 800;
  font-size: 12px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 3px;
}

.when {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}

.left {
  font-weight: 800;
  font-size: 14px;
  color: var(--mute);
}

.left.overdue {
  color: #c2381a;
}

.deadline {
  font-weight: 700;
  font-size: 12px;
  color: var(--mute-3);
}

@media (max-width: 599px) {
  .row {
    flex-wrap: wrap;
    gap: 10px 12px;
  }

  .when {
    width: 100%;
    flex-direction: row;
    justify-content: space-between;
    padding-left: 38px;
  }
}
</style>
