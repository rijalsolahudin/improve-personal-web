<script setup lang="ts">
import {
  SCHEDULE_COLORS,
  SCHEDULE_TITLE_MAX,
  draftFromSchedule,
  newScheduleDraft,
  type EditScope,
  type ScheduleDraft,
  type ScheduleDraftError,
} from '~/utils/schedule'
import { emptyTaskDraft } from '~/utils/tasks'

/** Modal jadwal baru / edit satu kejadian (design: "Jadwal baru" / "Edit jadwal"). */
export type ScheduleFormTarget =
  { mode: 'new'; date: string; time?: string } | { mode: 'edit'; id: string; occurrence: string }

const { target } = defineProps<{ target: ScheduleFormTarget }>()
const emit = defineEmits<{ close: []; saved: [date: string] }>()

const SCOPES: readonly EditScope[] = ['this', 'following', 'all']

const { t } = useI18n()
const scopeOptions = computed(() =>
  SCOPES.map((value) => ({ value, label: t(`calendar.form.scope.${value}`) })),
)

const { findSchedule, save, remove } = useSchedules()
const { save: saveTask } = useTasks()
const original = target.mode === 'edit' ? findSchedule(target.id) : undefined
const isRecurring = original !== undefined && original.rec.type !== 'once'

function initialDraft(): ScheduleDraft {
  if (target.mode === 'new') return newScheduleDraft(target.date, target.time)
  return original
    ? draftFromSchedule(original, target.occurrence)
    : newScheduleDraft(target.occurrence)
}
const draft = ref<ScheduleDraft>(initialDraft())
const scope = ref<EditScope>(isRecurring ? 'this' : 'all')
const error = ref<ScheduleDraftError | null>(null)
const isConfirmingDelete = ref(false)
const pendingTasks = ref<string[]>([])
const linkedTitle = ref('')

const colorOptions = computed(() =>
  SCHEDULE_COLORS.map(([solid], index) => ({
    value: index,
    color: solid,
    label: t('calendar.form.colorN', { n: index + 1 }),
  })),
)

watch(draft, () => (error.value = null), { deep: true })
watch(scope, () => (isConfirmingDelete.value = false))

function toggleTimeMode(): void {
  draft.value.timeMode = draft.value.timeMode === 'end' ? 'dur' : 'end'
}

function submit(): void {
  const edit =
    original && target.mode === 'edit'
      ? { id: original.id, occurrence: target.occurrence, scope: scope.value }
      : null
  const result = save(draft.value, edit)
  if ('error' in result) {
    error.value = result.error
    return
  }
  // Sama seperti "+ Tambah task" di panel hari: deadline mengikuti tanggal jadwal.
  // Judul yang sudah diketik tapi belum di-Enter tetap dianggap niat user, bukan dibuang.
  const typed = linkedTitle.value.trim()
  const titles = typed ? [...pendingTasks.value, typed] : pendingTasks.value
  for (const title of titles) {
    saveTask({ ...emptyTaskDraft(draft.value.date), title, scheduleId: result.id }, null)
  }
  emit('saved', draft.value.date)
}

function onDelete(): void {
  if (!original || target.mode !== 'edit') return
  if (!isConfirmingDelete.value) {
    isConfirmingDelete.value = true
    return
  }
  remove(original.id, target.occurrence, scope.value)
  emit('close')
}

const deleteLabel = computed(() => {
  if (!isConfirmingDelete.value) return 'calendar.form.delete'
  return isRecurring
    ? `calendar.form.deleteConfirmScope.${scope.value}`
    : 'calendar.form.deleteConfirm'
})
</script>

<template>
  <Modal
    open
    align="top"
    width="560px"
    :title="$t(original ? 'calendar.form.editTitle' : 'calendar.form.newTitle')"
    is-dismissible
    @close="emit('close')"
  >
    <form class="form" novalidate @submit.prevent="submit">
      <Field :label="$t('calendar.form.title')">
        <Input
          v-model="draft.title"
          data-autofocus
          :maxlength="SCHEDULE_TITLE_MAX"
          :placeholder="$t('calendar.form.titlePlaceholder')"
          :aria-invalid="error === 'titleRequired'"
        />
      </Field>

      <Field :label="$t('calendar.form.color')" is-group>
        <SwatchPicker v-model="draft.color" :options="colorOptions" :size="34" />
      </Field>

      <Field :label="$t('calendar.form.date')">
        <Input v-model="draft.date" type="date" :aria-invalid="error === 'dateTime'" />
      </Field>

      <div class="pair">
        <Field :label="$t('calendar.form.start')">
          <Input v-model="draft.time" type="time" :aria-invalid="error === 'dateTime'" />
        </Field>
        <Field :label="$t(draft.timeMode === 'end' ? 'calendar.form.end' : 'calendar.form.dur')">
          <template #action>
            <Button variant="link" class="mode" @click="toggleTimeMode">
              {{ $t(draft.timeMode === 'end' ? 'calendar.form.useDur' : 'calendar.form.useEnd') }}
            </Button>
          </template>
          <Input
            v-if="draft.timeMode === 'end'"
            v-model="draft.end"
            type="time"
            :aria-invalid="error === 'duration'"
          />
          <Input
            v-else
            v-model.number="draft.dur"
            type="number"
            min="5"
            max="1440"
            step="5"
            :aria-invalid="error === 'duration'"
          />
        </Field>
      </div>

      <ScheduleRecurrence v-model="draft" :error="error" />

      <Field :label="$t('calendar.form.goal')" is-group>
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

      <ScheduleLinkedTasks
        v-model:pending="pendingTasks"
        v-model:title="linkedTitle"
        :schedule-id="original?.id ?? null"
      />

      <div v-if="isRecurring" class="scope">
        <p class="scope-label">{{ $t('calendar.form.scopeTitle') }}</p>
        <Segmented
          v-model="scope"
          class="seg-scope"
          framed
          :options="scopeOptions"
          :label="$t('calendar.form.scopeTitle')"
        />
      </div>

      <p v-if="error" class="error" role="alert">{{ $t(`calendar.form.error.${error}`) }}</p>

      <div class="actions">
        <template v-if="original">
          <Button variant="danger" @click="onDelete">{{ $t(deleteLabel) }}</Button>
          <span class="spacer" />
        </template>
        <Button variant="soft" @click="emit('close')">{{ $t('calendar.form.cancel') }}</Button>
        <Button type="submit" variant="primary">
          {{ $t(original ? 'calendar.form.saveEdit' : 'calendar.form.saveNew') }}
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

/* Tautan ganti mode menempel di kanan label; ukurannya disamakan dengan label supaya baris sejajar. */
.mode {
  font-size: 12px;
}

.seg-scope {
  width: fit-content;
}

.scope {
  padding: 14px 16px;
  border-radius: calc(20px * var(--rk));
  background: var(--soft);
}

.scope-label {
  margin-bottom: 8px;
  font-weight: var(--fw-strong);
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--deep);
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
  justify-content: flex-end;
  gap: 10px;
}

.spacer {
  flex: 1;
}
</style>
