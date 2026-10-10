<script setup lang="ts">
import type { SegmentedOption } from '~/components/ui/UiSegmented.vue'
import { TASK_FILTERS, TASK_SORTS, type TaskFilter, type TaskSort } from '~/utils/tasks'

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
    <UiSegmented
      v-model="filter"
      class="filters"
      :options="filterOptions"
      :label="$t('todo.filterLabel')"
      framed
    />
    <div class="sort">
      <span class="sort-label" aria-hidden="true">{{ $t('todo.sortLabel') }}</span>
      <UiSegmented v-model="sort" :options="sortOptions" :label="$t('todo.sortLabel')" framed />
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* Filter bisa digeser horizontal di layar sempit (design). */
.filters {
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

.sort {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-label {
  font-weight: 800;
  font-size: 13px;
  color: var(--mute);
}
</style>
