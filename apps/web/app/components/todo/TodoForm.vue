<script setup lang="ts">
import { SCHEDULE_COLORS } from '~/utils/schedule'
import {
  TASK_NOTE_MAX,
  TASK_TITLE_MAX,
  draftFromTask,
  emptyTaskDraft,
  type TaskDraft,
  type TaskDraftError,
} from '~/utils/tasks'
import { toIsoDate } from '~/utils/time'

/** Modal task baru / edit task (design: "Task baru" / "Edit task"). */
const { taskId } = defineProps<{ taskId: string | null }>()
const emit = defineEmits<{ close: [] }>()

const NO_SCHEDULE_COLOR = 'var(--icon-off)'

const { findTask, save, remove } = useTasks()
const { schedules } = useSchedules()
const existing = findTask(taskId)
const today = toIsoDate(new Date())
const draft = ref<TaskDraft>(existing ? draftFromTask(existing, today) : emptyTaskDraft(today))
const error = ref<TaskDraftError | null>(null)
const isConfirmingDelete = ref(false)
const panel = useTemplateRef<HTMLElement>('panel')

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

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}
onMounted(() => {
  panel.value?.querySelector<HTMLInputElement>('input')?.focus()
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <form
      ref="panel"
      class="panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="todo-form-title"
      novalidate
      @submit.prevent="submit"
    >
      <div class="top">
        <h2 id="todo-form-title" class="heading">
          {{ $t(existing ? 'todo.form.editTitle' : 'todo.form.newTitle') }}
        </h2>
        <button type="button" class="close" :aria-label="$t('common.close')" @click="emit('close')">
          ×
        </button>
      </div>

      <label class="field-wrap">
        <span class="label">{{ $t('todo.form.title') }}</span>
        <input
          v-model="draft.title"
          class="field"
          :maxlength="TASK_TITLE_MAX"
          :placeholder="$t('todo.form.titlePlaceholder')"
          :aria-invalid="error === 'titleRequired' || error === 'titleTooLong'"
        />
      </label>
      <label class="field-wrap">
        <span class="label">{{ $t('todo.form.note') }}</span>
        <textarea
          v-model="draft.note"
          class="field area"
          :maxlength="TASK_NOTE_MAX"
          :placeholder="$t('todo.form.notePlaceholder')"
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
        <button v-if="existing" type="button" class="delete" @click="onDelete">
          {{ $t(isConfirmingDelete ? 'todo.form.deleteConfirm' : 'todo.form.delete') }}
        </button>
        <span class="spacer" />
        <button type="button" class="cancel" @click="emit('close')">
          {{ $t('todo.form.cancel') }}
        </button>
        <button type="submit" class="save">
          {{ $t(existing ? 'todo.form.saveEdit' : 'todo.form.saveNew') }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  padding: 40px 20px;
  background: rgb(47 42 36 / 0.4);
}

.panel {
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 26px 28px;
  border: 3px solid var(--ink);
  border-radius: 32px;
  background: var(--paper);
  box-shadow: 0 10px 0 rgb(47 42 36 / 0.15);
}

.top,
.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.heading {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 26px;
}

.close {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 14px;
  background: var(--chip);
  font-weight: 800;
  font-size: 18px;
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
  font-weight: 800;
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
  font-weight: 800;
  font-size: 13px;
}

.field {
  width: 100%;
  padding: 11px 14px;
  border: 2.5px solid var(--ink);
  border-radius: 16px;
  background: var(--paper);
  font-weight: 700;
  font-size: 15px;
  outline: none;
}

.field:focus-visible {
  outline: 3px solid var(--accent);
}

.field[aria-invalid='true'] {
  border-color: #e2445c;
}

.area {
  min-height: 64px;
  resize: vertical;
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
  border: 2px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-weight: 800;
  font-size: 13px;
}

.schedule[aria-pressed='true'] {
  border-color: var(--ink);
  background: var(--soft);
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
}

.error {
  padding: 10px 14px;
  border-radius: 14px;
  background: #ffe1da;
  color: #9a2a14;
  font-weight: 800;
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

.actions button {
  padding: 13px 22px;
  border: none;
  border-radius: var(--radius-pill);
  font-weight: 800;
  font-size: 15px;
}

.actions .delete {
  padding: 11px 18px;
  border: 2px solid #f3a99a;
  background: transparent;
  color: #c2381a;
}

.cancel {
  background: var(--chip);
}

.save {
  background: var(--accent);
  color: var(--paper);
}

@media (max-width: 599px) {
  .scrim {
    padding: 16px 10px;
  }

  .panel {
    padding: 20px 18px;
  }
}
</style>
