<script setup lang="ts">
import {
  GOAL_CATEGORY_COLORS,
  GOAL_CATEGORY_LABEL_MAX,
  GOAL_CATEGORY_PALETTE,
  type GoalCategoryColor,
} from '@improve-personal/core'

import type { SwatchOption } from '~/components/ui/SwatchPicker/index.vue'
import type { GoalCategoryActionError } from '~/composables/useGoalCategories'
import type { Goal } from '~/utils/goals'

import GoalCategoryRow from './GoalCategoryRow.vue'

/**
 * Modal "Kategori goal" (design v2): ganti nama, pilih warna, tambah, hapus.
 *
 * Semua tulisan lewat `useGoalCategories()` - modal tidak menyentuh storage sendiri. Daftar goal
 * dikirim pemanggil supaya peringatan "N goal bakal pindah ke General" memakai data yang sama dengan
 * halaman, bukan hitungan terpisah.
 */
const { goals } = defineProps<{ goals: readonly Goal[] }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const {
  categories,
  status,
  error: storageError,
  add,
  rename,
  setColor,
  remove,
} = useGoalCategories()

const draft = ref('')
const actionError = ref<GoalCategoryActionError | null>(null)
/** Draf label per kategori: rename ditulis saat Enter/blur, bukan tiap ketikan. */
const labels = ref<Record<string, string>>({})

watch(
  () => categories.value.map((entry) => [entry.key, entry.label] as const),
  (entries) => {
    const next: Record<string, string> = {}
    for (const [key, label] of entries) next[key] = labels.value[key] ?? label
    labels.value = next
  },
  { immediate: true },
)

const usage = computed(() => {
  const counts: Record<string, number> = {}
  for (const goal of goals) counts[goal.category] = (counts[goal.category] ?? 0) + 1
  return counts
})

const swatches = computed<SwatchOption<GoalCategoryColor>[]>(() =>
  GOAL_CATEGORY_COLORS.map((color) => ({
    value: color,
    color: GOAL_CATEGORY_PALETTE[color].accent,
    label: t(`goals.categories.color.${color}`),
  })),
)

const isReady = computed(() => status.value === 'ready')

function submit(): void {
  // Dibiarkan aktif walau kolom kosong: `add()` yang memberi tahu alasan "wajib diisi".
  if (!isReady.value) return
  const result = add(draft.value)
  if (result.ok) {
    draft.value = ''
    actionError.value = null
    return
  }
  actionError.value = result.reason
}

function commitLabel(key: string): void {
  const current = categories.value.find((entry) => entry.key === key)
  const next = labels.value[key]
  if (current === undefined || next === undefined) return
  if (next.trim() === current.label) {
    // Spasi tepi saja: rapikan tampilan tanpa memanggil tulis.
    labels.value[key] = current.label
    return
  }
  const result = rename(key, next)
  if (result.ok) {
    // `rename` menyimpan label yang sudah di-trim; samakan tampilan dengan yang tersimpan.
    labels.value[key] = next.trim()
    actionError.value = null
    return
  }
  actionError.value = result.reason
}

function changeColor(key: string, color: GoalCategoryColor): void {
  const result = setColor(key, color)
  actionError.value = result.ok ? null : result.reason
}

function deleteCategory(key: string): void {
  const result = remove(key)
  actionError.value = result.ok ? null : result.reason
}
</script>

<template>
  <Modal
    open
    align="top"
    width="520px"
    :title="$t('goals.categories.title')"
    is-dismissible
    @close="emit('close')"
  >
    <div class="manager">
      <p v-if="status !== 'ready'" class="note">{{ $t('goals.categories.loading') }}</p>

      <ul class="rows">
        <GoalCategoryRow
          v-for="entry in categories"
          :key="entry.key"
          :label="labels[entry.key] ?? entry.label"
          :category="entry"
          :used-count="usage[entry.key] ?? 0"
          :swatches="swatches"
          @update:label="(value) => (labels[entry.key] = value)"
          @commit="commitLabel(entry.key)"
          @set-color="(color) => changeColor(entry.key, color)"
          @remove="deleteCategory(entry.key)"
        />
      </ul>

      <form class="add" @submit.prevent="submit">
        <Field :label="$t('goals.categories.new')">
          <div class="add-row">
            <Input
              v-model="draft"
              class="draft"
              size="sm"
              :maxlength="GOAL_CATEGORY_LABEL_MAX"
              :placeholder="$t('goals.categories.placeholder')"
              :disabled="!isReady"
              @keydown.enter.prevent="submit"
            />
            <Button type="submit" variant="primary" size="sm" :disabled="!isReady">
              {{ $t('goals.categories.add') }}
            </Button>
          </div>
        </Field>
      </form>

      <p v-if="actionError" class="error" role="alert">
        {{ $t(`goals.categories.error.${actionError}`) }}
      </p>
      <p v-else-if="storageError" class="error" role="alert">{{ storageError }}</p>

      <p class="hint">{{ $t('goals.categories.generalHint') }}</p>
    </div>
  </Modal>
</template>

<style scoped>
.manager {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.add-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.draft {
  flex: 1;
}

.note,
.hint {
  font-weight: var(--fw-body);
  font-size: 13px;
  color: var(--mute);
}

.error {
  padding: 10px 14px;
  border-radius: calc(14px * var(--rk));
  background: #ffe1da;
  color: #9a2a14;
  font-weight: var(--fw-strong);
  font-size: 14px;
}
</style>
