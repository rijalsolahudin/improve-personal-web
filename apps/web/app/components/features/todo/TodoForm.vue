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
      <Field :label="$t('todo.form.title')">
        <Input
          v-model="draft.title"
          data-autofocus
          :maxlength="TASK_TITLE_MAX"
          :placeholder="$t('todo.form.titlePlaceholder')"
          :aria-invalid="error === 'titleRequired' || error === 'titleTooLong'"
        />
      </Field>

      <Field :label="$t('todo.form.deadline')" is-group>
        <template #action>
          <Button variant="link" @click="draft.hasDeadline = !draft.hasDeadline">
            {{ $t(draft.hasDeadline ? 'todo.form.noDeadline' : 'todo.form.useDeadline') }}
          </Button>
        </template>
        <div v-if="draft.hasDeadline" class="pair">
          <Input
            v-model="draft.date"
            type="date"
            :aria-label="$t('todo.form.date')"
            :aria-invalid="error === 'deadline'"
          />
          <Input
            v-model="draft.time"
            type="time"
            :aria-label="$t('todo.form.time')"
            :aria-invalid="error === 'deadline'"
          />
        </div>
      </Field>

      <Field :label="$t('priority.label')" is-group>
        <TodoPriorityPicker
          v-model="draft.priority"
          variant="blocks"
          :label="$t('priority.label')"
        />
      </Field>

      <Field :label="$t('todo.form.goal')" is-group>
        <GoalPicker
          :goal-id="draft.goalId"
          :chapter-id="draft.goalChapterId"
          @select="
            (goalId, chapterId) => {
              draft.goalId = goalId
              draft.goalChapterId = chapterId
            }
          "
          @clear="
            () => {
              draft.goalId = null
              draft.goalChapterId = null
            }
          "
        />
      </Field>

      <Field :label="$t('todo.form.schedule')" is-group>
        <div class="schedules">
          <Chip
            v-for="option in scheduleOptions"
            :key="option.id ?? 'none'"
            variant="pick"
            :active="draft.scheduleId === option.id"
            @click="draft.scheduleId = option.id"
          >
            <span class="dot" :style="{ background: option.color }" aria-hidden="true" />
            {{ option.title ?? $t('todo.form.noSchedule') }}
          </Chip>
        </div>
      </Field>

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
