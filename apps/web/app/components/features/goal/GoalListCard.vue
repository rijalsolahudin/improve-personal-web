<script setup lang="ts">
import { GOAL_STATUS_TONE, goalProgress, needsReview, type Goal } from '~/utils/goals'
import type { GoalCategoryView } from '~/utils/goals/categories'
import { fromIsoDate } from '~/utils/time'

const { goal, today, isSelected, category } = defineProps<{
  goal: Goal
  today: string
  isSelected: boolean
  /** Kategori goal yang sudah di-resolve dari katalog; warna & label dipakai kartu ini. */
  category: GoalCategoryView
}>()
defineEmits<{ select: [] }>()

const { dayMonthYear } = useDateFormat()
const progress = computed(() => goalProgress(goal))
/** Daftar cukup bilangan bulat; desimal ("33.3%") hanya menambah lebar tanpa info berarti. */
const progressLabel = computed(() => Math.round(progress.value))
const isReview = computed(() => needsReview(goal, today))
/** Status "aktif" adalah keadaan normal - chip-nya cuma menambah bising (design v2). */
const hasChips = computed(() => goal.status !== 'aktif' || isReview.value)
const palette = computed(() => ({
  '--goal-solid': category.accent,
  '--goal-tint': category.tint,
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
      <GoalCoverTile :cover="goal.cover" :category="category" />
      <span class="text">
        <span class="title">{{ goal.title }}</span>
        <span class="meta">
          {{ category.label }} ·
          {{ $t('goals.target', { date: dayMonthYear(fromIsoDate(goal.end).getTime()) }) }}
        </span>
      </span>
    </span>
    <!-- Persentase di baris progress, bukan di baris judul: kolom daftar sempit, dan angka di
         samping judul dulu memeras judul jadi satu kata per baris. -->
    <span class="progress">
      <ProgressBar class="bar" :pct="progress" color="var(--goal-solid)" track="var(--chip)" />
      <span class="pct">{{ progressLabel }}%</span>
    </span>
    <span v-if="hasChips" class="chips">
      <GoalChip v-if="goal.status !== 'aktif'" :tone="GOAL_STATUS_TONE[goal.status]">{{
        $t(`goals.status.${goal.status}`)
      }}</GoalChip>
      <GoalChip v-if="isReview" tone="red">{{ $t('goals.needsReview') }}</GoalChip>
    </span>
  </button>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
  width: 100%;
  padding: var(--space-14) var(--space-16);
  border: var(--border-thin) solid var(--line);
  border-radius: calc(22px * var(--rk));
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
  gap: var(--space-12);
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
  font-size: var(--fs-display-18);
  line-height: 1.15;
  text-wrap: balance;
}

.meta {
  font-weight: var(--fw-body);
  font-size: var(--fs-13);
  color: var(--mute);
}

.progress {
  display: flex;
  align-items: center;
  gap: var(--space-10);
}

.bar {
  flex: 1;
}

.pct {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-15);
  font-variant-numeric: tabular-nums;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6);
}
</style>
