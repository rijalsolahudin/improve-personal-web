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
const panel = useTemplateRef<HTMLElement>('panel')

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
      aria-labelledby="schedule-form-title"
      novalidate
      @submit.prevent="submit"
    >
      <div class="top">
        <h2 id="schedule-form-title" class="heading">
          {{ $t(original ? 'calendar.form.editTitle' : 'calendar.form.newTitle') }}
        </h2>
        <IconButton
          tone="plain"
          :size="40"
          :radius="14"
          :title="$t('common.close')"
          @click="emit('close')"
        >
          ×
        </IconButton>
      </div>

      <label class="field-wrap">
        <span class="label">{{ $t('calendar.form.title') }}</span>
        <input
          v-model="draft.title"
          class="field"
          :maxlength="SCHEDULE_TITLE_MAX"
          :placeholder="$t('calendar.form.titlePlaceholder')"
          :aria-invalid="error === 'titleRequired'"
        />
      </label>

      <fieldset class="group">
        <legend class="label">{{ $t('calendar.form.color') }}</legend>
        <div class="colors">
          <button
            v-for="([solid], index) in SCHEDULE_COLORS"
            :key="solid"
            type="button"
            class="swatch"
            :style="{ background: solid }"
            :aria-pressed="draft.color === index"
            :aria-label="$t('calendar.form.colorN', { n: index + 1 })"
            @click="draft.color = index"
          />
        </div>
      </fieldset>

      <div class="pair">
        <label class="field-wrap">
          <span class="label">{{ $t('calendar.form.date') }}</span>
          <input
            v-model="draft.date"
            class="field"
            type="date"
            :aria-invalid="error === 'dateTime'"
          />
        </label>
        <label class="field-wrap">
          <span class="label">{{ $t('calendar.form.start') }}</span>
          <input
            v-model="draft.time"
            class="field"
            type="time"
            :aria-invalid="error === 'dateTime'"
          />
        </label>
      </div>

      <div>
        <Segmented
          v-model="draft.timeMode"
          class="seg-time"
          :options="timeModeOptions"
          :label="$t('calendar.form.timeMode')"
        />
        <input
          v-if="draft.timeMode === 'end'"
          v-model="draft.end"
          class="field short"
          type="time"
          :aria-label="$t('calendar.form.end')"
          :aria-invalid="error === 'duration'"
        />
        <label v-else class="dur">
          <input
            v-model.number="draft.dur"
            class="field short"
            type="number"
            min="5"
            max="1440"
            step="5"
            :aria-invalid="error === 'duration'"
          />
          <span>{{ $t('calendar.form.minutes') }}</span>
        </label>
      </div>

      <ScheduleRecurrence v-model="draft" />

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
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-panel);
  background: var(--paper);
  box-shadow: calc(10px * var(--sx)) calc(10px * var(--sy)) calc(10px * var(--sbl))
    var(--shadow-color, rgb(47 42 36 / 0.15));
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.heading {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 26px;
}

.field-wrap,
.group {
  display: flex;
  flex-direction: column;
  min-width: 0;
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

.field.short {
  width: 180px;
}

.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.swatch {
  width: 34px;
  height: 34px;
  border: var(--border-thick) solid transparent;
  border-radius: var(--radius-inner);
}

.swatch[aria-pressed='true'] {
  border-color: var(--outline);
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

.dur .field.short {
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

@media (max-width: 599px) {
  .scrim {
    padding: 16px 10px;
  }

  .panel {
    padding: 20px 18px;
  }
}
</style>
