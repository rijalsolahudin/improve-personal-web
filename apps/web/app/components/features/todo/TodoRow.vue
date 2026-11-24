<script setup lang="ts">
import {
  SCHEDULE_COLORS,
  QUADRANT_STYLE,
  isOverdue,
  type Task,
  formatHourMinute,
} from '@improve-personal/core/planner'

const { task, now } = defineProps<{ task: Task; now: number }>()
defineEmits<{ toggle: []; edit: []; focus: [title: string] }>()

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
  <li class="row hover-reveal" :class="{ done: task.done }">
    <Checkbox
      :checked="task.done"
      :label="$t('common.toggleDone', { title: task.title })"
      @toggle="$emit('toggle')"
    />
    <button type="button" class="main" :title="$t('todo.editHint')" @click="$emit('edit')">
      <span class="title">{{ task.title }}</span>
      <span class="chips">
        <PriorityBadge :level="task.priority" />
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
    <Button
      variant="chip"
      size="xs"
      class="focus reveal"
      :aria-label="$t('daily.focusLabel', { title: task.title })"
      @click.stop="$emit('focus', task.title)"
    >
      {{ $t('daily.focus') }}
    </Button>
    <IconButton
      tone="muted"
      :size="30"
      :radius="15"
      class="edit reveal"
      :title="$t('daily.editLabel', { title: task.title })"
      @click.stop="$emit('edit')"
    >
      <Icon name="pencil" :size="15" />
    </IconButton>
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
  gap: var(--space-14);
  padding: var(--space-14) var(--space-4);
}

.row + .row {
  border-top: var(--border-thin) dashed var(--line-2);
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
  font-weight: var(--fw-strong);
  font-size: var(--fs-16);
}

.done .title {
  text-decoration: line-through;
  /* Redup lewat token teks, bukan `opacity`: opacity 0.5 memudarkan `--ink` sampai ~2,8:1
     (gagal AA 4.5:1). `--mute-3` terukur >= 5,38:1 di `--paper`/`--alt` (QA #62). */
  color: var(--mute-3);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6);
  margin-top: var(--space-6);
}

.chip {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: 3px var(--space-10);
  border-radius: var(--radius-pill);
  background: var(--alt);
  color: var(--ink-2);
  font-weight: var(--fw-strong);
  font-size: var(--fs-12);
}

/* Design: chip prioritas seukuran chip jadwal/kuadran di baris ini (12px, 3x10). */
.row .main :deep(.badge) {
  padding: 3px var(--space-10);
  font-size: var(--fs-12);
}

/* Design baris To-do: pill "▶ Fokus" 30px yang muncul saat hover (desktop) / selalu di layar sentuh. */
.row .focus {
  flex-shrink: 0;
  min-height: 30px;
  padding: 0 var(--space-12);
  font-size: var(--fs-13);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: calc(3px * var(--rk));
}

.when {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}

.left {
  font-weight: var(--fw-strong);
  font-size: var(--fs-14);
  /* Design memakai #8A7B68 (di bawah 4,5:1 di atas --paper), jadi tetap token teks `--mute`
     yang lolos AA - sama seperti keputusan QA #62 untuk state selesai. */
  color: var(--mute);
}

.left.overdue {
  color: var(--danger);
}

.deadline {
  font-weight: var(--fw-body);
  font-size: var(--fs-12);
  color: var(--mute-3);
}

@media (max-width: 599px) {
  .row {
    flex-wrap: wrap;
    gap: var(--space-10) var(--space-12);
  }

  .when {
    width: 100%;
    flex-direction: row;
    justify-content: space-between;
    padding-left: var(--space-40);
  }
}
</style>
