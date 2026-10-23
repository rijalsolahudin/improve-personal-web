<script setup lang="ts">
/**
 * Chip `#goal` di entri jurnal; klik → detail goal.
 *
 * Goal terhapus tetap aman: chip jadi label redup tanpa navigasi (soft ref `goal_link`/mention).
 */
const { goalId } = defineProps<{ goalId: string }>()

const { findGoal } = useGoals()
const goal = computed(() => findGoal(goalId))

async function open(): Promise<void> {
  if (!goal.value) return
  await navigateTo({ path: getFeature('goals').path, query: { id: goal.value.id } })
}
</script>

<template>
  <button
    v-if="goal"
    type="button"
    class="mention"
    :title="$t('memo.openGoal')"
    @click="open"
    v-text="`#${goal.title}`"
  />
  <span
    v-else
    class="mention deleted"
    :title="$t('memo.deletedGoalHint')"
    v-text="`#${$t('memo.deletedGoal')}`"
  />
</template>

<style scoped>
.mention {
  display: inline;
  padding: 0 3px;
  border: none;
  background: linear-gradient(
    transparent 45%,
    var(--cat-karier-tint) 45%,
    var(--cat-karier-tint) 92%,
    transparent 92%
  );
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}

.deleted {
  color: var(--mute);
  cursor: default;
}
</style>
