<script setup lang="ts">
import { goalPickerOptions, isSamePlace } from '~/utils/goals/links'

/**
 * Pemilih "Untuk goal" bersama untuk form task/habit/jadwal (PRD F13).
 *
 * Pilihan = Sepanjang goal + chapter, hanya dari goal berstatus aktif. Satu item hanya punya satu
 * tempat; memilih pilihan lain memindahkan tautan (bukan menambah).
 */
const { goalId = null, chapterId = null } = defineProps<{
  goalId?: string | null
  chapterId?: string | null
}>()
const emit = defineEmits<{
  select: [goalId: string, chapterId: string | null]
  clear: []
}>()

const { goals } = useGoals()
const options = computed(() => goalPickerOptions(goals.value))
const current = computed(() => ({ goalId, goalChapterId: chapterId }))
</script>

<template>
  <div class="pills">
    <Chip :active="goalId === null" @click="emit('clear')">{{ $t('goals.form.noGoal') }}</Chip>
    <Chip
      v-for="option in options"
      :key="`${option.goalId}:${option.chapterId ?? 'along'}`"
      :active="isSamePlace(current, option)"
      @click="emit('select', option.goalId, option.chapterId)"
    >
      {{ option.label }}
    </Chip>
  </div>
</template>

<style scoped>
.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
