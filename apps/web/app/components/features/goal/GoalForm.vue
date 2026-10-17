<script setup lang="ts">
import {
  GOAL_CATEGORIES,
  GOAL_STATUSES,
  GOAL_TITLE_MAX,
  GOAL_WHY_MAX,
  draftFromGoal,
  emptyGoalDraft,
  type GoalDraft,
  type GoalDraftError,
} from '~/utils/goals'

/** Modal buat/edit goal (design: "Goal baru" / "Edit goal"). */
const { goalId } = defineProps<{ goalId: string | null }>()
const emit = defineEmits<{ close: []; saved: [id: string]; deleted: [] }>()

const { t } = useI18n()
const statusOptions = computed(() =>
  GOAL_STATUSES.map((value) => ({ value, label: t(`goals.status.${value}`) })),
)

const { findGoal, save, remove, today } = useGoals()
const existing = findGoal(goalId)
const draft = ref<GoalDraft>(existing ? draftFromGoal(existing) : emptyGoalDraft(today.value))
const error = ref<GoalDraftError | null>(null)
const isConfirmingDelete = ref(false)
const panel = useTemplateRef<HTMLElement>('panel')

// Error hilang begitu user mengubah isian lagi.
watch(draft, () => (error.value = null), { deep: true })

function submit(): void {
  const result = save(draft.value, existing?.id ?? null)
  if ('error' in result) error.value = result.error
  else emit('saved', result.id)
}

function onDelete(): void {
  if (!existing) return
  if (!isConfirmingDelete.value) {
    isConfirmingDelete.value = true
    return
  }
  remove(existing.id)
  emit('deleted')
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
      aria-labelledby="goal-form-title"
      novalidate
      @submit.prevent="submit"
    >
      <div class="top">
        <h2 id="goal-form-title" class="heading">
          {{ $t(existing ? 'goals.form.editTitle' : 'goals.form.newTitle') }}
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
        <span class="label">{{ $t('goals.form.title') }}</span>
        <input
          v-model="draft.title"
          class="field"
          :maxlength="GOAL_TITLE_MAX"
          :placeholder="$t('goals.form.titlePlaceholder')"
          :aria-invalid="error === 'titleRequired' || error === 'titleTooLong'"
        />
      </label>
      <label class="field-wrap">
        <span class="label">{{ $t('goals.form.why') }}</span>
        <textarea
          v-model="draft.why"
          class="field area"
          :maxlength="GOAL_WHY_MAX"
          :placeholder="$t('goals.form.whyPlaceholder')"
        />
      </label>

      <fieldset class="group">
        <legend class="label">{{ $t('goals.form.category') }}</legend>
        <div class="cats">
          <button
            v-for="category in GOAL_CATEGORIES"
            :key="category"
            type="button"
            class="cat"
            :aria-pressed="draft.category === category"
            :style="{ '--tint': `var(--cat-${category}-tint)` }"
            @click="draft.category = category"
          >
            <span
              class="dot"
              :style="{ background: `var(--cat-${category})` }"
              aria-hidden="true"
            />
            {{ $t(`goals.category.${category}`) }}
          </button>
        </div>
      </fieldset>

      <div class="dates">
        <label class="field-wrap">
          <span class="label">{{ $t('goals.form.start') }}</span>
          <input v-model="draft.start" class="field" type="date" />
        </label>
        <label class="field-wrap">
          <span class="label">{{ $t('goals.form.end') }}</span>
          <input
            v-model="draft.end"
            class="field"
            type="date"
            :min="draft.start"
            :aria-invalid="error === 'dateOrder'"
          />
        </label>
      </div>

      <fieldset class="group">
        <legend class="label">{{ $t('goals.form.status') }}</legend>
        <Segmented
          v-model="draft.status"
          class="seg-fit"
          :options="statusOptions"
          :label="$t('goals.form.status')"
        />
      </fieldset>

      <GoalFormChapters
        :draft="draft"
        :show-errors="error === 'chapterRange'"
        @change="(chapters) => (draft.chapters = chapters)"
      />

      <p v-if="error" class="error" role="alert">{{ $t(`goals.form.error.${error}`) }}</p>

      <div class="actions">
        <Button v-if="existing" variant="danger" @click="onDelete">
          {{ $t(isConfirmingDelete ? 'goals.form.deleteConfirm' : 'goals.form.delete') }}
        </Button>
        <span class="spacer" />
        <Button variant="soft" @click="emit('close')">{{ $t('goals.form.cancel') }}</Button>
        <Button type="submit" variant="primary">
          {{ $t(existing ? 'goals.form.saveEdit' : 'goals.form.saveNew') }}
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
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 18px;
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

.area {
  min-height: 72px;
  resize: vertical;
}

.cats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cat {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border: var(--border) solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 14px;
}

.cat[aria-pressed='true'] {
  border-color: var(--outline);
  background: var(--tint);
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.dates {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.seg-fit {
  width: fit-content;
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

@media (max-width: 599px) {
  .scrim {
    padding: 16px 10px;
  }

  .panel {
    padding: 20px 18px;
  }
}
</style>
