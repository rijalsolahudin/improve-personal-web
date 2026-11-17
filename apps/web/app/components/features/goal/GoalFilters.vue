<script setup lang="ts">
import type { SegmentedOption } from '~/components/ui/Segmented/index.vue'
import type { GoalCategory, GoalStatus } from '~/utils/goals'

export type GoalStatusFilter = GoalStatus | 'semua'
export type GoalCategoryFilter = GoalCategory | 'semua'

const status = defineModel<GoalStatusFilter>('status', { required: true })
const category = defineModel<GoalCategoryFilter>('category', { required: true })
const emit = defineEmits<{ manage: [] }>()

const { t } = useI18n()
const { categories } = useGoalCategories()
const STATUS_FILTERS = ['aktif', 'selesai', 'ditunda', 'dibatalkan', 'semua'] as const
const statusOptions = computed<SegmentedOption<GoalStatusFilter>[]>(() =>
  STATUS_FILTERS.map((value) => ({ value, label: t(`goals.status.${value}`) })),
)
/** Sumber chip = katalog tersimpan, bukan enum: kategori buatan user ikut tampil. */
const categoryOptions = computed(() => [
  { key: 'semua' as const, label: t('goals.allCategories'), accent: 'var(--ink)' },
  ...categories.value.map((entry) => ({
    key: entry.key,
    label: entry.label,
    accent: entry.accent,
  })),
])
</script>

<template>
  <div class="filters">
    <div class="row">
      <span class="label">{{ $t('goals.form.status') }}</span>
      <Segmented
        v-model="status"
        :options="statusOptions"
        :label="$t('goals.filterStatus')"
        framed
      />
    </div>
    <div class="row">
      <span class="label">{{ $t('goals.form.category') }}</span>
      <div class="cats" role="group" :aria-label="$t('goals.filterCategory')">
        <Chip
          v-for="option in categoryOptions"
          :key="option.key"
          variant="pick"
          :active="category === option.key"
          @click="category = option.key"
        >
          <span class="dot" :style="{ background: option.accent }" aria-hidden="true" />
          {{ option.label }}
        </Chip>
        <button type="button" class="manage" @click="emit('manage')">
          {{ $t('goals.manageCategories') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-12);
}

.label {
  width: 72px;
  flex-shrink: 0;
  font-weight: var(--fw-strong);
  font-size: var(--fs-13);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mute-2);
}

@media (max-width: 599px) {
  .label {
    width: 100%;
  }
}

.filters :deep(.segmented) {
  flex-wrap: wrap;
  gap: 2px;
}

/* Opsi segmented design: padding 8px 16px (default komponen 8px 14px). */
.filters :deep(.segmented .option) {
  padding: var(--space-8) var(--space-16);
}

.cats {
  --chip-bg: transparent;
  --chip-line: transparent;
  --chip-tint: var(--paper);

  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-6);
}

/* Chip kategori design: 7px 12px / 13,5px, garis hanya saat aktif. */
.cats :deep(.chip-pick) {
  min-height: 0;
  padding: var(--space-8) var(--space-12);
  font-size: var(--fs-14);
}

.manage {
  padding: var(--space-8) var(--space-12);
  border: var(--border-thin) dashed var(--dash-2);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--accent);
  font-family: var(--font-body);
  font-weight: var(--fw-strong);
  font-size: var(--fs-14);
  white-space: nowrap;
}

.manage:hover {
  border-color: var(--accent);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
</style>
