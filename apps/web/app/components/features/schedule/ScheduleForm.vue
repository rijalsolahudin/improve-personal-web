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

/** Modal jadwal baru / edit satu kejadian (design: "Jadwal baru" / "Edit jadwal"). */
export type ScheduleFormTarget =
  { mode: 'new'; date: string; time?: string } | { mode: 'edit'; id: string; occurrence: string }

const { target } = defineProps<{ target: ScheduleFormTarget }>()
const emit = defineEmits<{ close: []; saved: [date: string] }>()

const SCOPES: readonly EditScope[] = ['this', 'following', 'all']
const TIME_MODES = ['end', 'dur'] as const

const { t } = useI18n()
const timeModeOptions = computed(() =>
  TIME_MODES.map((value) => ({ value, label: t(`calendar.form.mode.${value}`) })),
)
const scopeOptions = computed(() =>
  SCOPES.map((value) => ({ value, label: t(`calendar.form.scope.${value}`) })),
)

const { findSchedule, save, remove } = useSchedules()
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

const colorOptions = computed(() =>
  SCHEDULE_COLORS.map(([solid], index) => ({
    value: index,
    color: solid,
    label: t('calendar.form.colorN', { n: index + 1 }),
  })),
)

watch(draft, () => (error.value = null), { deep: true })
watch(scope, () => (isConfirmingDelete.value = false))

function submit(): void {
  const edit =
    original && target.mode === 'edit'
      ? { id: original.id, occurrence: target.occurrence, scope: scope.value }
      : null
  const result = save(draft.value, edit)
  if ('error' in result) error.value = result.error
  else emit('saved', draft.value.date)
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

      <div class="pair">
        <Field :label="$t('calendar.form.date')">
          <Input v-model="draft.date" type="date" :aria-invalid="error === 'dateTime'" />
        </Field>
        <Field :label="$t('calendar.form.start')">
          <Input v-model="draft.time" type="time" :aria-invalid="error === 'dateTime'" />
        </Field>
      </div>

      <div>
        <Segmented
          v-model="draft.timeMode"
          class="seg-time"
          :options="timeModeOptions"
          :label="$t('calendar.form.timeMode')"
        />
        <Input
          v-if="draft.timeMode === 'end'"
          v-model="draft.end"
          class="short"
          type="time"
          :aria-label="$t('calendar.form.end')"
          :aria-invalid="error === 'duration'"
        />
        <label v-else class="dur">
          <Input
            v-model.number="draft.dur"
            class="short"
            type="number"
            min="5"
            max="1440"
            step="5"
            :aria-invalid="error === 'duration'"
          />
          <span>{{ $t('calendar.form.minutes') }}</span>
        </label>
      </div>

      <ScheduleRecurrence v-model="draft" :error="error" />

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

.short {
  width: 180px;
}

.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.seg-time {
  width: fit-content;
  margin-bottom: 8px;
}

.seg-scope {
  width: fit-content;
}

.dur {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: var(--fw-strong);
  color: var(--mute-2);
}

.dur .short {
  width: 120px;
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
