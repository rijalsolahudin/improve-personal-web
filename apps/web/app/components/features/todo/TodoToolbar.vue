<script setup lang="ts">
import type { SegmentedOption } from '~/components/ui/Segmented/index.vue'
import {
  TASK_FILTERS,
  TASK_SORTS,
  type TaskFilter,
  type TaskSort,
} from '@improve-personal/core/planner'

const { counts } = defineProps<{ counts: Record<TaskFilter, number> }>()
const filter = defineModel<TaskFilter>('filter', { required: true })
const sort = defineModel<TaskSort>('sort', { required: true })

const { t } = useI18n()
const filterOptions = computed<SegmentedOption<TaskFilter>[]>(() =>
  TASK_FILTERS.map((value) => ({ value, label: `${t(`todo.filter.${value}`)} ${counts[value]}` })),
)
const sortOptions = computed<SegmentedOption<TaskSort>[]>(() =>
  TASK_SORTS.map((value) => ({ value, label: t(`todo.sort.${value}`) })),
)
</script>

<template>
  <div class="toolbar">
    <Segmented
      v-model="filter"
      class="filters"
      :options="filterOptions"
      :label="$t('todo.filterLabel')"
      framed
    />
    <div class="sort">
      <span class="sort-label" aria-hidden="true">{{ $t('todo.sortLabel') }}</span>
      <Segmented v-model="sort" :options="sortOptions" :label="$t('todo.sortLabel')" framed />
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
}

/* Filter bisa digeser horizontal di layar sempit (design). */
.filters {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

.sort {
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

/* Design: grup pill padding 3/gap 2 (default Segmented 4/4) & opsi 7x14 (default 8x14).
   Selektor diberi awalan `.toolbar` supaya menang atas style Segmented sendiri. */
.toolbar .filters,
.toolbar .sort :deep(.segmented) {
  padding: 3px;
  gap: 2px;
}

.toolbar .filters :deep(.option),
.toolbar .sort :deep(.option) {
  padding: var(--space-8) var(--space-14);
}

.sort-label {
  font-weight: var(--fw-strong);
  font-size: var(--fs-13);
  color: var(--mute);
}
</style>
