<script setup lang="ts">
import { GOAL_STATUS_TONE, goalProgress, needsReview, type Goal } from '~/utils/goals'
import { fromIsoDate } from '~/utils/time'

const { goal, today, isSelected } = defineProps<{
  goal: Goal
  today: string
  isSelected: boolean
}>()
defineEmits<{ select: [] }>()

const { dayMonthYear } = useDateFormat()
const progress = computed(() => goalProgress(goal))
const palette = computed(() => ({
  '--goal-solid': `var(--cat-${goal.category})`,
  '--goal-tint': `var(--cat-${goal.category}-tint)`,
}))
</script>

<template>
  <button
    type="button"
    class="card"
    :class="{ selected: isSelected }"
    :style="palette"
    :aria-pressed="isSelected"
    @click="$emit('select')"
  >
    <span class="row">
      <GoalCoverTile :cover="goal.cover" :category="goal.category" />
      <span class="text">
        <span class="title">{{ goal.title }}</span>
        <span class="meta">
          {{ $t(`goals.category.${goal.category}`) }} ·
          {{ $t('goals.target', { date: dayMonthYear(fromIsoDate(goal.end).getTime()) }) }}
        </span>
      </span>
      <span class="pct">{{ progress }}%</span>
    </span>
    <ProgressBar class="bar" :pct="progress" color="var(--goal-solid)" track="var(--chip)" />
    <span class="chips">
      <GoalChip :tone="GOAL_STATUS_TONE[goal.status]">{{
        $t(`goals.status.${goal.status}`)
      }}</GoalChip>
      <GoalChip v-if="needsReview(goal, today)" tone="red">{{ $t('goals.needsReview') }}</GoalChip>
    </span>
  </button>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  padding: 16px 18px;
  border: var(--border) solid var(--line);
  border-radius: var(--radius-sticker);
  background: var(--paper);
  text-align: left;
}

.card.selected {
  border-color: var(--outline);
  background: var(--goal-tint);
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 18px;
  line-height: 1.15;
}

.meta {
  font-weight: var(--fw-body);
  font-size: 13px;
  color: var(--mute);
}

.pct {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 20px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
