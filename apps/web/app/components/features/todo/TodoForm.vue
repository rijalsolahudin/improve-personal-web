<script setup lang="ts">
import { SCHEDULE_COLORS } from '~/utils/schedule'
import {
  TASK_TITLE_MAX,
  draftFromTask,
  emptyTaskDraft,
  type TaskDraft,
  type TaskDraftError,
} from '~/utils/tasks'
import { toIsoDate } from '~/utils/time'

/**
 * Modal task baru / edit task (design: "Task baru" / "Edit task").
 *
 * `scheduleId` + `date` dipakai saat task dibuat dari detail jadwal: task langsung tertaut ke jadwal
 * itu dan deadlinenya mengikuti tanggal kejadian yang dipilih.
 */
const {
  taskId,
  scheduleId = null,
  date = undefined,
} = defineProps<{
  taskId: string | null
  scheduleId?: string | null
  date?: string
}>()
const emit = defineEmits<{ close: [] }>()

const NO_SCHEDULE_COLOR = 'var(--icon-off)'

const { findTask, save, remove } = useTasks()
const { schedules } = useSchedules()
const existing = findTask(taskId)
const today = toIsoDate(new Date())
const draft = ref<TaskDraft>(
  existing ? draftFromTask(existing, today) : { ...emptyTaskDraft(date ?? today), scheduleId },
)
const error = ref<TaskDraftError | null>(null)
const isConfirmingDelete = ref(false)

watch(draft, () => (error.value = null), { deep: true })

const scheduleOptions = computed(() => [
  { id: null, title: null, color: NO_SCHEDULE_COLOR },
  ...schedules.value.map((schedule) => ({
    id: schedule.id,
    title: schedule.title,
    color: (SCHEDULE_COLORS[schedule.color] ?? SCHEDULE_COLORS[0])[0],
  })),
])

function submit(): void {
  const result = save(draft.value, existing?.id ?? null)
  if ('error' in result) error.value = result.error
  else emit('close')
}

function onDelete(): void {
  if (!existing) return
  if (!isConfirmingDelete.value) {
    isConfirmingDelete.value = true
    return
  }
  remove(existing.id)
  emit('close')
}
</script>

<template>
  <Modal
    open
    align="top"
    width="560px"
    :title="$t(existing ? 'todo.form.editTitle' : 'todo.form.newTitle')"
    is-dismissible
    @close="emit('close')"
  >
    <form class="form" novalidate @submit.prevent="submit">
      <label class="field-wrap">
        <span class="label">{{ $t('todo.form.title') }}</span>
        <input
          v-model="draft.title"
          class="field"
          data-autofocus
          :maxlength="TASK_TITLE_MAX"
          :placeholder="$t('todo.form.titlePlaceholder')"
          :aria-invalid="error === 'titleRequired' || error === 'titleTooLong'"
        />
      </label>

      <div class="field-wrap">
        <div class="label-row">
          <span class="label">{{ $t('todo.form.deadline') }}</span>
          <button type="button" class="link" @click="draft.hasDeadline = !draft.hasDeadline">
            {{ $t(draft.hasDeadline ? 'todo.form.noDeadline' : 'todo.form.useDeadline') }}
          </button>
        </div>
        <div v-if="draft.hasDeadline" class="pair">
          <input
            v-model="draft.date"
            class="field"
            type="date"
            :aria-label="$t('todo.form.date')"
            :aria-invalid="error === 'deadline'"
          />
          <input
            v-model="draft.time"
            class="field"
            type="time"
            :aria-label="$t('todo.form.time')"
            :aria-invalid="error === 'deadline'"
          />
        </div>
      </div>

      <div class="field-wrap">
        <span class="label" aria-hidden="true">{{ $t('priority.label') }}</span>
        <TodoPriorityPicker
          v-model="draft.priority"
          variant="blocks"
          :label="$t('priority.label')"
        />
      </div>

      <fieldset class="field-wrap group">
        <legend class="label">{{ $t('todo.form.schedule') }}</legend>
        <div class="schedules">
          <button
            v-for="option in scheduleOptions"
            :key="option.id ?? 'none'"
            type="button"
            class="schedule"
            :aria-pressed="draft.scheduleId === option.id"
            @click="draft.scheduleId = option.id"
          >
            <span class="dot" :style="{ background: option.color }" aria-hidden="true" />
            {{ option.title ?? $t('todo.form.noSchedule') }}
          </button>
        </div>
      </fieldset>

      <p v-if="error" class="error" role="alert">{{ $t(`todo.form.error.${error}`) }}</p>

      <div class="actions">
        <Button v-if="existing" variant="danger" @click="onDelete">
          {{ $t(isConfirmingDelete ? 'todo.form.deleteConfirm' : 'todo.form.delete') }}
        </Button>
        <span class="spacer" />
        <Button variant="soft" @click="emit('close')">{{ $t('todo.form.cancel') }}</Button>
        <Button type="submit" variant="primary">
          {{ $t(existing ? 'todo.form.saveEdit' : 'todo.form.saveNew') }}
        </Button>
      </div>
    </form>
  </Modal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.field-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.group {
  margin: 0;
  padding: 0;
  border: none;
}

.label {
  margin-bottom: 6px;
  padding: 0;
  font-weight: var(--fw-strong);
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mute-2);
}

.link {
  margin-bottom: 6px;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-weight: var(--fw-strong);
  font-size: 13px;
}

.field {
  width: 100%;
  padding: 11px 14px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-btn-sq);
  background: var(--paper);
  font-weight: var(--fw-body);
  font-size: 15px;
  outline: none;
}

.field[aria-invalid='true'] {
  border-color: #e2445c;
}

.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.schedules {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.schedule {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 13px;
}

.schedule[aria-pressed='true'] {
  border-color: var(--outline);
  background: var(--soft);
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: calc(3px * var(--rk));
}

.error {
  padding: 10px 14px;
  border-radius: calc(14px * var(--rk));
  background: #ffe1da;
  color: #9a2a14;
  font-weight: var(--fw-strong);
  font-size: 14px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.spacer {
  flex: 1;
}
</style>
