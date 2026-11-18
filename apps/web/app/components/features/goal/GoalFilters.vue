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
/** Sumber opsi = katalog tersimpan, bukan enum: kategori buatan user ikut tampil. */
const allOption = computed(() => ({
  key: 'semua' as const,
  label: t('goals.allCategories'),
  accent: 'var(--ink)',
}))
const categoryOptions = computed(() => [
  allOption.value,
  ...categories.value.map((entry) => ({
    key: entry.key,
    label: entry.label,
    accent: entry.accent,
  })),
])
/** Kategori aktif yang sudah dihapus dari katalog jatuh ke "Semua" supaya tombol tidak kosong. */
const selected = computed(
  () => categoryOptions.value.find((option) => option.key === category.value) ?? allOption.value,
)

const root = useTemplateRef<HTMLElement>('root')
const isOpen = ref(false)
useDismiss(root, isOpen)

function pick(key: GoalCategoryFilter): void {
  category.value = key
  isOpen.value = false
}

function manage(): void {
  isOpen.value = false
  emit('manage')
}
</script>

<template>
  <div class="filters">
    <Segmented
      v-model="status"
      class="status"
      :options="statusOptions"
      :label="$t('goals.filterStatus')"
      size="sm"
      framed
    />

    <div ref="root" class="category">
      <button
        type="button"
        class="trigger"
        :aria-label="`${$t('goals.filterCategory')}: ${selected.label}`"
        :aria-expanded="isOpen"
        aria-haspopup="menu"
        aria-controls="goal-category-menu"
        @click="isOpen = !isOpen"
      >
        <span class="dot" :style="{ background: selected.accent }" aria-hidden="true" />
        <span class="value">{{ selected.label }}</span>
        <Icon name="chevron-down" :size="16" class="chevron" :class="{ open: isOpen }" />
      </button>

      <div v-if="isOpen" id="goal-category-menu" class="menu" role="menu">
        <button
          v-for="option in categoryOptions"
          :key="option.key"
          type="button"
          class="item"
          role="menuitemradio"
          :aria-checked="category === option.key"
          @click="pick(option.key)"
        >
          <span class="dot" :style="{ background: option.accent }" aria-hidden="true" />
          <span class="value">{{ option.label }}</span>
          <Icon v-if="category === option.key" name="check" :size="16" class="check" />
        </button>
        <hr class="divider" />
        <button type="button" class="item manage" role="menuitem" @click="manage">
          <Icon name="pencil" :size="16" />
          {{ $t('goals.manageCategories') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
}

/* Ponsel: status digeser horizontal, bukan patah jadi dua baris. */
.status {
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

.category {
  position: relative;
}

.trigger {
  height: 38px;
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: 0 var(--space-12) 0 var(--space-14);
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-weight: var(--fw-strong);
  font-size: var(--fs-13);
  white-space: nowrap;
}

.trigger:hover {
  background: var(--hover);
}

.chevron {
  color: var(--mute-2);
  transition: transform 0.15s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .chevron {
    transition: none;
  }
}

.menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 80;
  width: 240px;
  max-width: calc(100vw - 32px);
  max-height: min(360px, calc(100dvh - 160px));
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  padding: var(--space-6);
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-card);
  background: var(--paper);
  box-shadow: var(--shadow-ring);
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-10);
  min-height: 36px;
  padding: var(--space-6) var(--space-10);
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--ink);
  font-family: var(--font-body);
  font-weight: var(--fw-strong);
  font-size: var(--fs-14);
  text-align: left;
}

.item:hover,
.item[aria-checked='true'] {
  background: var(--hover);
}

.value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.check {
  color: var(--accent);
}

.divider {
  margin: var(--space-6) var(--space-4);
  border: none;
  border-top: var(--border-thin) dashed var(--dash-2);
}

.manage {
  color: var(--accent);
}

.dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
}
</style>
