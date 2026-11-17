<script setup lang="ts">
import {
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
const { categories } = useGoalCategories()

const { findGoal, save, remove, today } = useGoals()
const existing = findGoal(goalId)
const draft = ref<GoalDraft>(existing ? draftFromGoal(existing) : emptyGoalDraft(today.value))
const error = ref<GoalDraftError | null>(null)
const isConfirmingDelete = ref(false)

/** Pesan error tampil tepat di bawah kolom penyebabnya, bukan menumpuk di dekat tombol simpan. */
const ERROR_FIELD: Record<GoalDraftError, 'title' | 'why' | 'end' | 'chapters'> = {
  titleRequired: 'title',
  titleTooLong: 'title',
  whyTooLong: 'why',
  dateOrder: 'end',
  tooManyChapters: 'chapters',
  chapterTitle: 'chapters',
  chapterRange: 'chapters',
}
const errorField = computed(() => (error.value ? ERROR_FIELD[error.value] : null))
const errorId = useId()
const describedBy = (field: 'title' | 'why' | 'end'): string | undefined =>
  errorField.value === field ? errorId : undefined

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
</script>

<template>
  <Modal
    open
    align="top"
    width="640px"
    :title="$t(existing ? 'goals.form.editTitle' : 'goals.form.newTitle')"
    is-dismissible
    @close="emit('close')"
  >
    <form class="form" novalidate @submit.prevent="submit">
      <Field :label="$t('goals.form.title')">
        <Input
          v-model="draft.title"
          data-autofocus
          :maxlength="GOAL_TITLE_MAX"
          :placeholder="$t('goals.form.titlePlaceholder')"
          :aria-invalid="errorField === 'title'"
          :aria-describedby="describedBy('title')"
        />
        <p v-if="errorField === 'title'" :id="errorId" class="error" role="alert">
          {{ $t(`goals.form.error.${error}`) }}
        </p>
      </Field>
      <Field :label="$t('goals.form.why')">
        <Input
          v-model="draft.why"
          multiline
          :maxlength="GOAL_WHY_MAX"
          :placeholder="$t('goals.form.whyPlaceholder')"
          :aria-invalid="errorField === 'why'"
          :aria-describedby="describedBy('why')"
        />
        <p v-if="errorField === 'why'" :id="errorId" class="error" role="alert">
          {{ $t(`goals.form.error.${error}`) }}
        </p>
      </Field>

      <Field :label="$t('goals.form.category')" is-group>
        <div class="cats">
          <Chip
            v-for="option in categories"
            :key="option.key"
            variant="pick"
            :active="draft.category === option.key"
            :style="{ '--chip-tint': option.tint }"
            @click="draft.category = option.key"
          >
            <span class="dot" :style="{ background: option.accent }" aria-hidden="true" />
            {{ option.label }}
          </Chip>
        </div>
      </Field>

      <div class="dates">
        <Field :label="$t('goals.form.start')">
          <Input v-model="draft.start" type="date" />
        </Field>
        <Field :label="$t('goals.form.end')">
          <Input
            v-model="draft.end"
            type="date"
            :min="draft.start"
            :aria-invalid="errorField === 'end'"
            :aria-describedby="describedBy('end')"
          />
          <p v-if="errorField === 'end'" :id="errorId" class="error" role="alert">
            {{ $t(`goals.form.error.${error}`) }}
          </p>
        </Field>
      </div>

      <Field :label="$t('goals.form.status')" is-group>
        <Segmented
          v-model="draft.status"
          class="seg-fit"
          :options="statusOptions"
          :label="$t('goals.form.status')"
        />
      </Field>

      <GoalFormChapters
        :draft="draft"
        :error="errorField === 'chapters' ? error : null"
        :error-id="errorId"
        @change="(chapters) => (draft.chapters = chapters)"
      />

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
  </Modal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-18);
}

.cats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-8);
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.dates {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-12);
}

.seg-fit {
  width: fit-content;
}

.error {
  margin-top: var(--space-6);
  color: var(--danger);
  font-weight: var(--fw-strong);
  font-size: var(--fs-13);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-10);
}

.spacer {
  flex: 1;
}
</style>
