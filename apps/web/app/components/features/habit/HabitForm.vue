<script setup lang="ts">
import {
  HABIT_COLORS,
  HABIT_ICONS,
  HABIT_NAME_MAX,
  HABIT_TARGET_MAX,
  draftFromHabit,
  emptyHabitDraft,
  type HabitDraft,
  type HabitDraftError,
} from '~/utils/habits'
import { WEEKDAY_ORDER } from '~/utils/schedule'

/** Modal habit baru / edit (design: "Habit baru" / "Edit habit"). */
const { habitId } = defineProps<{ habitId: string | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const DEFAULT_CUSTOM_DAYS = [1, 3, 5]

const { t } = useI18n()
const { findHabit, save, remove } = useHabits()
const { goals } = useGoals()
const { rememberSticker } = useDeco()
const { weekdayOfIndex } = useDateFormat()

const existing = findHabit(habitId)
const draft = ref<HabitDraft>(existing ? draftFromHabit(existing) : emptyHabitDraft())
const error = ref<HabitDraftError | null>(null)
const isConfirmingDelete = ref(false)
const isPickingSticker = ref(false)

watch(draft, () => (error.value = null), { deep: true })

const activeGoals = computed(() => goals.value.filter((goal) => goal.status === 'aktif'))
const soft = computed(() => (HABIT_COLORS[draft.value.color] ?? HABIT_COLORS[0])[1])
const colorOptions = computed(() =>
  HABIT_COLORS.map(([solid], index) => ({
    value: index,
    color: solid,
    label: t('habit.form.colorN', { n: index + 1 }),
  })),
)

function toggleDay(day: number): void {
  const days = draft.value.days ?? []
  draft.value.days = days.includes(day) ? days.filter((d) => d !== day) : [...days, day]
}

function onSticker(sid: string): void {
  rememberSticker(sid)
  draft.value.sticker = sid
  isPickingSticker.value = false
}

function submit(): void {
  const result = save(draft.value, existing?.id ?? null)
  if ('error' in result) error.value = result.error
  else emit('saved')
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
    :title="$t(existing ? 'habit.form.editTitle' : 'habit.form.newTitle')"
    is-dismissible
    @close="emit('close')"
  >
    <form class="form" novalidate :style="{ '--h-soft': soft }" @submit.prevent="submit">
      <Field :label="$t('habit.form.name')">
        <Input
          v-model="draft.name"
          data-autofocus
          :maxlength="HABIT_NAME_MAX"
          :placeholder="$t('habit.form.namePlaceholder')"
          :aria-invalid="error === 'nameRequired' || error === 'nameTooLong'"
        />
      </Field>

      <Field :label="$t('habit.form.iconColor')" is-group>
        <div class="icons">
          <OptionTile
            v-for="icon in HABIT_ICONS"
            :key="icon"
            :size="40"
            tint="var(--h-soft)"
            :active="!draft.sticker && draft.icon === icon"
            :aria-label="$t('habit.form.iconN', { icon: $t(`habit.icons.${icon}`) })"
            @click="((draft.icon = icon), (draft.sticker = null))"
          >
            <Icon :name="icon" :size="20" />
          </OptionTile>
        </div>
        <DecoStickerButton
          :sticker="draft.sticker"
          :label="$t(draft.sticker ? 'habit.form.changeSticker' : 'habit.form.useSticker')"
          @click="isPickingSticker = true"
        />
        <SwatchPicker v-model="draft.color" class="colors" :options="colorOptions" />
      </Field>

      <Field :label="$t('habit.form.frequency')" is-group>
        <div class="pills">
          <Chip :active="draft.days === null" @click="draft.days = null">
            {{ $t('habit.everyDay') }}
          </Chip>
          <Chip
            :active="draft.days !== null"
            @click="draft.days = draft.days ?? [...DEFAULT_CUSTOM_DAYS]"
          >
            {{ $t('habit.form.someDays') }}
          </Chip>
        </div>
        <div v-if="draft.days" class="pills days">
          <Chip
            v-for="day in WEEKDAY_ORDER"
            :key="day"
            :active="draft.days.includes(day)"
            @click="toggleDay(day)"
          >
            {{ weekdayOfIndex(day) }}
          </Chip>
        </div>
      </Field>

      <Field :label="$t('habit.form.target')" is-group>
        <div class="stepper">
          <IconButton
            tone="plain"
            :size="40"
            :radius="13"
            :disabled="draft.target <= 1"
            :title="$t('habit.form.targetLess')"
            @click="draft.target -= 1"
          >
            −
          </IconButton>
          <span class="target" aria-live="polite">{{ draft.target }}x</span>
          <IconButton
            tone="plain"
            :size="40"
            :radius="13"
            :disabled="draft.target >= HABIT_TARGET_MAX"
            :title="$t('habit.form.targetMore')"
            @click="draft.target += 1"
          >
            +
          </IconButton>
        </div>
      </Field>

      <Field :label="$t('habit.form.goal')" is-group>
        <div class="pills wrap">
          <Chip :active="draft.goalId === null" @click="draft.goalId = null">
            {{ $t('habit.form.noGoal') }}
          </Chip>
          <Chip
            v-for="goal in activeGoals"
            :key="goal.id"
            :active="draft.goalId === goal.id"
            @click="draft.goalId = goal.id"
          >
            {{ goal.title }}
          </Chip>
        </div>
      </Field>

      <p v-if="error" class="error" role="alert">{{ $t(`habit.form.error.${error}`) }}</p>

      <div class="actions">
        <Button v-if="existing" variant="danger" @click="onDelete">
          {{ $t(isConfirmingDelete ? 'habit.form.deleteConfirm' : 'habit.form.delete') }}
        </Button>
        <span class="spacer" />
        <Button variant="soft" @click="emit('close')">{{ $t('habit.form.cancel') }}</Button>
        <Button type="submit" variant="primary">
          {{ $t(existing ? 'habit.form.saveEdit' : 'habit.form.saveNew') }}
        </Button>
      </div>
    </form>
    <LazyDecoPicker
      v-if="isPickingSticker"
      :title="$t('habit.form.stickerTitle')"
      :current="draft.sticker"
      :clear-label="draft.sticker ? $t('habit.form.removeSticker') : null"
      @choose="onSticker"
      @clear="((draft.sticker = null), (isPickingSticker = false))"
      @close="isPickingSticker = false"
    />
  </Modal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.icons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.colors {
  margin-top: 10px;
}

.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pills.days {
  margin-top: 10px;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.target {
  min-width: 60px;
  text-align: center;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 22px;
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
