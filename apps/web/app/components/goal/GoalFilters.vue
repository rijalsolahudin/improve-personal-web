<script setup lang="ts">
import type { SegmentedOption } from '~/components/ui/UiSegmented.vue'
import { GOAL_CATEGORIES, type GoalCategory, type GoalStatus } from '~/utils/goals'

export type GoalStatusFilter = GoalStatus | 'semua'
export type GoalCategoryFilter = GoalCategory | 'semua'

const status = defineModel<GoalStatusFilter>('status', { required: true })
const category = defineModel<GoalCategoryFilter>('category', { required: true })

const { t } = useI18n()
const STATUS_FILTERS = ['aktif', 'selesai', 'ditunda', 'semua'] as const
const statusOptions = computed<SegmentedOption<GoalStatusFilter>[]>(() =>
  STATUS_FILTERS.map((value) => ({ value, label: t(`goals.status.${value}`) })),
)
const categories = ['semua', ...GOAL_CATEGORIES] as const
</script>

<template>
  <div class="filters">
    <UiSegmented
      v-model="status"
      :options="statusOptions"
      :label="$t('goals.filterStatus')"
      framed
    />
    <div class="cats" role="group" :aria-label="$t('goals.filterCategory')">
      <button
        v-for="value in categories"
        :key="value"
        type="button"
        class="cat"
        :aria-pressed="category === value"
        @click="category = value"
      >
        <span
          class="dot"
          :style="{ background: value === 'semua' ? 'var(--ink)' : `var(--cat-${value})` }"
          aria-hidden="true"
        />
        {{ value === 'semua' ? $t('goals.allCategories') : $t(`goals.category.${value}`) }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.filters :deep(.segmented) {
  flex-wrap: wrap;
}

.cats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cat {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 2px solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  font-weight: 800;
  font-size: 14px;
}

.cat[aria-pressed='true'] {
  border-color: var(--ink);
  background: var(--paper);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
</style>
