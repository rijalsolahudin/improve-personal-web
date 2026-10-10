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
        <button type="button" class="close" :aria-label="$t('common.close')" @click="emit('close')">
          ×
        </button>
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
        <div class="statuses">
          <button
            v-for="status in GOAL_STATUSES"
            :key="status"
            type="button"
            :aria-pressed="draft.status === status"
            @click="draft.status = status"
          >
            {{ $t(`goals.status.${status}`) }}
          </button>
        </div>
      </fieldset>

      <GoalFormChapters
        :draft="draft"
        :show-errors="error === 'chapterRange'"
        @change="(chapters) => (draft.chapters = chapters)"
      />

      <p v-if="error" class="error" role="alert">{{ $t(`goals.form.error.${error}`) }}</p>

      <div class="actions">
        <button v-if="existing" type="button" class="delete" @click="onDelete">
          {{ $t(isConfirmingDelete ? 'goals.form.deleteConfirm' : 'goals.form.delete') }}
        </button>
        <span class="spacer" />
        <button type="button" class="cancel" @click="emit('close')">
          {{ $t('goals.form.cancel') }}
        </button>
        <button type="submit" class="save">
          {{ $t(existing ? 'goals.form.saveEdit' : 'goals.form.saveNew') }}
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
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 26px 28px;
  border: 3px solid var(--ink);
  border-radius: 32px;
  background: var(--paper);
  box-shadow: 0 10px 0 rgb(47 42 36 / 0.15);
}

.top {
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
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mute-2);
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
  border: 2.5px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-weight: 800;
  font-size: 14px;
}

.cat[aria-pressed='true'] {
  border-color: var(--ink);
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

.statuses {
  width: fit-content;
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 4px;
  border-radius: var(--radius-pill);
  background: var(--chip);
}

.statuses button {
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--mute-2);
  font-weight: 800;
  font-size: 14px;
}

.statuses button[aria-pressed='true'] {
  background: var(--accent);
  color: var(--paper);
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
