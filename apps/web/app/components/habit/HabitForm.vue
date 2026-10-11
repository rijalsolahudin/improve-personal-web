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

const { findHabit, save, remove } = useHabits()
const { goals } = useGoals()
const { rememberSticker } = useDeco()
const { weekdayOfIndex } = useDateFormat()

const existing = findHabit(habitId)
const draft = ref<HabitDraft>(existing ? draftFromHabit(existing) : emptyHabitDraft())
const error = ref<HabitDraftError | null>(null)
const isConfirmingDelete = ref(false)
const isPickingSticker = ref(false)
const panel = useTemplateRef<HTMLElement>('panel')

watch(draft, () => (error.value = null), { deep: true })

const activeGoals = computed(() => goals.value.filter((goal) => goal.status === 'aktif'))
const soft = computed(() => (HABIT_COLORS[draft.value.color] ?? HABIT_COLORS[0])[1])

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

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !isPickingSticker.value) emit('close')
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
      aria-labelledby="habit-form-title"
      novalidate
      :style="{ '--h-soft': soft }"
      @submit.prevent="submit"
    >
      <div class="top">
        <h2 id="habit-form-title" class="heading">
          {{ $t(existing ? 'habit.form.editTitle' : 'habit.form.newTitle') }}
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
        <span class="label">{{ $t('habit.form.name') }}</span>
        <input
          v-model="draft.name"
          class="field"
          :maxlength="HABIT_NAME_MAX"
          :placeholder="$t('habit.form.namePlaceholder')"
          :aria-invalid="error === 'nameRequired' || error === 'nameTooLong'"
        />
      </label>

      <fieldset class="group">
        <legend class="label">{{ $t('habit.form.iconColor') }}</legend>
        <div class="icons">
          <button
            v-for="icon in HABIT_ICONS"
            :key="icon"
            type="button"
            class="icon"
            :aria-pressed="!draft.sticker && draft.icon === icon"
            :aria-label="$t('habit.form.iconN', { icon })"
            @click="((draft.icon = icon), (draft.sticker = null))"
          >
            {{ icon }}
          </button>
        </div>
        <button
          type="button"
          class="sticker-btn"
          :class="{ on: draft.sticker }"
          @click="isPickingSticker = true"
        >
          <LazyDecoStickerArt v-if="draft.sticker" :sid="draft.sticker" :size="32" />
          <span v-else class="sticker-empty" aria-hidden="true">✿</span>
          {{ $t(draft.sticker ? 'habit.form.changeSticker' : 'habit.form.useSticker') }}
        </button>
        <div class="colors">
          <button
            v-for="([solid], index) in HABIT_COLORS"
            :key="solid"
            type="button"
            class="swatch"
            :style="{ background: solid }"
            :aria-pressed="draft.color === index"
            :aria-label="$t('habit.form.colorN', { n: index + 1 })"
            @click="draft.color = index"
          />
        </div>
      </fieldset>

      <fieldset class="group">
        <legend class="label">{{ $t('habit.form.frequency') }}</legend>
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
      </fieldset>

      <div class="field-wrap">
        <span class="label">{{ $t('habit.form.target') }}</span>
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
      </div>

      <fieldset class="group">
        <legend class="label">{{ $t('habit.form.goal') }}</legend>
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
      </fieldset>

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

.field[aria-invalid='true'] {
  border-color: #e2445c;
}

.icons,
.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.icon {
  width: 40px;
  height: 40px;
  border: 2.5px solid var(--line);
  border-radius: 13px;
  background: var(--paper);
  font-weight: 800;
  font-size: 16px;
}

.icon[aria-pressed='true'] {
  border-color: var(--ink);
  background: var(--h-soft);
}

.sticker-btn {
  width: fit-content;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 5px 14px 5px 5px;
  border: 2.5px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-weight: 800;
  font-size: 13px;
}

.sticker-btn.on {
  border-color: var(--ink);
}

.sticker-empty {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--dash-2);
  border-radius: 10px;
  color: var(--mute-3);
}

.colors {
  gap: 8px;
  margin-top: 10px;
}

.swatch {
  width: 32px;
  height: 32px;
  border: 3px solid transparent;
  border-radius: 11px;
}

.swatch[aria-pressed='true'] {
  border-color: var(--ink);
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
  font-weight: 800;
  font-size: 22px;
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

@media (max-width: 599px) {
  .scrim {
    padding: 16px 10px;
  }

  .panel {
    padding: 20px 18px;
  }
}
</style>
