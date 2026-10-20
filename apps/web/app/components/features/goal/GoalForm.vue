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
          :aria-invalid="error === 'titleRequired' || error === 'titleTooLong'"
        />
      </Field>
      <Field :label="$t('goals.form.why')">
        <Input
          v-model="draft.why"
          multiline
          :maxlength="GOAL_WHY_MAX"
          :placeholder="$t('goals.form.whyPlaceholder')"
        />
      </Field>

      <Field :label="$t('goals.form.category')" is-group>
        <div class="cats">
          <Chip
            v-for="category in GOAL_CATEGORIES"
            :key="category"
            variant="pick"
            :active="draft.category === category"
            :style="{ '--chip-tint': `var(--cat-${category}-tint)` }"
            @click="draft.category = category"
          >
            <span
              class="dot"
              :style="{ background: `var(--cat-${category})` }"
              aria-hidden="true"
            />
            {{ $t(`goals.category.${category}`) }}
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
            :aria-invalid="error === 'dateOrder'"
          />
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
  </Modal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
</style>
