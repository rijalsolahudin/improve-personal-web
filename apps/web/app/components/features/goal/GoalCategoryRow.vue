<script setup lang="ts">
import {
  GENERAL_GOAL_CATEGORY_KEY,
  GOAL_CATEGORY_LABEL_MAX,
  type GoalCategoryColor,
} from '@improve-personal/core'

import type { SwatchOption } from '~/components/ui/SwatchPicker/index.vue'
import type { GoalCategoryView } from '~/utils/goals/categories'

/** Satu baris modal "Kategori goal": label bisa diganti, warna bisa dipilih, hapus minta konfirmasi. */
const { category, usedCount, swatches } = defineProps<{
  category: GoalCategoryView
  /** Jumlah goal yang masih memakai kategori ini - menentukan teks peringatan hapus. */
  usedCount: number
  swatches: readonly SwatchOption<GoalCategoryColor>[]
}>()

const label = defineModel<string>('label', { required: true })
const emit = defineEmits<{ commit: []; 'set-color': [color: GoalCategoryColor]; remove: [] }>()

const isDefault = computed(() => category.key === GENERAL_GOAL_CATEGORY_KEY)
const isConfirming = ref(false)

// Baris dipakai ulang saat daftar berubah; konfirmasi hapus tidak boleh terbawa ke kategori lain.
watch(
  () => category.key,
  () => (isConfirming.value = false),
)

function requestRemove(): void {
  if (isDefault.value) return
  // Kategori kosong langsung dihapus; yang masih dipakai goal minta konfirmasi dulu.
  if (usedCount === 0 || isConfirming.value) {
    isConfirming.value = false
    emit('remove')
    return
  }
  isConfirming.value = true
}
</script>

<template>
  <li class="category">
    <div class="row">
      <span class="dot" :style="{ background: category.accent }" aria-hidden="true" />
      <Input
        v-model="label"
        class="name"
        size="sm"
        variant="subtle"
        :maxlength="GOAL_CATEGORY_LABEL_MAX"
        :aria-label="$t('goals.categories.rename', { label: category.label })"
        @keydown.enter.prevent="emit('commit')"
        @blur="emit('commit')"
      />
      <span v-if="usedCount" class="usage">
        {{ $t('goals.categories.usage', { n: usedCount }) }}
      </span>
      <span v-if="isDefault" class="badge">{{ $t('goals.categories.default') }}</span>
      <Button
        v-else
        variant="link-danger"
        size="sm"
        :aria-label="$t('goals.categories.remove', { label: category.label })"
        @click="requestRemove"
      >
        {{ $t('goals.categories.removeAction') }}
      </Button>
    </div>

    <div v-if="isConfirming" class="confirm">
      <span class="warning">
        {{ $t('goals.categories.moveWarning', { n: usedCount }) }}
      </span>
      <Button variant="paper" size="sm" @click="isConfirming = false">
        {{ $t('goals.categories.cancel') }}
      </Button>
      <Button variant="danger" size="sm" @click="emit('remove')">
        {{ $t('goals.categories.confirmRemove') }}
      </Button>
    </div>

    <SwatchPicker
      class="swatches"
      :model-value="category.color"
      :options="swatches"
      :size="22"
      @update:model-value="emit('set-color', $event)"
    />
  </li>
</template>

<style scoped>
.category {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0;
  border-top: var(--border-thin) dashed var(--line-2);
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dot {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border-radius: 5px 5px 5px 2px;
}

.name {
  flex: 1;
  font-weight: var(--fw-strong);
  font-size: 16px;
}

.usage {
  flex-shrink: 0;
  font-weight: var(--fw-body);
  font-size: 12.5px;
  color: var(--mute);
  white-space: nowrap;
}

.badge {
  flex-shrink: 0;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  background: var(--chip);
  color: var(--ink-2);
  font-weight: var(--fw-strong);
  font-size: 12px;
  white-space: nowrap;
}

.confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: calc(14px * var(--rk));
  background: #ffe9e3;
}

.warning {
  flex: 1 1 200px;
  font-weight: var(--fw-strong);
  font-size: 13.5px;
  color: #9a2a14;
}

.swatches {
  padding-left: 24px;
}
</style>
